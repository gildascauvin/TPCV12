import { attention, decisionText } from "@/components/coach/CoachAthleteCard";
import type { CoachAthlete } from "@/types";

/* Alerte "jour prioritaire" — logique/textes réels, partagés entre le carrousel réel (/week,
   /coach/planning, carte "Aujourd'hui" uniquement) et l'aperçu programme de l'onboarding
   (WeekPreviewStep.tsx, où le score peut être forcé/varié mais jamais la difficulté réelle). */
export type DayAlert = { border: string; glow: string; text: string };

/* Copie exacte des seuils/couleurs/textes de la carte réelle de TodayClient.tsx (fonction row(),
   sportif) — y compris le cas "wellness non rempli", déjà en prod. */
export function athleteAlertFor(score: number | null, maxDiff: number, wellnessFilledToday: boolean): DayAlert | null {
  if (!wellnessFilledToday) return { border: "rgba(255,255,255,.22)", glow: "rgba(255,255,255,.55)", text: "Complète ta récupération pour des conseils personnalisés" };
  if (score === null) return null;
  if (score < 55 && maxDiff >= 8) return { border: "rgba(212,64,0,.4)", glow: "#d44000", text: `🔥 Récupération basse · Séance à ${maxDiff}/10 prévue — allège à 6/10` };
  if (score < 55 && maxDiff >= 5) return { border: "rgba(212,64,0,.4)", glow: "#d44000", text: `⚠️ Récupération basse · Séance à ${maxDiff}/10 — surveille ton effort` };
  if (score < 55) return { border: "rgba(242,138,0,.4)", glow: "#f28a00", text: "💛 Récupération basse — journée allégée recommandée" };
  if (score >= 80 && maxDiff >= 8) return { border: "rgba(47,158,68,.4)", glow: "#2f9e44", text: `✅ Score ${score} · Séance à ${maxDiff}/10 — fenêtre idéale !` };
  return null;
}

/* Reprend telle quelle la logique/texte de l'encart décision de CoachCard (attention()/decisionText(),
   CoachAthleteCard.tsx). N'est renvoyé que quand isPriority est vrai (comme le badge "Attention
   requise" réel) — "Plan cohérent" n'a rien de notable à signaler, donc pas d'encart dans ce cas. */
export function coachAlertFor(athlete: CoachAthlete, maxDiff: number): DayAlert | null {
  if (!attention(athlete, maxDiff)) return null;
  return { border: "rgba(212,64,0,.4)", glow: "#d44000", text: `💛 ${decisionText(athlete, maxDiff)}` };
}
