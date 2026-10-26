import { sleepMinutesScore, rhrComponent, hrvComponent, deviceInputsFor as _deviceInputsFor, type DeviceInputs, type HealthRow as _HealthRow } from "@/lib/deviceWellness";

/* Ressenti vs physiologie (2026-10-11, POC https://claude.ai/artifact/A9XZaSXeHW9WW5amXDzEHv).
   Deux comparaisons, toujours APRÈS la saisie (jamais affichées avant : ça orienterait la note) :
   1. Séance : RPE noté vs ce que la FC de la séance (TRIMP) laissait attendre, appris sur les
      séances précédentes du même type chez ce sportif.
   2. Check-in : ressenti déclaré vs données physiologiques de la nuit (sommeil mesuré, FC au repos,
      VFC vs la norme perso).
   Pur : aucun accès réseau, testable tel quel. */

/* ── 1. Séance vs cœur ─────────────────────────────────────────────────────────────── */

export type PhysioWorkout = { date: string; start_at: string; duration_min: number; workout_type: string; trimp: number | null };
export type PhysioSession = { id: string; date: string; duration: number | null; rpe: number | null; done: boolean; name?: string | null };

/* Familles : la FC reflète mal l'effort en force/haltéro (efforts courts, neuromusculaires), donc une
   séance n'est jamais comparée qu'aux séances de sa famille, jamais à une échelle absolue. */
export type HeartFamily = "force" | "cardio" | "autre";
const FORCE = new Set(["traditionalStrengthTraining", "functionalStrengthTraining", "strengthTraining", "weightlifting", "crossTraining", "coreTraining", "calisthenics"]);
const CARDIO = new Set(["running", "runningTreadmill", "trackAndField", "cycling", "bikingStationary", "swimming", "swimmingPool", "swimmingOpenWater", "rowing", "rowingMachine", "highIntensityIntervalTraining", "mixedCardio", "elliptical", "jumpRope", "hiking", "boxing", "kickboxing", "martialArts", "soccer", "basketball", "rugby", "handball", "volleyball", "tennis"]);
export const heartFamily = (workoutType: string): HeartFamily => FORCE.has(workoutType) ? "force" : CARDIO.has(workoutType) ? "cardio" : "autre";
export const HEART_FAMILY_LABEL: Record<HeartFamily, string> = { force: "de force", cardio: "cardio", autre: "" };

/* Séances de calibrage avant tout verdict, par famille (8 : en dessous, la relation RPE/FC propre au
   sportif est trop incertaine pour distinguer un vrai écart du bruit). */
export const HEART_CALIBRATION = 8;

export type HeartResult =
  | { kind: "calibrating"; family: HeartFamily; have: number }
  | { kind: "ok"; family: HeartFamily; rpe: number; predicted: number; gap: number; threshold: number; verdict: "harder" | "easier" | "agree" };

/* La séance correspond à l'entraînement montre du même jour à la durée la plus proche (écart toléré :
   la moitié de la durée, au moins 15 min). Sans entraînement avec FC : pas de comparaison. */
export function matchWorkout(s: { date: string; duration: number | null }, workouts: PhysioWorkout[]): PhysioWorkout | null {
  const sameDay = workouts.filter((w) => w.date === s.date && w.trimp != null && w.duration_min >= 10);
  if (!sameDay.length) return null;
  if (s.duration == null) return sameDay.reduce((a, b) => (b.duration_min > a.duration_min ? b : a));
  const best = sameDay.reduce((a, b) => (Math.abs(b.duration_min - s.duration!) < Math.abs(a.duration_min - s.duration!) ? b : a));
  return Math.abs(best.duration_min - s.duration) <= Math.max(15, s.duration * 0.5) ? best : null;
}

type Pair = { date: string; family: HeartFamily; x: number; rpe: number };
// Intensité cardio de la séance = TRIMP par minute (indépendante de la durée, comme le RPE).
const intensity = (w: PhysioWorkout) => Math.log(Math.max(0.05, (w.trimp ?? 0) / Math.max(1, w.duration_min)));

function pairsOf(sessions: PhysioSession[], workouts: PhysioWorkout[]): (Pair & { id: string })[] {
  const out: (Pair & { id: string })[] = [];
  sessions.forEach((s) => {
    if (!s.done || s.rpe == null) return;
    const w = matchWorkout(s, workouts);
    if (!w) return;
    out.push({ id: s.id, date: s.date, family: heartFamily(w.workout_type), x: intensity(w), rpe: s.rpe });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* Régression linéaire RPE ~ intensité cardio sur les séances précédentes de la famille. Seuil d'écart
   = l'erreur typique du modèle (écart-type des résidus), jamais moins d'1 point de RPE. Une pente nulle
   ou négative (pas de lien chez ce sportif) : on prédit sa note moyenne. */
function predict(prior: Pair[], x: number) {
  const n = prior.length;
  const mx = prior.reduce((a, p) => a + p.x, 0) / n, my = prior.reduce((a, p) => a + p.rpe, 0) / n;
  const sxx = prior.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const slope = sxx > 1e-6 ? prior.reduce((a, p) => a + (p.x - mx) * (p.rpe - my), 0) / sxx : 0;
  const b = slope > 0 ? slope : 0;
  const fit = (v: number) => my + b * (v - mx);
  const resid = Math.sqrt(prior.reduce((a, p) => a + (p.rpe - fit(p.x)) ** 2, 0) / Math.max(1, n - 2));
  return { predicted: Math.min(10, Math.max(1, fit(x))), threshold: Math.max(1, resid) };
}

function judge(prior: Pair[], family: HeartFamily, x: number, rpe: number): HeartResult {
  const same = prior.filter((p) => p.family === family);
  if (same.length < HEART_CALIBRATION) return { kind: "calibrating", family, have: same.length };
  const { predicted, threshold } = predict(same, x);
  const gap = rpe - predicted;
  return { kind: "ok", family, rpe, predicted, gap, threshold, verdict: gap >= threshold ? "harder" : gap <= -threshold ? "easier" : "agree" };
}

/* Verdict de chaque séance faite qui a un entraînement avec FC, calculé sur les séances strictement
   antérieures (le résultat d'une séance ne change pas quand les suivantes arrivent). */
export function heartResults(sessions: PhysioSession[], workouts: PhysioWorkout[]): Record<string, HeartResult> {
  const pairs = pairsOf(sessions, workouts);
  const out: Record<string, HeartResult> = {};
  pairs.forEach((p) => { out[p.id] = judge(pairs.filter((q) => q.date < p.date), p.family, p.x, p.rpe); });
  return out;
}

/* RPE que la relation apprise sur CE sportif prédit pour un entraînement montre (2026-10-23, séances
   estimées : watchEstimates.ts). null tant que la famille n'a pas HEART_CALIBRATION séances notées
   avec FC : l'appelant retombe alors sur la règle générale. */
export function personalRpeFor(w: PhysioWorkout, sessions: PhysioSession[], workouts: PhysioWorkout[]): number | null {
  if (w.trimp == null) return null;
  const family = heartFamily(w.workout_type);
  const same = pairsOf(sessions, workouts).filter((p) => p.family === family);
  if (same.length < HEART_CALIBRATION) return null;
  return predict(same, intensity(w)).predicted;
}

/* Verdict d'une séance qu'on vient de terminer (avant que l'historique ne la contienne). */
export function heartResultFor(session: { date: string; duration: number; rpe: number }, history: PhysioSession[], workouts: PhysioWorkout[]): HeartResult | null {
  const w = matchWorkout(session, workouts);
  if (!w) return null;
  const prior = pairsOf(history.filter((s) => s.date < session.date), workouts);
  return judge(prior, heartFamily(w.workout_type), intensity(w), session.rpe);
}

export function heartVerdictText(r: HeartResult, perspective: "athlete" | "coach" = "athlete"): { title: string; text: string } {
  const coach = perspective === "coach";
  if (r.kind === "calibrating") {
    const left = HEART_CALIBRATION - r.have, fam = HEART_FAMILY_LABEL[r.family];
    return {
      title: coach ? "Son cœur apprend son profil" : "Ton cœur apprend ton profil",
      text: `Encore ${left} séance${left > 1 ? "s" : ""}${fam ? ` ${fam}` : ""} avec FC et on pourra comparer ${coach ? "son" : "ton"} ressenti à ce que dit ${coach ? "son" : "ton"} cœur.`,
    };
  }
  const p = Math.round(r.predicted), fam = HEART_FAMILY_LABEL[r.family];
  if (r.verdict === "harder") return {
    title: coach ? "Séance plus dure pour lui que pour son cœur" : "Ta séance t'a paru plus dure que ce que dit ton cœur",
    text: `Pour ${coach ? "son" : "ton"} cœur, c'était une séance${fam ? ` ${fam}` : ""} habituelle (environ ${p}). ${coach ? "Il" : "Tu"} l'a${coach ? "" : "s"} notée ${r.rpe}. Quand ça se répète, c'est souvent de la fatigue qui s'installe.`,
  };
  if (r.verdict === "easier") return {
    title: coach ? "Son cœur a travaillé plus qu'il ne l'a senti" : "Ton cœur a travaillé plus que tu ne l'as senti",
    text: `${coach ? "Son" : "Ton"} cœur dit environ ${p}, ${coach ? "il l'a" : "tu l'as"} notée ${r.rpe}. Signe de forme, ou effort sous-estimé. La charge retenue reste le ressenti.`,
  };
  return {
    title: coach ? "Son ressenti et son cœur sont d'accord" : "Ton ressenti et ton cœur sont d'accord",
    text: `Environ ${p} pour ${coach ? "son" : "ton"} cœur, ${r.rpe} pour ${coach ? "lui" : "toi"}. Séance encaissée comme d'habitude.`,
  };
}

/* ── 2. Check-in vs données physiologiques ───────────────────────────────────────── */

/* Comparer le ressenti et la physiologie en ABSOLU était faux (1re version, 2026-10-11) : une nuit
   de 8 h vaut 10/10 côté données alors que personne ne répond 10 partout, d'où « plus optimistes »
   presque tous les jours. Chacun est donc comparé à SA norme des 28 jours précédents (écart en
   écarts-types), puis les deux écarts entre eux. */


export type PhysioCheckin = { sleep: number; stress: number; recovery: number; motivation: number };
export type PhysioCheckinDay = PhysioCheckin & { date: string; bedtime?: string | null };
export type PhysioVerdict = {
  zFeel: number; zPhysio: number; diff: number;
  kind: "less" | "more" | "agree";
  status: string; title: string; text: string;
  /* Réponses du jour nettement sous leur norme (28 j) : ce que le ressenti voit et la nuit pas. */
  lowFeel: FeelKey[];
};

export type FeelKey = keyof PhysioCheckin;
const FEEL_WORD: Record<FeelKey, [string, string]> = {
  sleep: ["ton sommeil", "son sommeil"], stress: ["ton stress", "son stress"],
  recovery: ["tes courbatures", "ses courbatures"], motivation: ["ta motivation", "sa motivation"],
};
/* « tes courbatures et ta motivation » ; liste vide → null. */
export function feelList(keys: FeelKey[], coach = false): string | null {
  const w = keys.map(k => FEEL_WORD[k][coach ? 1 : 0]);
  return w.length ? (w.length === 1 ? w[0] : `${w.slice(0, -1).join(", ")} et ${w[w.length - 1]}`) : null;
}

const ITEM_SD_FLOOR = 0.75; // points sur 10 : un item très stable ne doit pas signaler un écart d'un point par hasard
/* Items du check-in à au moins 0,5 écart-type sous leur norme (stress : au-dessus, 10 = mauvais). */
function lowItems(c: PhysioCheckin, prior: PhysioCheckin[]): FeelKey[] {
  if (prior.length < PHYSIO_MIN_DAYS) return [];
  return (["recovery", "motivation", "stress", "sleep"] as FeelKey[]).filter(k => {
    const xs = prior.map(p => p[k]);
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.max(ITEM_SD_FLOOR, Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length));
    const z = (c[k] - m) / sd;
    return k === "stress" ? z >= 0.5 : z <= -0.5;
  });
}

export const PHYSIO_NORM_DAYS = 28;
export const PHYSIO_MIN_DAYS = 5;
const DIFF_THRESHOLD = 1;   // écart entre les deux écarts, en écarts-types
const SD_FLOOR = 5;         // points sur 100 : une norme très stable ne doit pas grossir le moindre écart

const feelRaw = (c: PhysioCheckin) => ((c.sleep + (10 - c.stress) + c.recovery + c.motivation) / 4) * 10;

function physioRaw(d: DeviceInputs | null | undefined): number | null {
  if (!d) return null;
  const parts: number[] = [];
  if (d.device_sleep_minutes != null) parts.push(sleepMinutesScore(Number(d.device_sleep_minutes)));
  const rhr = rhrComponent(d);
  if (rhr != null) parts.push(rhr);
  const hrv = hrvComponent(d);
  if (hrv != null) parts.push(hrv);
  if (!parts.length || (rhr == null && d.device_sleep_minutes == null)) return null;
  return (parts.reduce((a, b) => a + b, 0) / parts.length) * 10;
}

function zOf(x: number, prior: number[]): number | null {
  if (prior.length < PHYSIO_MIN_DAYS) return null;
  const m = prior.reduce((a, b) => a + b, 0) / prior.length;
  const sd = Math.sqrt(prior.reduce((a, b) => a + (b - m) ** 2, 0) / prior.length);
  return (x - m) / Math.max(SD_FLOOR, sd);
}

function nightDetail(d: DeviceInputs): string {
  const bits: string[] = [];
  if (d.device_sleep_minutes != null) {
    const m = Math.round(Number(d.device_sleep_minutes));
    bits.push(`${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")} de sommeil`);
  }
  if (d.device_resting_hr != null && d.device_rhr_baseline != null) bits.push(`FC au repos ${Math.round(Number(d.device_resting_hr))} bpm (norme ${Math.round(Number(d.device_rhr_baseline))})`);
  if (d.device_hrv_ms != null && d.device_hrv_baseline != null) bits.push(`VFC ${Math.round(Number(d.device_hrv_ms))} ms (norme ${Math.round(Number(d.device_hrv_baseline))})`);
  return bits.join(", ") + ".";
}

const level = (z: number) => (z <= -0.5 ? "en dessous de" : z >= 0.5 ? "au-dessus de" : "dans");

/* Verdict d'un jour : `answers` = réponses du jour (le check-in qu'on vient d'enregistrer si fourni),
   `checkins` et `health` = l'historique (les jours postérieurs sont ignorés). null tant qu'une des
   deux normes manque (moins de 5 jours avant) ou sans données de nuit. */
export function physioVerdictAt(date: string, answers: PhysioCheckin, checkins: PhysioCheckinDay[], health: _HealthRow[], perspective: "athlete" | "coach" = "athlete"): PhysioVerdict | null {
  const today = _deviceInputsFor(date, health);
  const pToday = physioRaw(today);
  if (pToday == null) return null;
  const since = shiftIso(date, -PHYSIO_NORM_DAYS);
  const prior = checkins.filter(c => c.date < date && c.date >= since && (c.bedtime === undefined || c.bedtime != null));
  const zFeel = zOf(feelRaw(answers), prior.map(feelRaw));
  const priorPhysio = Array.from(new Set(health.filter(h => h.date < date && h.date >= since).map(h => h.date)))
    .map(d => physioRaw(_deviceInputsFor(d, health))).filter((x): x is number => x != null);
  const zPhysio = zOf(pToday, priorPhysio);
  if (zFeel == null || zPhysio == null) return null;
  const diff = zPhysio - zFeel;
  const coach = perspective === "coach";
  const detail = nightDetail(today);
  const P = coach ? "Ses" : "Tes", feelWord = coach ? "son ressenti" : "ton ressenti", norm = coach ? "sa norme" : "ta norme";
  const compare = `${P} données sont ${level(zPhysio)} leur norme, ${feelWord} ${level(zFeel)} ${norm}`;
  const lowFeel = lowItems(answers, prior);
  const low = feelList(lowFeel, coach);
  if (diff <= -DIFF_THRESHOLD) return { zFeel, zPhysio, diff, lowFeel, kind: "less", status: "Moins optimistes",
    title: `${P} données physiologiques sont moins optimistes que ${coach ? "lui" : "toi"}`,
    text: `${detail} ${compare} : ${coach ? "son" : "ton"} corps récupère peut-être moins bien ${coach ? "qu'il ne le sent" : "que tu ne le sens"}.` };
  if (diff >= DIFF_THRESHOLD) return { zFeel, zPhysio, diff, lowFeel, kind: "more", status: "Plus optimistes",
    title: `${coach ? "Son" : "Ton"} corps a mieux récupéré ${coach ? "qu'il ne le sent" : "que tu ne le sens"}`,
    text: `${detail} ${compare} : la fatigue ressentie ne se voit pas dans ${coach ? "sa" : "ta"} nuit${low ? `. Elle vient de ${low}` : " (stress, courbatures, motivation ?)"}.` };
  return { zFeel, zPhysio, diff, lowFeel, kind: "agree", status: "D'accord",
    title: `${P} données physiologiques confirment ${coach ? "son" : "ton"} ressenti`, text: `${detail} ${compare}.` };
}

function shiftIso(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
