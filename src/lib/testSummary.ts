import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachAthlete } from "@/types";
import { canonicalMetricKey, computeAllFamiliesInsights, buildVerdict, type MetricKey, type Verdict } from "@/lib/testNorms";

/* "Dernier test" par athlète, pour l'afficher même carte repliée sur /coach/athletes (inspiré d'un
   POC UX fourni par Gildas — badge visible sans avoir à déplier). Fusionne les 2 sources comme
   TestsPanel/testResults.ts : ce que le coach a lui-même enregistré (owner_id=coach) et ce qu'un
   vrai sportif lié a enregistré lui-même (owner_id=sportif) — mais en une seule passe batchée pour
   tout le roster (pas un fetch par athlète), via le client admin déjà utilisé par
   getAthletesSignatures pour la même raison (RLS bloque la lecture cross-owner). */

export interface LastTestSummary {
  name: string;
  value: number;
  unit: string;
  date: string;
  /* null = premier résultat jamais enregistré pour ce test, rien à comparer. */
  deltaPct: number | null;
  /* "Amélioration" tient compte du sens de l'unité (temps : plus bas = mieux ; le reste : plus haut
     = mieux) — heuristique simple faute de métadonnée de sens par test dans le schéma actuel. */
  improved: boolean | null;
}

export type LastTestByAthlete = Record<string, LastTestSummary | null>;

const TIME_UNITS = new Set(["s", "min"]);

export async function getAthletesLastTests(
  admin: SupabaseClient,
  coachId: string,
  athletes: CoachAthlete[]
): Promise<LastTestByAthlete> {
  const athleteIds = athletes.map(a => a.id);
  const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id as string);

  const [{ data: coachTests }, { data: coachResults }, { data: athleteTests }, { data: athleteResults }] = await Promise.all([
    admin.from("tests").select("id,name,unit").eq("owner_id", coachId),
    athleteIds.length
      ? admin.from("test_results").select("test_id,date,value,unit,subject_coach_athlete_id").in("subject_coach_athlete_id", athleteIds)
      : Promise.resolve({ data: [] as { test_id: string; date: string; value: number; unit: string; subject_coach_athlete_id: string }[] }),
    realUserIds.length
      ? admin.from("tests").select("id,name,unit").in("owner_id", realUserIds)
      : Promise.resolve({ data: [] as { id: string; name: string; unit: string }[] }),
    realUserIds.length
      ? admin.from("test_results").select("test_id,date,value,unit,subject_user_id").in("subject_user_id", realUserIds)
      : Promise.resolve({ data: [] as { test_id: string; date: string; value: number; unit: string; subject_user_id: string }[] }),
  ]);

  const testMeta = new Map<string, { name: string; unit: string }>();
  (coachTests ?? []).forEach(t => testMeta.set(t.id, { name: t.name, unit: t.unit }));
  (athleteTests ?? []).forEach(t => testMeta.set(t.id, { name: t.name, unit: t.unit }));

  type Row = { test_id: string; date: string; value: number };
  const rowsByAthlete = new Map<string, Row[]>();
  function push(athleteId: string | undefined, r: { test_id: string; date: string; value: number }) {
    if (!athleteId) return;
    if (!rowsByAthlete.has(athleteId)) rowsByAthlete.set(athleteId, []);
    rowsByAthlete.get(athleteId)!.push({ test_id: r.test_id, date: r.date, value: Number(r.value) });
  }
  (coachResults ?? []).forEach(r => push(r.subject_coach_athlete_id, r));
  const athleteIdByUserId = new Map(athletes.filter(a => a.user_id).map(a => [a.user_id as string, a.id]));
  (athleteResults ?? []).forEach(r => push(athleteIdByUserId.get(r.subject_user_id), r));

  const out: LastTestByAthlete = {};
  for (const a of athletes) {
    const rows = (rowsByAthlete.get(a.id) ?? []).sort((x, y) => y.date.localeCompare(x.date));
    if (rows.length === 0) { out[a.id] = null; continue; }
    const last = rows[0];
    const prevSameTest = rows.slice(1).find(r => r.test_id === last.test_id);
    const meta = testMeta.get(last.test_id);
    const unit = meta?.unit ?? "";
    let deltaPct: number | null = null;
    let improved: boolean | null = null;
    if (prevSameTest && prevSameTest.value !== 0) {
      deltaPct = Math.round(((last.value - prevSameTest.value) / prevSameTest.value) * 100);
      const wentUp = last.value > prevSameTest.value;
      improved = TIME_UNITS.has(unit) ? !wentUp : wentUp;
      if (last.value === prevSameTest.value) improved = null;
    }
    out[a.id] = { name: meta?.name ?? "Test", value: last.value, unit, date: last.date, deltaPct, improved };
  }
  return out;
}

/* Verdict de forces/faiblesses par athlète, sur TOUS ses tests confondus (2026-09-25, retour de
   Gildas — "faudrait afficher l'insight des forces/faiblesses pour tous les tests du sportif" sur
   la liste roster de /coach/athletes, jugée "pas adaptée aux tests" telle quelle jusqu'ici : les
   lignes n'affichaient que Charge/Récupération, jamais un résumé Tests). Même pipeline que
   TestsPanel.tsx (canonicalMetricKey → computeAllFamiliesInsights → buildVerdict), mais en une
   seule passe batchée pour tout le roster plutôt qu'un fetch par athlète — même raison/même schéma
   de requêtes que getAthletesLastTests() ci-dessus (RLS bloque la lecture cross-owner, client admin
   obligatoire), volontairement pas fusionnée avec elle pour ne pas risquer de casser ce qui
   fonctionne déjà. */
export type AthleteTestVerdictByAthlete = Record<string, Verdict | null>;

export async function getAthletesTestVerdicts(
  admin: SupabaseClient,
  coachId: string,
  athletes: CoachAthlete[]
): Promise<AthleteTestVerdictByAthlete> {
  const athleteIds = athletes.map(a => a.id);
  const realUserIds = athletes.filter(a => a.user_id).map(a => a.user_id as string);

  const [{ data: coachTests }, { data: coachResults }, { data: athleteTests }, { data: athleteResults }] = await Promise.all([
    admin.from("tests").select("id,name").eq("owner_id", coachId),
    athleteIds.length
      ? admin.from("test_results").select("test_id,date,value,subject_coach_athlete_id").in("subject_coach_athlete_id", athleteIds)
      : Promise.resolve({ data: [] as { test_id: string; date: string; value: number; subject_coach_athlete_id: string }[] }),
    realUserIds.length
      ? admin.from("tests").select("id,name").in("owner_id", realUserIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    realUserIds.length
      ? admin.from("test_results").select("test_id,date,value,subject_user_id").in("subject_user_id", realUserIds)
      : Promise.resolve({ data: [] as { test_id: string; date: string; value: number; subject_user_id: string }[] }),
  ]);

  const testName = new Map<string, string>();
  (coachTests ?? []).forEach(t => testName.set(t.id, t.name));
  (athleteTests ?? []).forEach(t => testName.set(t.id, t.name));

  type Row = { test_id: string; date: string; value: number };
  const rowsByAthlete = new Map<string, Row[]>();
  function push(athleteId: string | undefined, r: Row) {
    if (!athleteId) return;
    if (!rowsByAthlete.has(athleteId)) rowsByAthlete.set(athleteId, []);
    rowsByAthlete.get(athleteId)!.push(r);
  }
  (coachResults ?? []).forEach(r => push(r.subject_coach_athlete_id, { test_id: r.test_id, date: r.date, value: Number(r.value) }));
  const athleteIdByUserId = new Map(athletes.filter(a => a.user_id).map(a => [a.user_id as string, a.id]));
  (athleteResults ?? []).forEach(r => push(athleteIdByUserId.get(r.subject_user_id), { test_id: r.test_id, date: r.date, value: Number(r.value) }));

  const out: AthleteTestVerdictByAthlete = {};
  for (const a of athletes) {
    const rows = rowsByAthlete.get(a.id) ?? [];
    if (rows.length === 0) { out[a.id] = null; continue; }
    // Dernière valeur par métrique canonique (pas par test_id brut — plusieurs lignes peuvent
    // résoudre au même mouvement sous des noms différents, ex. "Back squat"/"Squat arrière").
    const latestByMetric: Partial<Record<MetricKey, number>> = {};
    const latestDateByMetric: Partial<Record<MetricKey, string>> = {};
    for (const r of rows) {
      const name = testName.get(r.test_id);
      if (!name) continue;
      const key = canonicalMetricKey(name);
      if (!key) continue;
      const prevDate = latestDateByMetric[key];
      if (!prevDate || r.date > prevDate) {
        latestByMetric[key] = r.value;
        latestDateByMetric[key] = r.date;
      }
    }
    const insights = computeAllFamiliesInsights(a.sexe ?? null, a.poids_kg ?? null, latestByMetric);
    out[a.id] = buildVerdict(insights);
  }
  return out;
}
