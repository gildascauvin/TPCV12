import { createClient } from "@/lib/supabase/server";
import { METRIC_DISPLAY, type MetricKey } from "@/lib/testNorms";
import { lineServesMetric } from "@/lib/programServes";
import type { ExerciseAttachments } from "@/types";

/* « Teste-le cette semaine » (P3, 24/11/2026, revu le même jour avec Gildas) : prépare le 1er test d'un
   objectif sans valeur. Deux temps : sans `apply`, la route PROPOSE (le sportif confirme le jour dans une
   feuille du bas) ; avec `apply`, elle écrit.
   Options, par ordre de préférence :
   - « mark »  : une séance des 7 jours contient déjà le mouvement → cette ligne est marquée test ;
   - « start » : sinon, le test va AU DÉBUT d'une séance compatible, juste après l'échauffement (un test se
                 fait frais). Incompatible = test à la barre dans une séance d'endurance (course, vélo…) ;
   - « new »   : sinon (ou au choix), une courte « Séance test » le prochain jour d'entraînement libre.
   Une ligne test = exercise_media[index].result = { value: "", unit, testName } (comme « Marquer comme
   test » dans l'éditeur, clé = index de la ligne ; une insertion décale les clés suivantes). */

type Kind = "mark" | "start" | "new";
interface Option { kind: Kind; date: string; sessionId: string | null; sessionName: string | null }

const BARBELL = new Set<MetricKey>(["backSquat", "frontSquat", "deadlift", "bench", "pressOh", "snatch", "cleanJerk"]);
const ENDURANCE = /course|footing|sortie longue|fractionn|trail|v[ée]lo|cycl|natation|nage|rameur|aviron|marche|randonn/i;
const STRENGTH = /squat|soulev|deadlift|d[ée]velopp|arrach|[ée]paul|muscu|force|halt[ée]ro|barre|presse/i;
const WARMUP = /^\s*(é|e)chauffement|warm.?up|mobilit|activation|gammes|r[ée]veil musculaire/i;

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const metric = typeof body.metric === "string" ? (body.metric as MetricKey) : null;
  const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  if (!metric || !METRIC_DISPLAY[metric]) return Response.json({ error: "Mesure inconnue" }, { status: 400 });
  const name = METRIC_DISPLAY[metric].name;
  const unit = METRIC_DISPLAY[metric].unit || "kg";

  const [{ data: sessions, error }, { data: profile }] = await Promise.all([
    supabase.from("sessions").select("id, date, name, notes, exercise_media")
      .eq("user_id", user.id).eq("done", false).gte("date", today).lte("date", addDays(today, 7)).order("date", { ascending: true }),
    supabase.from("profiles").select("training_days").eq("user_id", user.id).maybeSingle(),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const list = sessions ?? [];

  /* ── Options ── */
  const options: Option[] = [];
  for (const s of list) {
    const text = `${s.name ?? ""}\n${s.notes ?? ""}`;
    const has = (s.notes ?? "").split("\n").some((l: string) => l.trim() && lineServesMetric(metric, l));
    if (has) { options.push({ kind: "mark", date: s.date, sessionId: s.id, sessionName: s.name }); continue; }
    const incompatible = BARBELL.has(metric) && ENDURANCE.test(text) && !STRENGTH.test(text);
    if (!incompatible) options.push({ kind: "start", date: s.date, sessionId: s.id, sessionName: s.name });
  }
  /* Séance test dédiée : prochain jour d'entraînement (profil) sans séance, à partir de demain ; sinon demain. */
  const busy = new Set(list.map(s => s.date));
  const days = ((profile as { training_days?: number[] | null } | null)?.training_days ?? []) as number[];
  let newDate = addDays(today, 1);
  for (let i = 1; i <= 7; i++) { const d = addDays(today, i); if (!busy.has(d) && (!days.length || days.includes(dow(d)))) { newDate = d; break; } }
  options.push({ kind: "new", date: newDate, sessionId: null, sessionName: null });
  const recommended = options.find(o => o.kind === "mark") ?? options.find(o => o.kind === "start") ?? options[options.length - 1];

  const apply = body.apply as { kind?: Kind; sessionId?: string | null; date?: string } | undefined;
  if (!apply) return Response.json({ ok: true, test: name, options, recommended });

  /* ── Écriture ── */
  if (apply.kind === "new") {
    const date = apply.date && /^\d{4}-\d{2}-\d{2}$/.test(apply.date) ? apply.date : newDate;
    const notes = `Échauffement progressif 10 min\n${name} : test`;
    const { error: insErr } = await supabase.from("sessions").insert({
      user_id: user.id, date, name: `Séance test · ${name}`, notes, duration: 30, target_difficulty: 6, done: false,
      exercise_media: { "1": { comments: [], result: { value: "", unit, testName: name } } },
    });
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
    return Response.json({ ok: true, kind: "new", date });
  }
  const target = list.find(s => s.id === apply.sessionId);
  if (!target) return Response.json({ error: "Séance introuvable" }, { status: 404 });
  const lines = (target.notes ?? "").split("\n");
  const media = { ...((target.exercise_media as Record<string, ExerciseAttachments> | null) ?? {}) };
  let idx = apply.kind === "mark" ? lines.findIndex((l: string) => l.trim() && lineServesMetric(metric, l)) : -1;
  if (idx < 0) {
    /* Au début, juste après les lignes d'échauffement ; les clés des lignes suivantes sont décalées. */
    let at = 0;
    while (at < lines.length && WARMUP.test(lines[at])) at++;
    lines.splice(at, 0, `${name} : test`);
    const shifted: Record<string, ExerciseAttachments> = {};
    for (const [k, v] of Object.entries(media)) { const n = Number(k); shifted[Number.isInteger(n) && n >= at ? String(n + 1) : k] = v; }
    Object.keys(media).forEach(k => delete media[k]);
    Object.assign(media, shifted);
    idx = at;
  }
  const key = String(idx);
  media[key] = { ...(media[key] ?? { comments: [] }), result: { value: "", unit, testName: name } };
  const { error: upErr } = await supabase.from("sessions").update({ notes: lines.join("\n"), exercise_media: media }).eq("id", target.id).eq("user_id", user.id);
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });
  return Response.json({ ok: true, kind: apply.kind, date: target.date, session: target.name });
}
