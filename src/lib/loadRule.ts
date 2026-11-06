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

/* Un seul découpage de difficulté (06/11, Gildas : « Dur + », « maîtrisable », « Dure » dans le même
   encadré). Calé sur les libellés CR-10 de l'anneau : 1-3 facile à modéré, 4-6 « Un peu dur » à « Dur + »,
   7-10 « Très dur » et plus. Même mot dans l'anneau (difficultyWord) et dans ces règles. */
export const HARD_FROM = 7, MODERATE_FROM = 4;
export function difficultyWord(v: number): "Facile" | "Dure" | "Très dure" {
  const r = Math.round(v);
  return r >= HARD_FROM ? "Très dure" : r >= MODERATE_FROM ? "Dure" : "Facile";
}

function dayMax(sessions: { target_difficulty?: number | null; rpe?: number | null }[]): number {
  if (!sessions.length) return 0;
  return Math.round(Math.max(...sessions.map(s => s.rpe ?? s.target_difficulty ?? 6)));
}

export function loadRule(
  sessions: { target_difficulty?: number | null; rpe?: number | null; done?: boolean }[],
  ctx?: LoadContext
): LoadRule {
  const cur = dayMax(sessions);
  const prev = Math.round(ctx?.prevMax ?? 0);
  const next = Math.round(ctx?.nextMax ?? 0);
  const H = HARD_FROM, M = MODERATE_FROM;

  /* ─── TRÈS DURE ─── */
  if (cur >= H) {
    if (prev >= H && next >= H)
      return { cls: "hard", tag: "Très dure", title: "Bloc de surcharge", text: "Trois jours très durs de suite : risque élevé de surmenage. Remplace une séance par de la récupération active." };
    if (prev >= H && next === 0)
      return { cls: "hard", tag: "Très dure", title: "Deux très dures, récup demain", text: "Deux jours très durs de suite, mais récupération prévue demain : tiens bon." };
    if (prev >= H)
      return { cls: "hard", tag: "Très dure", title: "Très dures de suite", text: "Deuxième séance très dure d'affilée. Prévois une vraie récupération demain : sommeil, hydratation, alimentation." };
    if (next >= H)
      return { cls: "hard", tag: "Très dure", title: "Double charge à venir", text: "Séance très dure aujourd'hui et demain. Gère l'intensité pour ne pas arriver épuisé demain." };
    if (prev >= M && next >= M)
      return { cls: "hard", tag: "Très dure", title: "Très dure dans un bloc dur", text: "Entourée de séances dures : surveille la fatigue et soigne la récupération autour." };
    if (prev >= M)
      return { cls: "hard", tag: "Très dure", title: "Très dure après une dure", text: "Montée d'intensité bien placée. Récupère bien ce soir pour absorber la charge." };
    if (next >= M)
      return { cls: "hard", tag: "Très dure", title: "Très dure avant une dure", text: "Bonne structure : la séance de demain, moins dure, laisse le temps de récupérer." };
    return { cls: "hard", tag: "Très dure", title: "Séance très dure isolée", text: "Bien placée si elle reste isolée : les jours plus légers autour absorbent la charge." };
  }

  /* ─── DURE ─── */
  if (cur >= M) {
    if (prev >= H)
      return { cls: "moderate", tag: "Dure", title: "Décharge après intensité", text: "Moins dure que la séance d'hier : bonne dégressivité pour consolider les acquis." };
    if (next >= H)
      return { cls: "moderate", tag: "Dure", title: "Prépa séance très dure", text: "Séance très dure demain : gère l'intensité aujourd'hui pour y arriver en forme." };
    if (prev >= M && next >= M)
      return { cls: "moderate", tag: "Dure", title: "Bloc de volume soutenu", text: "Troisième jour dur de suite. Surveille les signes de fatigue cumulée." };
    if (prev >= M)
      return { cls: "moderate", tag: "Dure", title: "Deux dures de suite", text: "Enchaîner deux séances dures passe si tu varies le stimulus : volume, intensité ou récupération active." };
    if (next >= M)
      return { cls: "moderate", tag: "Dure", title: "Dure avant une dure", text: "Demain est dure aussi : varie le stimulus entre les deux, volume ou intensité." };
    return { cls: "moderate", tag: "Dure", title: "Séance dure isolée", text: "Bien placée : les jours plus légers autour laissent le temps d'absorber la charge." };
  }

  /* ─── FACILE ─── */
  if (cur > 0) {
    if (prev >= H)
      return { cls: "easy", tag: "Facile", title: "Décharge utile", text: "Séance facile bien placée après l'intensité d'hier : bon tampon de récupération." };
    if (next >= H)
      return { cls: "easy", tag: "Facile", title: "Activation pré-intensité", text: "Séance facile avant une journée très dure : parfait pour activer sans épuiser." };
    return { cls: "easy", tag: "Facile", title: "Variation utile", text: "Séance facile : bon tampon entre deux charges ou support technique sans trop de fatigue." };
  }

  /* ─── REPOS ─── */
  if (prev >= H)
    return { cls: "rest", tag: "Libre", title: "Récupération méritée", text: "Récupération bien méritée après la charge d'hier. Priorité : sommeil et apports nutritionnels." };
  if (prev >= M && next >= M)
    return { cls: "rest", tag: "Libre", title: "Coupure dans le bloc", text: "Pause bienvenue dans le bloc de volume. Elle crée de l'espace pour la suite." };
  return { cls: "rest", tag: "Libre", title: "Récupération", text: "Journée ouverte : elle crée de l'espace dans le bloc de charge." };
}
