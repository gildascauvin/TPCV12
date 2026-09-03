import { getSessionTemplates } from "@/lib/sessionTemplates";

function toIso(d: Date): string {
  return d.toISOString().split("T")[0];
}

/* La séance du jour de la création (démo ou placeholder d'invite) est TOUJOURS explicitement titrée
   "Séance démo" (2026-09-03, demande explicite de Gildas) — remplace l'ancien filet "aujourd'hui
   seulement si ce n'est pas déjà un jour programmé" (qui ne se déclenchait que 3 jours sur 7, avec un
   nom de curriculum ordinaire les 4 autres jours) : désormais aujourd'hui est systématiquement exclu
   de la rotation de séances au nom réel du sport et reçoit sa propre entrée dédiée, pour que le coach
   (ou le sportif invité, une fois qu'il a rejoint et voit encore cette ligne) comprenne immédiatement
   que c'est un exemple à explorer, pas une vraie séance planifiée. Contenu réel du sport (mêmes
   exercices que le reste de la banque) ; difficulté fixée à `rpeBase`, qui pilote avec le
   wellness_score du profil (fixé par l'appelant — voir DEMO_ATHLETES dans OnboardingFlow.tsx et
   PLACEHOLDER_WELLNESS_SCORE/PLACEHOLDER_RPE_BASE dans invite/create/route.ts) le vrai geste
   Alléger/Surcharger (computeAutoregSuggestion), exactement comme n'importe quelle vraie séance. */
export function buildCoachDemoSessions(coachId: string, athleteId: string, sport: string, rpeBase: number) {
  const templates = getSessionTemplates(sport);
  const today = new Date();
  const todayIso = toIso(today);
  const todayDow = today.getDay();
  const daysToCurrentMonday = todayDow === 0 ? -6 : 1 - todayDow;
  const dateForDow = (d: number, weekOffset: number): string => {
    const offset = d === 0 ? 6 : d - 1;
    const result = new Date(today);
    result.setDate(today.getDate() + daysToCurrentMonday + offset + weekOffset * 7);
    return toIso(result);
  };
  const sessions: object[] = [];

  // 4 semaines passées
  for (let weekOffset = -4; weekOffset <= -1; weekOffset++) {
    [1, 3, 5, 6].forEach((d, i) => {
      const offset = d === 0 ? 6 : d - 1;
      const result = new Date(today);
      result.setDate(today.getDate() + daysToCurrentMonday + offset + weekOffset * 7);
      if (result >= today) return;
      const sessionRpe = Math.max(1, Math.min(10, rpeBase + Math.round((Math.random() - 0.5) * 4)));
      const duration = 45 + Math.round(Math.random() * 30);
      const [name, notes] = templates[i % templates.length];
      sessions.push({ coach_id: coachId, athlete_id: athleteId, date: toIso(result), name, notes, done: true, target_difficulty: rpeBase, rpe: sessionRpe, duration });
    });
  }

  // 2 semaines futures (S0 + S1) — aujourd'hui exclu de cette rotation, voir "Séance démo" plus bas
  const scheduledDays = [1, 3, 5, 6];
  for (const weekOffset of [0, 1]) {
    scheduledDays.forEach((d, i) => {
      const date = dateForDow(d, weekOffset);
      if (date === todayIso) return;
      const [name, notes] = templates[i % templates.length];
      sessions.push({ coach_id: coachId, athlete_id: athleteId, date, name, notes, done: false, target_difficulty: rpeBase });
    });
  }

  // Séance du jour, toujours "Séance démo" (voir doc en tête de fonction) — garantit à la fois
  // qu'aujourd'hui n'est jamais vide (filtre hasSessions de Coach Control) et une difficulté stable
  // (rpeBase) quel que soit le jour de la semaine.
  const [, demoNotes] = templates[0];
  sessions.push({ coach_id: coachId, athlete_id: athleteId, date: todayIso, name: "Séance démo", notes: demoNotes, done: false, target_difficulty: rpeBase });

  return sessions;
}
