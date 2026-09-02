// Extrait de OnboardingFlow.tsx (2026-09-04) pour être partagé avec ProgramLibraryBrowser.tsx —
// mêmes 8 catégories affichées comme chips à sport_2a, réutilisées comme filtres sur la bibliothèque
// publique native (voir sa doc). Un seul point de vérité, pas de duplication.
export const SPORT_CATEGORIES = [
  { id: "Haltérophilie",              icon: "🏋️", sub: "Arraché, épaulé-jeté" },
  { id: "Powerlifting",               icon: "🦍", sub: "Squat, développé couché, soulevé de terre" },
  { id: "Musculation / Hypertrophie", icon: "💪", sub: "Prise de masse, split par groupe musculaire" },
  { id: "Fitness / CrossFit",         icon: "🔥", sub: "Conditionnement croisé" },
  { id: "Athlétisme & vitesse",       icon: "🏃", sub: "Sprint, saut, lancer…" },
  { id: "Sports collectifs",          icon: "⚽", sub: "Rugby, handball, basket, foot…" },
  { id: "Endurance",                  icon: "🏊", sub: "Course, cyclisme, natation…" },
  { id: "Arts martiaux & combat",     icon: "🥋", sub: "Judo, MMA, boxe…" },
];

/* Devine à quelle chip de SPORT_CATEGORIES rattacher visuellement le sport déduit d'un programme
   claimé (2026-08-29) — programs.sport porte des libellés de bibliothèque bien plus fins que les 8
   catégories de cet écran (ex. "Musculation/Hypertrophie" sans espaces, "Course à pied/Endurance",
   des titres de spécialisation type "Powerlifting — Spécialisation Squat"...) : une égalité stricte
   sur `sport === s.id` ne matcherait quasiment jamais, et aucune chip n'apparaîtrait présélectionnée
   — silencieusement, sans erreur. Mots-clés plutôt qu'égalité, purement pour l'affichage : `sport`
   garde sa valeur précise déduite pour la génération réelle (/api/programs/generate re-catégorise
   déjà finement via getSportCategory() côté serveur), seul le rendu de la chip s'appuie sur ce
   repli. */
export function guessSportChip(raw: string): string | null {
  const s = raw.toLowerCase();
  if (/hypertroph|musculation/.test(s)) return "Musculation / Hypertrophie";
  if (/power(lifting)?|squat|bench|deadlift/.test(s)) return "Powerlifting";
  if (/halt[ée]rophil|arrach|[ée]paul|snatch|clean.?jerk/.test(s)) return "Haltérophilie";
  if (/crossfit|hyrox|fitness/.test(s)) return "Fitness / CrossFit";
  if (/sprint|athl[ée]tisme|\bsaut|vitesse/.test(s)) return "Athlétisme & vitesse";
  if (/collectif|rugby|foot|hand|basket|volley/.test(s)) return "Sports collectifs";
  if (/endurance|course|cyclisme|natation|trail|triathlon|aviron|v[ée]lo|marathon|semi/.test(s)) return "Endurance";
  if (/combat|martiaux|boxe|judo|\bmma\b/.test(s)) return "Arts martiaux & combat";
  return null;
}
