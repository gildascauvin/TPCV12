export interface LoadContext {
  prevMax: number;
  nextMax: number;
}

export interface LoadRule {
  title: string;
  tag: string;
  text: string;
  cls: "hard" | "moderate" | "easy" | "rest";
}

export const ruleTagColors: Record<string, { bg: string; color: string }> = {
  hard:     { bg: "#ffe9df", color: "#d44000" },
  moderate: { bg: "#fff1d8", color: "#b96500" },
  easy:     { bg: "#e4f3e8", color: "#166534" },
  rest:     { bg: "#e7e7e7", color: "#666" },
};

function dayMax(sessions: { target_difficulty?: number | null; rpe?: number | null }[]): number {
  if (!sessions.length) return 0;
  return Math.max(...sessions.map(s => s.rpe ?? s.target_difficulty ?? 6));
}

export function loadRule(
  sessions: { target_difficulty?: number | null; rpe?: number | null; done?: boolean }[],
  ctx?: LoadContext
): LoadRule {
  const cur = dayMax(sessions);
  const prev = ctx?.prevMax ?? 0;
  const next = ctx?.nextMax ?? 0;

  /* ─── HARD ≥ 8 (« très dure ») ─── */
  if (cur >= 8) {
    if (prev >= 8 && next >= 8)
      return { cls: "hard", tag: "🔴 Critique", title: "Bloc de surcharge", text: "Trois jours très durs consécutifs : risque élevé de surmenage. Remplace une séance par de la récupération active." };
    if (prev >= 8 && next === 0)
      return { cls: "hard", tag: "⚠️ Attention", title: "Très dures consécutives, récup demain", text: "Deux jours très durs de suite mais récupération prévue demain — tiens bon." };
    if (prev >= 8)
      return { cls: "hard", tag: "⚠️ Attention", title: "Séances très dures consécutives", text: "Deuxième séance très dure d'affilée. Prévois une récupération sérieuse demain : sommeil, hydratation, alimentation." };
    if (next >= 8)
      return { cls: "hard", tag: "⚠️ Attention", title: "Double charge à venir", text: "Séance très dure aujourd'hui et demain. Gère l'intensité pour ne pas arriver épuisé demain." };
    if (prev >= 5 && next <= 4)
      return { cls: "hard", tag: "Charge haute", title: "Séance très dure après une dure", text: "Montée d'intensité bien placée. Récupère bien ce soir pour absorber la charge." };
    if (prev <= 4 && next >= 5 && next < 8)
      return { cls: "hard", tag: "Charge haute", title: "Séance très dure avant une dure", text: "Bonne structure : la séance de demain laissera du temps de récupération." };
    return { cls: "hard", tag: "Charge haute", title: "Séance très dure isolée", text: "OK si elle reste isolée : garde la variation autour pour préserver la récupération." };
  }

  /* ─── MODERATE 5-7 (« dure » pour l'utilisateur, Foster 5 = Dur) ─── */
  if (cur >= 5) {
    if (prev >= 8)
      return { cls: "moderate", tag: "Dure", title: "Décharge après intensité", text: "Bonne dégressivité après la séance très dure d'hier. Profites-en pour consolider les acquis." };
    if (prev >= 5 && next >= 8)
      return { cls: "moderate", tag: "Dure", title: "Prépa séance très dure", text: "Séance très dure demain — gère l'intensité aujourd'hui pour y arriver en forme." };
    if (prev >= 5 && next >= 5 && next < 8)
      return { cls: "moderate", tag: "Dure", title: "Bloc de volume soutenu", text: "Troisième jour de charge dure consécutif. Surveille les signes de fatigue cumulée." };
    return { cls: "moderate", tag: "Dure", title: "Charge maîtrisable", text: "Enchaîner des séances dures est acceptable si tu varies le stimulus : volume, intensité ou récupération active." };
  }

  /* ─── EASY 1-4 ─── */
  if (cur > 0) {
    if (prev >= 8)
      return { cls: "easy", tag: "Facile", title: "Décharge utile", text: "Séance facile bien placée après l'intensité d'hier : bon tampon de récupération." };
    if (next >= 8)
      return { cls: "easy", tag: "Facile", title: "Activation pré-intensité", text: "Séance facile avant une journée très dure : parfait pour activer sans épuiser." };
    return { cls: "easy", tag: "Facile", title: "Variation utile", text: "Séance facile : bon tampon entre deux charges ou support technique sans trop de fatigue." };
  }

  /* ─── REST ─── */
  if (prev >= 8)
    return { cls: "rest", tag: "Libre", title: "Récupération méritée", text: "Récupération bien méritée après la charge d'hier. Priorité : sommeil et apports nutritionnels." };
  if (prev >= 5 && next >= 5)
    return { cls: "rest", tag: "Libre", title: "Coupure dans le bloc", text: "Pause bienvenue dans le bloc de volume. Elle crée de l'espace pour la suite." };
  return { cls: "rest", tag: "Libre", title: "Récupération", text: "Journée ouverte : elle crée de l'espace dans le bloc de charge." };
}
