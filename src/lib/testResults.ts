"use client";

import { createClient } from "@/lib/supabase/client";
import { resolveExerciseName } from "@/lib/exerciseAutocomplete";

/* Suivi de tests physiques — deux tables scopées par owner_id (coach ou sportif solo), même pattern
   que exercise_video_library : le nom résolu de la ligne d'exercice sert de clé, un test devient
   réutilisable dès qu'un même nom réapparaît chez ce owner. Voir supabase/migrations/016_test_tracking.sql
   pour le schéma complet.

   Écriture : chaque source (coach ou sportif) écrit sous son propre owner_id — jamais de croisement.
   Lecture côté coach : un résultat qu'un vrai sportif a enregistré lui-même vit sous SON owner_id,
   RLS bloque donc sa lecture directe par le coach — fusionné via une route admin
   (/api/coach/athlete-tests, voir fetchAthleteOwnTests/mergeTests plus bas) qui vérifie d'abord que
   ce sportif appartient bien au coach connecté avant de lire pour de vrai. */

export const TEST_UNITS = ["kg", "s", "min", "km", "m", "%", "reps", "cm"] as const;
export type TestUnit = (typeof TEST_UNITS)[number];

export interface TestRow {
  id: string;
  name: string;
  name_key: string;
  unit: string;
}

export interface TestResultRow {
  id: string;
  test_id: string;
  date: string;
  value: number;
  unit: string;
  video_url: string | null;
}

export type TestSubject = { subjectUserId: string } | { subjectCoachAthleteId: string };

function slugify(name: string): string {
  return name.trim().toLowerCase();
}

/* "12,5" (virgule FR) ou "12.5" → 12.5 ; texte vide/non numérique → null. */
export function parseResultValue(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/* Résout (ou crée) le test scopé à `ownerId` pour ce nom — même mécanique que
   exercise_video_library : toutes les erreurs Supabase sont journalisées (.upsert()/.insert() ne
   lève jamais d'exception JS, un échec silencieux serait invisible sinon). */
export async function resolveTest(ownerId: string, name: string, unit: string): Promise<TestRow | null> {
  const supabase = createClient();
  const key = slugify(name);
  if (!key) return null;
  const { data: existing, error: selErr } = await supabase
    .from("tests").select("id,name,name_key,unit").eq("owner_id", ownerId).eq("name_key", key).maybeSingle();
  if (selErr) console.error("[tests] lookup a échoué pour", JSON.stringify(key), selErr);
  if (existing) return existing as TestRow;
  const { data: created, error: insErr } = await supabase
    .from("tests").insert({ owner_id: ownerId, name: name.trim(), name_key: key, unit })
    .select("id,name,name_key,unit").single();
  if (insErr) { console.error("[tests] création a échoué pour", JSON.stringify(key), insErr); return null; }
  return created as TestRow;
}

export async function listTests(ownerId: string): Promise<TestRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("tests").select("id,name,name_key,unit").eq("owner_id", ownerId).order("name");
  if (error) { console.error("[tests] liste a échoué", error); return []; }
  return (data ?? []) as TestRow[];
}

/* Tous les résultats "own" (lisibles directement, RLS auth.uid()=owner_id) pour ce sujet, tous
   tests confondus — une seule requête plutôt qu'une par test, utile pour construire une grille de
   KPI (un résumé par test) sans multiplier les allers-retours. */
export async function listOwnResults(subject: TestSubject): Promise<TestResultRow[]> {
  const supabase = createClient();
  let q = supabase.from("test_results").select("id,test_id,date,value,unit,video_url");
  q = "subjectUserId" in subject ? q.eq("subject_user_id", subject.subjectUserId) : q.eq("subject_coach_athlete_id", subject.subjectCoachAthleteId);
  const { data, error } = await q.order("date");
  if (error) { console.error("[test_results] liste (sujet) a échoué", error); return []; }
  return (data ?? []) as TestResultRow[];
}

export async function listTestResults(testId: string, subject: TestSubject): Promise<TestResultRow[]> {
  const supabase = createClient();
  let q = supabase.from("test_results").select("id,test_id,date,value,unit,video_url").eq("test_id", testId);
  q = "subjectUserId" in subject ? q.eq("subject_user_id", subject.subjectUserId) : q.eq("subject_coach_athlete_id", subject.subjectCoachAthleteId);
  const { data, error } = await q.order("date");
  if (error) { console.error("[test_results] liste a échoué", error); return []; }
  return (data ?? []) as TestResultRow[];
}

/* Ce qu'un vrai sportif a enregistré LUI-MÊME (son propre owner_id) — lu via une route admin
   (/api/coach/athlete-tests, vérifie que ce coach_athlete appartient bien au coach connecté) car RLS
   (auth.uid()=owner_id) empêche toute lecture directe cross-owner, y compris en lecture seule.
   Renvoie {tests:[],results:[]} pour un athlète démo/en attente (pas de compte réel à lire). */
export async function fetchAthleteOwnTests(coachAthleteId: string): Promise<{ tests: TestRow[]; results: TestResultRow[] }> {
  try {
    const res = await fetch(`/api/coach/athlete-tests?athleteId=${coachAthleteId}`);
    if (!res.ok) return { tests: [], results: [] };
    const json = await res.json();
    return { tests: json.tests ?? [], results: json.results ?? [] };
  } catch (err) {
    console.error("[athlete-tests] fetch a échoué", err);
    return { tests: [], results: [] };
  }
}

/* Symétrique côté sportif — ce que SON coach a enregistré pour lui (owner_id=coach), pour l'appeler
   depuis /conseils. Aucun paramètre : toujours le coach du sportif actuellement connecté. */
export async function fetchCoachTestsForAthlete(): Promise<{ tests: TestRow[]; results: TestResultRow[] }> {
  try {
    const res = await fetch("/api/athlete/coach-tests");
    if (!res.ok) return { tests: [], results: [] };
    const json = await res.json();
    return { tests: json.tests ?? [], results: json.results ?? [] };
  } catch (err) {
    console.error("[coach-tests] fetch a échoué", err);
    return { tests: [], results: [] };
  }
}

export interface MergedTest {
  name_key: string;
  name: string;
  unit: string;
  /* Un même nom de test peut exister comme 2 lignes distinctes en base (une par owner_id) : celle
     créée sous l'owner_id du coach (résultat qu'IL a enregistré pour ce sportif) et celle créée sous
     l'owner_id du sportif (résultat qu'IL a enregistré lui-même) — même nom, 2 id différents. Les
     deux sont fusionnées ici pour l'affichage, dans les deux sens (TestsPanel côté coach ET côté
     sportif) ; l'écriture, elle, continue de cibler l'un ou l'autre selon qui agit (voir
     upsertTestResult). Noms de champs fixes quel que soit le sens de la fusion : `coachTestId` = la
     ligne vivant sous l'owner_id du coach, `athleteTestId` = celle vivant sous l'owner_id du sportif. */
  coachTestId?: string;
  athleteTestId?: string;
}

/* Fusionne le catalogue de tests du coach (scope owner_id=coach, pour ce roster) avec celui du
   sportif lui-même (scope owner_id=sportif, via fetchAthleteOwnTests) — dédoublonné par name_key. */
export function mergeTests(coachTests: TestRow[], athleteTests: TestRow[]): MergedTest[] {
  const map = new Map<string, MergedTest>();
  for (const t of coachTests) map.set(t.name_key, { name_key: t.name_key, name: t.name, unit: t.unit, coachTestId: t.id });
  for (const t of athleteTests) {
    const existing = map.get(t.name_key);
    if (existing) existing.athleteTestId = t.id;
    else map.set(t.name_key, { name_key: t.name_key, name: t.name, unit: t.unit, athleteTestId: t.id });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/* Supprime un seul point daté (pas le test/catalogue lui-même — d'autres dates peuvent encore le
   référencer). RLS (`auth.uid() = owner_id`) suffit à empêcher de supprimer autre chose que ses
   propres lignes. */
export async function deleteTestResult(testId: string, date: string, subject: TestSubject): Promise<void> {
  const supabase = createClient();
  let q = supabase.from("test_results").delete().eq("test_id", testId).eq("date", date);
  q = "subjectUserId" in subject ? q.eq("subject_user_id", subject.subjectUserId) : q.eq("subject_coach_athlete_id", subject.subjectCoachAthleteId);
  const { error } = await q;
  if (error) console.error("[test_results] suppression a échoué pour", testId, date, error);
}

/* Écriture double au moment de la sauvegarde de la séance (pas à chaque frappe) : résout/crée le
   test puis upsert un point daté — idempotent sur (test_id, date, sujet), un ré-enregistrement le
   même jour met simplement à jour la valeur plutôt que de dupliquer une ligne. */
export async function upsertTestResult(
  ownerId: string,
  subject: TestSubject,
  params: { name: string; unit: string; value: number; date: string; videoUrl?: string | null }
): Promise<void> {
  const test = await resolveTest(ownerId, params.name, params.unit);
  if (!test) return;
  const supabase = createClient();
  const subjectCols = "subjectUserId" in subject
    ? { subject_user_id: subject.subjectUserId, subject_coach_athlete_id: null }
    : { subject_coach_athlete_id: subject.subjectCoachAthleteId, subject_user_id: null };
  const { error } = await supabase.from("test_results").upsert(
    { owner_id: ownerId, test_id: test.id, date: params.date, value: params.value, unit: params.unit, video_url: params.videoUrl ?? null, ...subjectCols },
    { onConflict: "test_id,date,subject_key" }
  );
  if (error) console.error("[test_results] upsert a échoué pour", test.name_key, params.date, error);
}

/* Scanne le texte + les media d'une séance (mêmes formats que ExerciseBlockEditor : notes en lignes
   `\n`-séparées, exercise_media keyé par index de ligne) et écrit un test_results pour chaque ligne
   marquée comme test avec une valeur numérique valide — appelé depuis handleSave, jamais en live. */
export async function syncTestResultsFromSession(
  ownerId: string,
  subject: TestSubject,
  notes: string,
  exerciseMedia: Record<string, { result?: { value: string; unit: string } }>,
  date: string
): Promise<void> {
  const lines = notes.split("\n").map(l => l.trim()).filter(Boolean);
  const entries = Object.entries(exerciseMedia).filter(([, m]) => m.result);
  if (!entries.length) return;
  await Promise.all(entries.map(async ([idx, media]) => {
    const line = lines[Number(idx)];
    const result = media.result;
    if (!line || !result) return;
    const value = parseResultValue(result.value);
    if (value === null) return;
    const name = resolveExerciseName(line) || line;
    await upsertTestResult(ownerId, subject, { name, unit: result.unit, value, date });
  }));
}
