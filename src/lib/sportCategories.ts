// Extrait de OnboardingFlow.tsx (2026-09-04) pour être partagé avec ProgramLibraryBrowser.tsx —
// mêmes 8 catégories affichées comme chips à sport_2a, réutilisées comme filtres sur la bibliothèque
// publique native (voir sa doc). Un seul point de vérité, pas de duplication.
//
// Icônes Endurance/Sports collectifs volontairement génériques (2026-09-07, retour de Gildas) —
// 🏊/⚽ montraient le même emoji sur des programmes réellement différents (un programme Aviron ou
// Rugby affichait l'icône d'un tout autre sport de sa famille) : 🫀 (cardio)/👥 (équipe) représentent
// la famille sans en privilégier un membre. Le niveau spécifique par programme (Rugby→🏉,
// Natation→🏊…) vit dans `programSportEmoji()` plus bas, qui retombe sur ces icônes de catégorie
// pour un sport non reconnu individuellement (ex. "Endurance" seule, sans discipline précisée).
export const SPORT_CATEGORIES = [
  { id: "Haltérophilie",              icon: "🏋️", sub: "Arraché, épaulé-jeté" },
  { id: "Powerlifting",               icon: "🦍", sub: "Squat, développé couché, soulevé de terre" },
  { id: "Musculation / Hypertrophie", icon: "💪", sub: "Prise de masse, split par groupe musculaire" },
  { id: "Fitness / CrossFit",         icon: "🔥", sub: "Conditionnement croisé" },
  { id: "Athlétisme & vitesse",       icon: "🏃", sub: "Sprint, saut, lancer…" },
  { id: "Sports collectifs",          icon: "👥", sub: "Rugby, handball, basket, foot…" },
  { id: "Endurance",                  icon: "🫀", sub: "Course, cyclisme, natation…" },
  { id: "Arts martiaux & combat",     icon: "🥋", sub: "Judo, MMA, boxe…" },
];

// Catégories supplémentaires, extraites de ProgramLibraryBrowser.tsx (2026-09-07) pour être
// réutilisées aussi par programSportEmoji() ci-dessous — un seul point de vérité, plus de
// duplication entre le regroupement des filtres (categoryFor(), resté local à ce fichier appelant)
// et le repli d'icône par programme.
export const EXTRA_CATEGORIES = [
  { id: "Rééducation & Prévention", icon: "🩹", match: /pr[ée]vention|r[ée][ée]ducation/i },
  { id: "Concours & Sélections",    icon: "🎖️", match: /gendarmerie|police|sapeur|gign|arm[ée]e/i },
] as const;
export const OTHER_CATEGORY = { id: "Autres sports", icon: "🧭" };

// Niveau "programme" (spécifique) — vérifié AVANT le niveau "catégorie" (large, ci-dessus) : un
// ballon/discipline précis plutôt que la silhouette générique de la famille, quand Unicode a le
// glyphe. Zones de rééducation mappées sur l'emoji anatomique le plus proche disponible — Unicode
// n'a pas de glyphe par protocole (genou classique/LCA/rotulien partagent 🦵, faute de mieux) ni de
// glyphe "talon" distinct de "cheville" (Achille récupère 🩹 plutôt que de collisionner avec 🦶).
const SPECIFIC_SPORT_EMOJI: { match: RegExp; icon: string }[] = [
  // Rééducation par zone — vérifiée avant tout mot-clé sport générique
  { match: /achille/i, icon: "🩹" },
  { match: /cheville/i, icon: "🦶" },
  { match: /lombaire/i, icon: "🦴" },
  { match: /[ée]paule/i, icon: "🤷" },
  { match: /genou|p[ée]riostite/i, icon: "🦵" },
  // Concours et sélections professionnelles
  { match: /sapeur|pompier/i, icon: "🚒" },
  { match: /police/i, icon: "👮" },
  { match: /gign/i, icon: "🎯" },
  { match: /arm[ée]e/i, icon: "🪖" },
  // Sports collectifs — un ballon précis par discipline
  { match: /rugby/i, icon: "🏉" },
  { match: /basket/i, icon: "🏀" },
  { match: /handball/i, icon: "🤾" },
  { match: /volley/i, icon: "🏐" },
  { match: /hockey/i, icon: "🏒" },
  { match: /baseball/i, icon: "⚾" },
  { match: /foot(ball)?/i, icon: "⚽" },
  // Endurance — discipline précise (trail vérifié avant la famille course/fond, dénivelé distinctif)
  { match: /nata|aqua|swim/i, icon: "🏊" },
  // "vélo" volontairement exclu : sous-chaîne "velo" trouvée par accident dans "Développé
  // couché" ("Dé-velo-ppé") lors de la vérification contre les vraies valeurs en base — "cycl"
  // (cyclisme/cycling) couvre déjà la vraie valeur DB "Vélo / Cyclisme" sans ce risque.
  { match: /cycl|bike/i, icon: "🚴" },
  { match: /aviron|rowing|rameur/i, icon: "🚣" },
  { match: /ski/i, icon: "⛷️" },
  { match: /trail/i, icon: "⛰️" },
  { match: /course|marathon|\bsemi\b|\b10k\b|footing|\bfond\b/i, icon: "🏃" },
  // Combat — précisé quand un glyphe distinct existe (le reste partage 🥋, icône de catégorie)
  { match: /boxe/i, icon: "🥊" },
  { match: /lutte/i, icon: "🤼" },
  // Sports individuels aujourd'hui sans catégorie dédiée (repli "Autres sports" sinon)
  { match: /golf/i, icon: "⛳" },
  { match: /[ée]quitation|cheval|[ée]questre/i, icon: "🏇" },
  { match: /escalade|grimpe/i, icon: "🧗" },
  { match: /voile|sailing/i, icon: "⛵" },
  { match: /bmx/i, icon: "🚲" },
  { match: /gymnastique/i, icon: "🤸" },
  { match: /padel/i, icon: "🎾" },
];

// Icône affichée par programme (cartes de bibliothèque, banner, "Mes programmes") — spécifique
// d'abord, repli sur l'icône de catégorie (SPORT_CATEGORIES/EXTRA_CATEGORIES), repli final
// OTHER_CATEGORY. Distinct de categoryFor() (local à ProgramLibraryBrowser.tsx, qui reste au niveau
// large pour le regroupement des filtres — pas un filtre par sport individuel, décision déjà prise).
export function programSportEmoji(sport?: string | null): string {
  if (!sport) return OTHER_CATEGORY.icon;
  for (const { match, icon } of SPECIFIC_SPORT_EMOJI) {
    if (match.test(sport)) return icon;
  }
  const known = guessSportChip(sport);
  if (known) {
    const c = SPORT_CATEGORIES.find(x => x.id === known);
    if (c) return c.icon;
  }
  const extra = EXTRA_CATEGORIES.find(c => c.match.test(sport));
  if (extra) return extra.icon;
  return OTHER_CATEGORY.icon;
}

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
  // "vélo" retiré (2026-09-07) : sous-chaîne "velo" trouvée par accident dans "Développé couché"
  // ("Dé-velo-ppé") en stress-testant programSportEmoji() — "cyclisme" seul couvre déjà les
  // vraies valeurs DB sans ce risque de faux positif.
  if (/endurance|course|cyclisme|natation|trail|triathlon|aviron|marathon|semi/.test(s)) return "Endurance";
  if (/combat|martiaux|boxe|judo|\bmma\b/.test(s)) return "Arts martiaux & combat";
  return null;
}
