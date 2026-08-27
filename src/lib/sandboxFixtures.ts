import { format, addDays } from "date-fns";
import type { Profile, Session, WellnessDaily, CoachAthlete, CoachSession } from "@/types";
import { computeAutoregSuggestion } from "@/lib/autoregulation";
import { buildDailyTimeSeries, computeSignature, type AthleteSignature } from "@/lib/fatigueSignature";
import { computeWeekOverWeekTrend, describeTrend, trendSeverity, trendActionWord, type TrendCode } from "@/lib/trainingLoad";
import type { AthleteTrendInsight } from "@/lib/athletesData";

/* Données fictives pour la sandbox non authentifiée (2026-08-19) — brief : "les programmes doivent
   utiliser des dates relatives à Today, toujours avoir une séance pertinente pour Today". Tout est
   calculé au moment du render (pas de dates figées en dur) à partir de `new Date()`, donc reste
   cohérent quel que soit le jour de consultation. Fonctions pures, zéro dépendance Supabase — la
   sandbox ne fait jamais de vraie écriture/lecture DB, voir useSandboxGate.ts. */

function dstr(base: Date, offset: number) {
  return format(addDays(base, offset), "yyyy-MM-dd");
}

/* Oscillation déterministe (pas de Math.random — reproductible entre renders serveur/client) pour
   un historique de récupération réaliste sans données inventées "au pif" à chaque jour.

   10 "gabarits" jour (score + comportements) qui cyclent sur l'historique — chaque comportement
   apparaît ~4x sur les 39 jours cyclés (offset -3 à -41), largement au-dessus du seuil minimal de
   computeBehaviorCorrelations() (≥2 jours avec ET ≥2 jours sans, voir conseilsData.ts) — sans quoi
   la carte "Impact comportements" reste vide (comportements vus une seule fois chacun dans la 1ère
   version de ce fichier, jamais assez pour calculer une corrélation). Score et comportement du même
   gabarit sont volontairement cohérents (comportements négatifs → score bas, positifs → score haut)
   pour que la corrélation calculée soit réellement lisible, pas juste présente. offset 0/-1/-2 restent
   fixes (42/50/58, voir CROSSFIT_TODAY) — c'est la tendance récente qui alimente l'AHA autorégulation,
   inchangée par cet enrichissement. */
const DAY_TEMPLATES: { score: number; behaviors: string[] }[] = [
  { score: 48, behaviors: ["late_sleep"] },
  { score: 82, behaviors: ["hydration"] },
  { score: 45, behaviors: ["social_out", "screen_late"] },
  { score: 75, behaviors: [] },
  { score: 88, behaviors: ["stretching", "meditation"] },
  { score: 52, behaviors: ["alcohol"] },
  { score: 70, behaviors: [] },
  { score: 85, behaviors: ["walk"] },
  { score: 50, behaviors: ["heavy_meal", "caffeine_late"] },
  { score: 78, behaviors: ["cold_shower"] },
];

function dayTemplateFor(offset: number) {
  return DAY_TEMPLATES[Math.abs(offset) % DAY_TEMPLATES.length];
}

function wellnessScoreFor(offset: number): number {
  if (offset === 0) return 42;   // aujourd'hui — volontairement bas, voir CROSSFIT_TODAY plus bas
  if (offset === -1) return 50;
  if (offset === -2) return 58;
  return dayTemplateFor(offset).score;
}

function behaviorsFor(offset: number): string[] {
  if (offset === 0) return ["late_sleep", "social_out"];
  if (offset === -1) return ["screen_late"];
  if (offset === -2) return [];
  return dayTemplateFor(offset).behaviors;
}

/* ============================= SPORTIF — 1 profil CrossFit ============================= */

const CROSSFIT_ARCHETYPES = [
  { name: "Force — Back squat", notes: "Back squat — 5×5@75%\nSoulevé de terre roumain — 4×8@60kg\nGainage complet — 3×40s", baseDiff: 7 },
  { name: "Conditioning — WOD", notes: "Wall balls — 3×15@9kg\nKettlebell swings — 3×20@24kg\nWOD — Metcon — AMRAP 20 min\nÉchauffement — 10 min", baseDiff: 8 },
  { name: "Haltérophilie — Technique", notes: "Épaulé-jeté — 6×2@70%\nArraché — 5×2@65%\nTirage nuque — 3×5@40kg", baseDiff: 6 },
  { name: "Gymnastics/Mixed — Skill", notes: "Muscle-up — 5×3\nThrusters lestés — 4×8@30kg\nAMRAP 12 min — burpees, kb swings, box jumps\nHandstand hold — 3×30s", baseDiff: 6 },
];

/* Aujourd'hui forcé — wellness 42 + séance dure (8) → computeAutoregSuggestion déclenche "Alléger"
   (⚠️ -15%, wellness<60 && diff>=7) dès l'ouverture, sans que le visiteur ait rien à renseigner.
   Plusieurs lignes avec de vrais tokens ajustables (kg, NxM, min) — pas juste une durée
   d'échauffement — pour que l'aperçu Alléger/Surcharger montre un vrai changement visible sur
   toute la séance, pas une seule ligne (retour direct de Gildas après test réel). */
const CROSSFIT_TODAY = {
  name: "WOD — Fran",
  notes: "Thrusters — 21-15-9 reps @ 42,5kg\nTractions lestées — 21-15-9 reps @ 12,5kg\nÉchauffement — 10 min",
  baseDiff: 8,
};

let sandboxIdCounter = 0;
function sid(prefix: string) { return `sandbox-${prefix}-${sandboxIdCounter++}`; }

export interface AthleteFixture {
  profile: Profile;
  todayStr: string;
  sessions: Session[];
  wellnessByDate: Record<string, WellnessDaily>;
}

export function buildAthleteFixture(now: Date = new Date()): AthleteFixture {
  sandboxIdCounter = 0;
  const todayStr = dstr(now, 0);
  const userId = "sandbox-athlete";

  const profile: Profile = {
    id: sid("profile"), user_id: userId, name: "Toi (démo)", sport: "CrossFit", objective: "performance",
    freq_target: 4, mode: "athlete", subscription_status: "free", stripe_customer_id: null,
    onboarding_done: true, invite_code: null, training_days: [1, 3, 5, 6],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };

  const sessions: Session[] = [];
  const wellnessByDate: Record<string, WellnessDaily> = {};

  // Programme 4 semaines "varié" (-21 à +21), séances Lun/Mer/Ven/Sam — 4 archétypes en rotation
  // (Force/Conditioning/Haltéro/Gym), sauf aujourd'hui, forcé sur CROSSFIT_TODAY (voir plus haut).
  for (let offset = -41; offset <= 21; offset++) {
    const date = addDays(now, offset);
    const dow = date.getDay(); // 0=dim..6=sam
    const isToday = offset === 0;
    const isTrainingDay = [1, 3, 5, 6].includes(dow);
    // "Toujours avoir une séance pertinente pour Today" (brief) — aujourd'hui ne doit jamais
    // dépendre du jour de la semaine, sinon la séance forcée CROSSFIT_TODAY (et donc l'AHA de
    // l'autorégulation) disparaît purement et simplement les jours où "aujourd'hui" tombe hors du
    // pattern Lun/Mer/Ven/Sam (bug réel trouvé en testant en direct, pas en relisant le code).
    if (!isTrainingDay && !isToday) continue;

    const dateStr = dstr(now, offset);
    const archetype = isToday ? CROSSFIT_TODAY : CROSSFIT_ARCHETYPES[Math.abs(offset) % CROSSFIT_ARCHETYPES.length];
    const done = offset < 0;

    sessions.push({
      id: sid("session"), user_id: userId, date: dateStr, name: archetype.name, notes: archetype.notes,
      duration: done ? 55 : null, rpe: done ? archetype.baseDiff : null, done,
      target_difficulty: archetype.baseDiff, created_at: new Date().toISOString(),
    });

    // Wellness fictif pour les jours passés + aujourd'hui uniquement (jamais de check-in futur,
    // même convention que le vrai produit).
    if (offset <= 0 && !wellnessByDate[dateStr]) {
      const score = wellnessScoreFor(offset);
      wellnessByDate[dateStr] = {
        id: sid("wellness"), user_id: userId, date: dateStr,
        sleep: score < 50 ? 3 : score < 70 ? 5 : 7, stress: score < 50 ? 7 : 4, recovery: score < 50 ? 3 : 6, motivation: score < 50 ? 4 : 7,
        base_score: score, score,
        behaviors: behaviorsFor(offset),
        bedtime: "23:30", created_at: new Date().toISOString(),
      };
    }
  }
  // Jours de repos sans séance : wellness quand même renseigné pour garder un historique continu
  // (nécessaire à computeConseilsData/computeSignature, qui attendent des lignes wellness_daily
  // même sans séance ce jour-là).
  for (let offset = -41; offset <= 0; offset++) {
    const dateStr = dstr(now, offset);
    if (wellnessByDate[dateStr]) continue;
    const score = wellnessScoreFor(offset);
    wellnessByDate[dateStr] = {
      id: sid("wellness"), user_id: userId, date: dateStr,
      sleep: 6, stress: 4, recovery: 6, motivation: 6, base_score: score, score,
      behaviors: behaviorsFor(offset), bedtime: "23:00", created_at: new Date().toISOString(),
    };
  }

  return { profile, todayStr, sessions, wellnessByDate };
}

/* ============================= COACH — 5 sportifs, 5 sports ============================= */

interface AthleteSeed {
  name: string; sport: string; wellness: number; todayName: string; todayNotes: string; todayDiff: number;
  routineName: string; routineNotes: string; routineDiff: number;
}

// Wellness/difficulté du jour choisis pour garantir les 3 issues (Alléger/Maintenir/Surcharger),
// voir computeAutoregSuggestion (src/lib/autoregulation.ts) : wellness<60 && diff>=7 → alléger
// (severe si wellness<40) ; wellness>=80 && diff<=4 → surcharger ; sinon → plan cohérent.
const COACH_ATHLETE_SEEDS: AthleteSeed[] = [
  {
    name: "Léa Girard", sport: "Haltérophilie", wellness: 35,
    todayName: "Arraché — Bloc MRV", todayNotes: "Arraché — 5×3@85%\nTirage nuque — 4×5\nGainage — 3×40s", todayDiff: 8,
    routineName: "Épaulé-jeté — Technique", routineNotes: "Épaulé-jeté — 5×3@70%\nSquat clavicule — 4×5", routineDiff: 6,
  },
  {
    name: "Karim Haddad", sport: "Sprint", wellness: 50,
    todayName: "Vitesse max — 6×80m", todayNotes: "Gammes techniques — 15 min\nSprint 6×80m (récup 3 min)\nPliométrie — 3×8 bonds", todayDiff: 7,
    routineName: "Renfo — Bas du corps", routineNotes: "Squat — 4×6\nFentes bulgares — 3×10\nGainage — 3×40s", routineDiff: 5,
  },
  {
    name: "Sofia Renard", sport: "CrossFit", wellness: 85,
    todayName: "WOD léger — Skill", todayNotes: "Technique double-under — 10 min\nKettlebell swings — 3×15@16kg\nAMRAP 10 min — air squats, sit-ups", todayDiff: 3,
    routineName: "WOD — Metcon", routineNotes: "Wall balls — 3×15@9kg\nWOD — Metcon — AMRAP 20 min\nÉchauffement — 10 min", routineDiff: 7,
  },
  {
    name: "Thomas Morel", sport: "Football", wellness: 65,
    todayName: "Match amical", todayNotes: "Échauffement collectif — 15 min\nMatch amical — 90 min\nRetour au calme — 10 min", todayDiff: 6,
    routineName: "Séance technique", routineNotes: "Passes courtes — 20 min\nAteliers de finition — 20 min\nRondo — 15 min", routineDiff: 5,
  },
  {
    name: "Nora Lefebvre", sport: "Triathlon", wellness: 90,
    todayName: "Sortie vélo — Endurance", todayNotes: "Vélo Zone 2 — 60 min\nGainage — 3×40s", todayDiff: 4,
    routineName: "Sortie course + natation", routineNotes: "Course à pied — 45 min\nNatation technique — 30 min", routineDiff: 6,
  },
];

export interface CoachFixture {
  coachName: string;
  todayStr: string;
  athletes: CoachAthlete[];
  sessionsByDate: Record<string, CoachSession[]>;
  /* 42 jours d'historique par sportif (sessions + wellness fictif variable, pas juste le score fixe
     du jour) — alimente buildAthleteSignatures() ci-dessous pour que /coach/athletes affiche de
     vrais graphes Charge/Récupération pour les 5 sportifs démo, comme côté sportif, plutôt que le
     "Forme non renseignée" par défaut réservé aux démo dans le vrai produit (demande explicite de
     Gildas — exception assumée à la convention normale user_id===null→signature "manual"). */
  sessionsHistoryByAthlete: Record<string, Session[]>;
  wellnessHistoryByAthlete: Record<string, WellnessDaily[]>;
}

// Même principe que wellnessScoreFor (profil sportif) mais paramétré par le score "aujourd'hui" de
// chaque sportif — oscillation déterministe convergeant vers ce score, jamais de Math.random.
export function coachWellnessScoreFor(offset: number, todayScore: number): number {
  if (offset === 0) return todayScore;
  if (offset === -1) return Math.round((todayScore + 70) / 2);
  if (offset === -2) return Math.round((todayScore + 75) / 2);
  const wave = Math.round(75 + 9 * Math.sin(offset / 2.3));
  return Math.min(92, Math.max(30, wave));
}

export function buildCoachFixture(now: Date = new Date()): CoachFixture {
  sandboxIdCounter = 0;
  const coachId = "sandbox-coach";
  const todayStr = dstr(now, 0);

  const athletes: CoachAthlete[] = COACH_ATHLETE_SEEDS.map(seed => ({
    id: sid("athlete"), coach_id: coachId, name: seed.name, sport: seed.sport,
    wellness_score: seed.wellness, behaviors: [], wellnessFilledToday: true,
    user_id: null, invite_email: null, created_at: new Date().toISOString(),
  }));

  const sessionsByDate: Record<string, CoachSession[]> = {};
  const sessionsHistoryByAthlete: Record<string, Session[]> = {};
  const wellnessHistoryByAthlete: Record<string, WellnessDaily[]> = {};
  athletes.forEach(a => { sessionsHistoryByAthlete[a.id] = []; wellnessHistoryByAthlete[a.id] = []; });

  // -42 (au lieu de -14) : computeSignature/buildDailyTimeSeries exigent au moins ~41 jours de
  // recul pour que l'ACWR/Form aient une valeur sur toute la fenêtre affichée (même contrainte que
  // /conseils, voir athletesData.ts). +14 inchangé (fenêtre de navigation future du planning).
  for (let offset = -42; offset <= 14; offset++) {
    const date = addDays(now, offset);
    const dow = date.getDay();
    const isToday = offset === 0;
    if (![1, 3, 5].includes(dow) && !isToday) continue; // Lun/Mer/Ven, + toujours aujourd'hui
    const dateStr = dstr(now, offset);
    const done = offset < 0;

    const daySessions = COACH_ATHLETE_SEEDS.map((seed, i) => ({
      id: sid("csession"), coach_id: coachId, athlete_id: athletes[i].id, date: dateStr,
      name: isToday ? seed.todayName : seed.routineName,
      notes: isToday ? seed.todayNotes : seed.routineNotes,
      done, rpe: done ? (isToday ? seed.todayDiff : seed.routineDiff) : null,
      duration: done ? 55 : null,
      target_difficulty: isToday ? seed.todayDiff : seed.routineDiff,
      created_at: new Date().toISOString(),
    }));

    if (offset >= -14) sessionsByDate[dateStr] = daySessions;

    daySessions.forEach((s, i) => {
      const athleteId = athletes[i].id;
      sessionsHistoryByAthlete[athleteId].push({
        id: s.id, user_id: athleteId, date: s.date, name: s.name, notes: s.notes,
        duration: s.duration, rpe: s.rpe, done: s.done, target_difficulty: s.target_difficulty,
        created_at: s.created_at,
      });
    });
  }

  athletes.forEach((a, i) => {
    const seed = COACH_ATHLETE_SEEDS[i];
    for (let offset = -42; offset <= 0; offset++) {
      const dateStr = dstr(now, offset);
      const score = coachWellnessScoreFor(offset, seed.wellness);
      wellnessHistoryByAthlete[a.id].push({
        id: sid("cwellness"), user_id: a.id, date: dateStr,
        sleep: score < 50 ? 3 : score < 70 ? 5 : 7, stress: score < 50 ? 7 : 4, recovery: score < 50 ? 3 : 6, motivation: score < 50 ? 4 : 7,
        base_score: score, score, behaviors: [], bedtime: "23:00", created_at: new Date().toISOString(),
      });
    }
  });

  return { coachName: "Toi (démo)", todayStr, athletes, sessionsByDate, sessionsHistoryByAthlete, wellnessHistoryByAthlete };
}

/* Construit signatures/tendances "ok" pour les 5 sportifs démo à partir de l'historique fictif
   ci-dessus — même calcul que getAthletesSignatures() (athletesData.ts) pour un vrai sportif, mais
   sans passer par Supabase (fonctions pures de fatigueSignature.ts/trainingLoad.ts réutilisées
   telles quelles, aucune logique dupliquée). */
export function buildAthleteSignatures(fixture: CoachFixture, now: Date = new Date()): {
  signatures: Record<string, AthleteSignature>;
  trends: Record<string, TrendCode | null>;
  trendInsights: Record<string, AthleteTrendInsight>;
} {
  const signatures: Record<string, AthleteSignature> = {};
  const trends: Record<string, TrendCode | null> = {};
  const trendInsights: Record<string, AthleteTrendInsight> = {};

  for (const a of fixture.athletes) {
    const mySessions = fixture.sessionsHistoryByAthlete[a.id] ?? [];
    const myWellness = fixture.wellnessHistoryByAthlete[a.id] ?? [];
    const { code, input } = computeWeekOverWeekTrend(mySessions, myWellness, now);
    trends[a.id] = code;
    const coachText = code ? describeTrend(code, input, "coach") : null;
    trendInsights[a.id] = coachText
      ? { text: coachText, emoji: trendSeverity(code!) === "alert" ? "🔴" : trendSeverity(code!) === "watch" ? "🟡" : "🟢", action: trendActionWord(code!) }
      : null;
    const refWellness = myWellness.find(w => w.date === fixture.todayStr);
    const wellnessScore = refWellness?.score ?? refWellness?.base_score ?? 75;
    const series = buildDailyTimeSeries(mySessions, myWellness, 42, now);
    const sig = computeSignature(mySessions, wellnessScore, 28, now);
    signatures[a.id] = { kind: "ok", series, sig };
  }

  return { signatures, trends, trendInsights };
}

/* Vérification de cohérence — les 3 issues (Alléger/Maintenir/Surcharger) doivent bien apparaître
   dans le dataset coach, sinon la démo "recommandation" ne montre pas tout ce qu'elle promet. Pas
   un test formel (pas de suite de tests dans ce repo), juste une garde lisible en review de code. */
export function debugCoachOutcomes(fixture: CoachFixture): { name: string; outcome: "alléger" | "surcharger" | "stable" }[] {
  const today = fixture.sessionsByDate[fixture.todayStr] ?? [];
  return fixture.athletes.map(a => {
    const s = today.find(x => x.athlete_id === a.id);
    const suggestion = s ? computeAutoregSuggestion(a.wellness_score, s.target_difficulty) : null;
    return { name: a.name, outcome: suggestion ? (suggestion.dir === "low" ? "alléger" : "surcharger") : "stable" };
  });
}
