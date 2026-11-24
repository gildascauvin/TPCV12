/* Série du jour (P1, 24/11/2026, POC planning-editeur/poc-tests-objectifs v16).
   Une journée est validée par le point forme ET la séance prévue faite (allégée ou pas), ou par le
   point forme seul un jour sans séance prévue. Jour sauvé : séance prévue non faite alors que la
   reco du jour était d'alléger (la forme demandait de lever le pied) — c'est l'autorégulation qui
   protège la série. Un jour oublié remet la série à zéro (Gildas : « au plus simple »), le record reste.
   Pur : aucune lecture en base ici, voir /api/streak. */

export type DayKind = "session" | "rest" | "saved" | "missed" | "pending";

export interface StreakDayInput {
  date: string;
  checkin: boolean;
  /* Séances du jour : faite ? reco d'alléger au point forme ? */
  sessions: { done: boolean; lowProposal: boolean }[];
}

export interface StreakDay { date: string; kind: DayKind; validated: boolean }

export interface StreakState {
  today: { checkin: boolean; planned: boolean; done: boolean; validated: boolean; kind: DayKind };
  current: number;
  record: number;
  saved: number;
  week: StreakDay[]; // lundi → dimanche de la semaine en cours
  days: StreakDay[];
}

export function classifyDay(d: StreakDayInput, isToday: boolean): StreakDay {
  const planned = d.sessions.length > 0;
  const done = d.sessions.some(s => s.done);
  if (d.checkin && (!planned || done)) return { date: d.date, kind: done ? "session" : "rest", validated: true };
  if (d.checkin && planned && d.sessions.some(s => s.lowProposal)) return { date: d.date, kind: "saved", validated: true };
  return { date: d.date, kind: isToday ? "pending" : "missed", validated: false };
}

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** `from` = premier jour compté (inscription), `today` = jour local du sportif. */
export function computeStreak(input: StreakDayInput[], from: string, today: string): StreakState {
  const byDate = new Map(input.map(d => [d.date, d]));
  const days: StreakDay[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) days.push(classifyDay(byDate.get(d) ?? { date: d, checkin: false, sessions: [] }, d === today));

  let record = 0, run = 0;
  for (const d of days) { if (d.validated) { run++; record = Math.max(record, run); } else if (d.kind === "missed") run = 0; }
  /* Série en cours : on remonte depuis aujourd'hui (en cours = ne casse pas), jusqu'au 1er jour manqué. */
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.validated) current++;
    else if (d.kind === "pending") continue;
    else break;
  }
  const t = days[days.length - 1];
  const tIn = byDate.get(today);
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -dow);
  const week: StreakDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return days.find(x => x.date === date) ?? { date, kind: date > today ? "pending" : "missed", validated: false };
  });
  return {
    today: { checkin: !!tIn?.checkin, planned: (tIn?.sessions.length ?? 0) > 0, done: !!tIn?.sessions.some(s => s.done), validated: !!t?.validated, kind: t?.kind ?? "pending" },
    current, record: Math.max(record, current), saved: days.filter(d => d.kind === "saved").length, week, days,
  };
}

/* Récompenses : les étapes de l'ancienne checklist d'onboarding d'abord, puis celles de l'entraînement.
   Toutes dérivées des données (jamais cochées à la main). */
export type RewardKey = "form" | "build" | "adjust" | "unlock" | "fatigue" | "listened" | "streak7" | "perfect_week" | "streak30" | "streak100";
export interface Reward {
  key: RewardKey; label: string; hint: string; won: string; earned: boolean; on?: string | null;
  /* Progression vers la récompense (séries de jours, semaine parfaite) : « plus que 2 jours ». */
  progress?: { value: number; total: number } | null;
  /* Quand la progression repart de zéro (semaine déjà manquée) : on le dit plutôt que de cacher la jauge. */
  note?: string | null;
}

export const REWARD_META: Record<RewardKey, { label: string; hint: string; won: string }> = {
  form: { label: "1er point forme", hint: "10 secondes : ta séance se règle dessus", won: "Ta séance se règle maintenant sur ta forme du jour." },
  build: { label: "Ton programme", hint: "Un programme ou une séance prévue", won: "Il y a une séance à ajuster : le moteur peut travailler." },
  adjust: { label: "Ta 1re décision", hint: "Fais ta séance réglée par ton point forme", won: "Ta première séance réglée sur ta forme, pas sur un plan figé." },
  unlock: { label: "Elite débloqué", hint: "La décision chaque jour, tes tendances et tes tests", won: "La décision chaque jour, tes tendances et l'analyse de tes tests." },
  fatigue: { label: "Fatigue bien gérée", hint: "Fais ta séance allégée un jour où ta forme le demande", won: "Fatigué, tu as allégé au lieu de forcer. C'est comme ça qu'on progresse." },
  listened: { label: "Écouté ton corps", hint: "Lève le pied quand ta forme le demande", won: "Ta forme demandait de lever le pied, tu l'as fait. Ta série tient." },
  streak7: { label: "7 jours d'affilée", hint: "7 journées validées de suite", won: "Une semaine entière sans trou. L'habitude est lancée." },
  perfect_week: { label: "1re semaine parfaite", hint: "Lundi à dimanche, tout validé", won: "Sept jours sur sept, du lundi au dimanche." },
  streak30: { label: "30 jours d'affilée", hint: "30 journées validées de suite", won: "Un mois complet. Peu de sportifs tiennent ce rythme." },
  streak100: { label: "100 jours d'affilée", hint: "100 journées validées de suite", won: "Cent jours. Ta forme n'a plus de secret pour toi." },
};

/** `tiredDates` : jours où une séance a été faite alors que la reco du point forme était d'alléger. */
export function trainingRewards(s: StreakState, tiredDates: Set<string>): Reward[] {
  const firstOf = (pred: (d: StreakDay) => boolean) => s.days.find(pred)?.date ?? null;
  const runReach = (n: number) => { let run = 0; for (const d of s.days) { if (d.validated) { run++; if (run >= n) return d.date; } else if (d.kind === "missed") run = 0; } return null; };
  let perfect: string | null = null;
  for (let i = 0; i + 6 < s.days.length && !perfect; i++) {
    const d0 = new Date(`${s.days[i].date}T12:00:00Z`);
    if (d0.getUTCDay() !== 1) continue;
    if (s.days.slice(i, i + 7).every(d => d.validated)) perfect = s.days[i + 6].date;
  }
  const make = (key: RewardKey, on: string | null, progress?: { value: number; total: number } | null): Reward => ({ key, ...REWARD_META[key], earned: !!on, on, progress: on ? null : progress ?? null });
  /* Semaine en cours : jours validés depuis lundi, tant qu'aucun n'est manqué. */
  const weekMissed = s.week.some(d => d.kind === "missed");
  const weekDone = s.week.filter(d => d.validated).length;
  return [
    make("fatigue", firstOf(d => d.validated && tiredDates.has(d.date))),
    make("listened", firstOf(d => d.kind === "saved")),
    make("streak7", runReach(7), { value: Math.min(s.current, 7), total: 7 }),
    { ...make("perfect_week", perfect, weekMissed ? null : { value: weekDone, total: 7 }), note: !perfect && weekMissed ? "Un jour manque cette semaine : ça repart lundi." : null },
    make("streak30", runReach(30), { value: Math.min(s.current, 30), total: 30 }),
    make("streak100", runReach(100), { value: Math.min(s.current, 100), total: 100 }),
  ];
}
