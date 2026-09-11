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
  /* Qualité(s) physique(s) choisies à la création (2026-09, demande de Gildas) — UNIQUEMENT pour un
     test entièrement libre (nom non reconnu) : un test recommandé (testBattery.ts) a déjà la sienne
     via BATTERY_TEST_QUALITY, un test résolu (canonicalMetricKey) via METRIC_QUALITY — ceux-là
     ignorent ce champ. `null` = jamais taguée (comportement historique : toujours affiché, quel que
     soit le filtre qualité actif dans TestsPanel.tsx, voir `rawTests`). */
  qualities: string[] | null;
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

/* "12,5" (virgule FR) ou "12.5" → 12.5 ; texte vide/non numérique → null.
   Bug réel corrigé (2026-09, découvert en creusant "ça met à 0 la valeur du Push Press" — signalé
   par Gildas) : `Number("")` vaut `0` en JS, et `Number.isFinite(0)` est `true` — un champ VIDE
   renvoyait donc `0`, pas `null`. Tous les garde-fous "value === null → ne rien écrire/désactive le
   bouton" (TestCard, AddCustomTestForm, le composeur de test dans ExerciseBlockEditor,
   syncTestResultsFromSession...) laissaient donc passer un champ jamais rempli comme un vrai "0"
   explicite, écrivant/upsertant silencieusement value=0 sur la date du jour — y compris par-dessus
   une vraie valeur déjà loguée ce jour-là. Fix à la source : chaîne vide/blanche → `null` avant même
   la conversion, un "0" explicitement tapé reste bien distingué et continue de valoir 0. */
export function parseResultValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/* Résout (ou crée) le test scopé à `ownerId` pour ce nom — même mécanique que
   exercise_video_library : toutes les erreurs Supabase sont journalisées (.upsert()/.insert() ne
   lève jamais d'exception JS, un échec silencieux serait invisible sinon). */
/* `qualities` uniquement utilisé à la CRÉATION (ligne `tests` pas encore existante) — un test déjà
   existant garde ses qualités d'origine, jamais écrasées par un appel ultérieur (ex. un 2e résultat
   ajouté sans repasser par le formulaire de création). */
export async function resolveTest(ownerId: string, name: string, unit: string, qualities?: string[]): Promise<TestRow | null> {
  const supabase = createClient();
  const key = slugify(name);
  if (!key) return null;
  const { data: existing, error: selErr } = await supabase
    .from("tests").select("id,name,name_key,unit,qualities").eq("owner_id", ownerId).eq("name_key", key).maybeSingle();
  if (selErr) console.error("[tests] lookup a échoué pour", JSON.stringify(key), selErr);
  if (existing) return existing as TestRow;
  const { data: created, error: insErr } = await supabase
    .from("tests").insert({ owner_id: ownerId, name: name.trim(), name_key: key, unit, qualities: qualities?.length ? qualities : null })
    .select("id,name,name_key,unit,qualities").single();
  if (insErr) { console.error("[tests] création a échoué pour", JSON.stringify(key), insErr); return null; }
  return created as TestRow;
}

export async function listTests(ownerId: string): Promise<TestRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("tests").select("id,name,name_key,unit,qualities").eq("owner_id", ownerId).order("name");
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
  qualities: string[] | null;
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
  for (const t of coachTests) map.set(t.name_key, { name_key: t.name_key, name: t.name, unit: t.unit, qualities: t.qualities, coachTestId: t.id });
  for (const t of athleteTests) {
    const existing = map.get(t.name_key);
    if (existing) { existing.athleteTestId = t.id; existing.qualities = existing.qualities ?? t.qualities; }
    else map.set(t.name_key, { name_key: t.name_key, name: t.name, unit: t.unit, qualities: t.qualities, athleteTestId: t.id });
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
  params: { name: string; unit: string; value: number; date: string; videoUrl?: string | null; qualities?: string[] }
): Promise<void> {
  const test = await resolveTest(ownerId, params.name, params.unit, params.qualities);
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

/* Bug réel corrigé (2026-09) : supprimer le DERNIER résultat d'un test (deleteTestResult, ou "Retirer
   le test" dans ExerciseBlockEditor.tsx) ne supprimait jamais la ligne `tests` elle-même — un
   catalogue vidé restait visible indéfiniment dans le panneau de tests ("Aucun résultat encore."),
   sans plus aucun rapport avec une vraie séance. `subject` DOIT être `{subjectUserId}` (jamais
   `{subjectCoachAthleteId}`) : une ligne `tests` côté coach est PARTAGÉE entre tous ses sportifs (même
   owner_id, name_key identique) — vider les résultats d'UN sportif ne veut pas dire que les autres
   n'ont plus de données sous ce même test, donc jamais de suppression automatique dans ce cas (no-op
   silencieux). Pour un sportif solo, `owner_id` lui appartient en propre : 0 résultat pour lui = 0
   résultat tout court, sans risque de vider l'historique de quelqu'un d'autre. */
export async function deleteTestIfEmpty(testId: string, ownerId: string, subject: TestSubject): Promise<void> {
  if (!("subjectUserId" in subject)) return;
  const remaining = await listTestResults(testId, subject);
  if (remaining.length > 0) return;
  const supabase = createClient();
  const { error } = await supabase.from("tests").delete().eq("id", testId).eq("owner_id", ownerId);
  if (error) console.error("[tests] suppression (catalogue vidé) a échoué pour", testId, error);
}

/* Suppression complète d'un test (2026-09) — contrairement à deleteTestIfEmpty (ne supprime QUE si
   déjà vide), celle-ci efface d'abord tous les résultats du sujet courant puis, si sûr de le faire,
   la ligne `tests` elle-même. Déclenchée par le menu "⋯" d'une carte non reliée (TestsPanel.tsx),
   qu'elle ait déjà des résultats ou non. Même garde que deleteTestIfEmpty pour la ligne `tests` :
   jamais supprimée côté coach (catalogue partagé entre plusieurs sportifs, même owner_id/name_key) —
   seuls LES RÉSULTATS de CE sujet précis sont effacés dans ce cas, la carte peut donc réapparaître
   vide pour ce sportif si un autre a encore des données dessus (comportement assumé, pas un bug). */
export async function deleteTestCompletely(ownerId: string, testId: string, subject: TestSubject): Promise<void> {
  const results = await listTestResults(testId, subject);
  for (const r of results) await deleteTestResult(testId, r.date, subject);
  if ("subjectUserId" in subject) {
    const supabase = createClient();
    const { error } = await supabase.from("tests").delete().eq("id", testId).eq("owner_id", ownerId);
    if (error) console.error("[tests] suppression complète a échoué pour", testId, error);
  }
}

/* Filet de sécurité "test orphelin" (2026-09) — relie un test existant (typiquement non reconnu par
   canonicalMetricKey, testNorms.ts, faute d'un nom canonique) à un nom connu : copie chaque résultat
   sous ce nouveau nom (upsertTestResult, réutilise resolveTest pour créer/retrouver la ligne cible en
   conservant l'unité déjà loguée pour chaque point plutôt que d'en imposer une nouvelle), supprime
   l'ancien point puis l'ancien test lui-même une fois vidé. Jamais automatique — déclenché
   uniquement par l'action "🔗 Relier" du panneau de tests (TestsPanel.tsx), sur choix explicite de
   l'utilisateur. Best-effort : les échecs individuels sont déjà journalisés par
   upsertTestResult/deleteTestResult, n'interrompent pas la boucle sur les autres points datés. */
export async function mergeTestInto(ownerId: string, oldTestId: string, subject: TestSubject, toName: string): Promise<void> {
  // Bug réel corrigé (2026-09, trouvé par Gildas) : si `toName` se résout (via slugify) sur LE MÊME
  // test que `oldTestId` (ex. relier "Saut vertical (CMJ)" vers... "Saut vertical (CMJ)", cas rendu
  // possible par un alias manquant ailleurs — voir ALIASES dans testNorms.ts, déjà corrigé), la boucle
  // ci-dessous écrivait puis supprimait CHAQUE point sur la même ligne (upsert et delete ciblent le
  // même test_id+date), avant de supprimer la fiche elle-même : un "relier" qui aurait dû être un
  // no-op vidait et détruisait le test entier. Vérifié AVANT toute écriture, jamais après coup.
  const target = await resolveTest(ownerId, toName, "kg");
  if (target?.id === oldTestId) return;
  const results = await listTestResults(oldTestId, subject);
  for (const r of results) {
    await upsertTestResult(ownerId, subject, { name: toName, unit: r.unit, value: r.value, date: r.date, videoUrl: r.video_url });
    await deleteTestResult(oldTestId, r.date, subject);
  }
  const supabase = createClient();
  const { error } = await supabase.from("tests").delete().eq("id", oldTestId).eq("owner_id", ownerId);
  if (error) console.error("[tests] suppression de l'ancien test a échoué pour", oldTestId, error);
}

/* Scanne le texte + les media d'une séance (mêmes formats que ExerciseBlockEditor : notes en lignes
   `\n`-séparées, exercise_media keyé par index de ligne) et écrit un test_results pour chaque ligne
   marquée comme test avec une valeur numérique valide — appelé depuis handleSave, jamais en live.
   Bug réel corrigé (2026-09, signalé par Gildas — "Push press wesh" lié en direct à "Push Press" se
   doublonnait quand même) : cette fonction re-dérivait un nom via resolveExerciseName(line), tout à
   fait indépendamment du nom sous lequel le composeur live (ExerciseBlockEditor) avait DÉJÀ écrit la
   même valeur au moment du "🧪 Valider" (`effectiveTestName`, qui peut être un lien manuel vers un
   test existant — voir testNameOverride) — les 2 écritures pouvaient donc atterrir sous 2 noms
   différents, créant une fiche fantôme. `media.result.testName` (stampé systématiquement par
   ExerciseBlockEditor, voir ExerciseResult dans types/index.ts) est désormais la SEULE source de
   vérité quand elle existe ; `resolveExerciseName(line) || line` ne reste un repli que pour un
   `exercise_media` déjà sauvegardé avant ce fix (jamais de `testName`). */
export async function syncTestResultsFromSession(
  ownerId: string,
  subject: TestSubject,
  notes: string,
  exerciseMedia: Record<string, { result?: { value: string; unit: string; testName?: string } }>,
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
    const name = result.testName || resolveExerciseName(line) || line;
    await upsertTestResult(ownerId, subject, { name, unit: result.unit, value, date });
  }));
}

/* Séries reps×poids sous-maximales (2026-09, `strength_reps`, table SÉPARÉE de `test_results`) — même
   catalogue `tests` (même test_id qu'un vrai 1RM du même mouvement), mais jamais lues par
   combinedByMetric/latestByMetric (TestsPanel.tsx), qui n'interrogent que `test_results` : garantie
   STRUCTURELLE (pas une simple discipline de filtrage à retenir partout) que l'estimation Epley
   n'alimente jamais les RATIO_CARDS sourcées — exigence explicite de Gildas. */
export interface StrengthRepRow {
  id: string;
  test_id: string;
  date: string;
  reps: number;
  weight: number;
}

/* Toutes les séries reps×poids d'un sujet, tous mouvements confondus — une seule requête, même
   principe que listOwnResults. Portée volontairement réduite (2026-09, v1) : contrairement à
   test_results, PAS de fusion croisée coach/sportif pour l'instant (pas de route admin dédiée) — un
   coach ne voit que les séries qu'IL a lui-même enregistrées pour ce sportif, jamais celles que le
   sportif aurait pu logger de son côté, et réciproquement. Limite assumée, pas un oubli. */
export async function listOwnStrengthReps(subject: TestSubject): Promise<StrengthRepRow[]> {
  const supabase = createClient();
  let q = supabase.from("strength_reps").select("id,test_id,date,reps,weight");
  q = "subjectUserId" in subject ? q.eq("subject_user_id", subject.subjectUserId) : q.eq("subject_coach_athlete_id", subject.subjectCoachAthleteId);
  const { data, error } = await q.order("date");
  if (error) { console.error("[strength_reps] liste (sujet) a échoué", error); return []; }
  return (data ?? []) as StrengthRepRow[];
}

export async function listStrengthReps(testId: string, subject: TestSubject): Promise<StrengthRepRow[]> {
  const supabase = createClient();
  let q = supabase.from("strength_reps").select("id,test_id,date,reps,weight").eq("test_id", testId);
  q = "subjectUserId" in subject ? q.eq("subject_user_id", subject.subjectUserId) : q.eq("subject_coach_athlete_id", subject.subjectCoachAthleteId);
  const { data, error } = await q.order("date");
  if (error) { console.error("[strength_reps] liste a échoué", error); return []; }
  return (data ?? []) as StrengthRepRow[];
}

export async function upsertStrengthRep(
  ownerId: string,
  subject: TestSubject,
  params: { name: string; unit: string; reps: number; weight: number; date: string }
): Promise<void> {
  const test = await resolveTest(ownerId, params.name, params.unit);
  if (!test) return;
  const supabase = createClient();
  const subjectCols = "subjectUserId" in subject
    ? { subject_user_id: subject.subjectUserId, subject_coach_athlete_id: null }
    : { subject_coach_athlete_id: subject.subjectCoachAthleteId, subject_user_id: null };
  const { error } = await supabase.from("strength_reps").upsert(
    { owner_id: ownerId, test_id: test.id, date: params.date, reps: params.reps, weight: params.weight, ...subjectCols },
    { onConflict: "test_id,date,subject_key,reps" }
  );
  if (error) console.error("[strength_reps] upsert a échoué pour", test.name_key, params.date, error);
}

export async function deleteStrengthRep(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("strength_reps").delete().eq("id", id);
  if (error) console.error("[strength_reps] suppression a échoué pour", id, error);
}
