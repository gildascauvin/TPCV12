/* Parcours de l'onboarding (extrait d'OnboardingFlow.tsx le 2026-10-17, pour être testé seul :
   scripts/onboarding-path.test.ts). Fonction pure : aucun accès au navigateur ni à la base.

   Parcours "Elite" (POC https://claude.ai/artifact/HopwXw7gFnAdRLpB496JvE, v26), derrière un
   interrupteur (readEliteFlag) : désactivé, le parcours est exactement celui d'avant.
   Argumentaire avant paywall (2026-10-29, POC https://claude.ai/artifact/Ma3E6NB8dAAhd7HwjjuVF7) :
     Sportif direct  : value_intro → decision_2a → account → questions programme → ob_plan (son
                       programme tel quel, ouvre le check-in) → ob_health (app iOS) → ob_decide
                       (« Tu fais quoi ? ») → ob_insight (ce que disent nos données) → ob_week (la
                       jauge de décision) → ob_notif (notifs possibles) → ob_pay
     Programme claimé : mêmes écrans sans les questions de programme.
     Sans programme (« plus tard », génération ou import raté) : mêmes écrans, une séance type de son
                       sport à la place du programme.
     Invité par un coach : value_intro → account, puis l'app directement (la checklist prend le relais ;
                       coach gratuit : le paywall arrive par le gating de l'app).
     Coach : value_intro → decision_2b → account → ob_sport → ob_count → questions programme →
                       ob_plan (son programme tel quel, puis le prénom d'un de ses sportifs et son point
                       forme imaginé) → ob_decide → ob_insight → ob_week (la séance de ce sportif) →
                       ob_invite → ob_notif → ob_pay (claimé : ob_count seul). */

export type Role = "athlete" | "coach";
export type ObHas = "import" | "generate" | "later" | null;

export type StepId =
  | "value_intro"
  | "decision_2a" | "decision_2b"
  | "account"
  // Questions post-signup (2026-10-05) : la configuration du « device » (le programme).
  | "ob_sport" | "ob_program" | "ob_import" | "ob_goal" | "ob_weak" | "ob_days" | "ob_invite"
  // Parcours Elite (2026-10-17).
  | "ob_when" | "ob_mirror" | "ob_health" | "ob_checkin" | "ob_week" | "ob_notif" | "ob_pay"
  // Parcours Elite coach (2026-10-19) : taille du groupe, puis Coach Control démo.
  | "ob_count" | "ob_control"
  // Argumentaire avant paywall (2026-10-29).
  | "ob_plan" | "ob_decide" | "ob_insight";

export const ATHLETE_PATH: StepId[] = ["value_intro", "decision_2a", "account"];
export const COACH_PATH: StepId[] = ["value_intro", "decision_2b", "account"];
export const PROGRAM_ATHLETE_PATH: StepId[] = ["value_intro", "decision_2a", "account"];
export const PROGRAM_COACH_PATH: StepId[] = ["value_intro", "decision_2b", "account"];
/* Sportif invité par un coach : l'inscription seule, puis l'app (2026-10-29, aussi en parcours Elite). */
export const INVITE_ATHLETE_PATH: StepId[] = ["value_intro", "account"];

/* Écrans propres au parcours Elite, dans l'ordre. On ne revient jamais d'un de ces écrans vers les
   questions de programme : le programme est déjà en cours de création à partir de ob_when. */
export const ELITE_STEPS: StepId[] = ["ob_plan", "ob_health", "ob_decide", "ob_insight", "ob_week", "ob_invite", "ob_notif", "ob_pay"];
/* Questions qui construisent le programme : un écran Elite n'y revient jamais en arrière. */
export const PROGRAM_QUESTION_STEPS: StepId[] = ["ob_sport", "ob_program", "ob_import", "ob_goal", "ob_weak", "ob_days"];

export interface PathOptions {
  role: Role;
  has: ObHas;
  claimed: boolean;
  /** Lien d'invitation d'un coach valide (ne concerne que le rôle sportif). */
  invited: boolean;
  elite?: boolean;
  /** Le coach qui invite paie : l'accès du sportif est gratuit, pas de paywall. */
  coachPaying?: boolean;
  /** Apple Santé lisible (app iOS). */
  healthAvailable?: boolean;
  /** Notifications activables (app iOS avec le plugin, ou web push). */
  pushAvailable?: boolean;
  /** false dès qu'on sait qu'aucun programme n'a été créé (génération ou import en échec). */
  programReady?: boolean;
}

export function isInvitedAthlete(o: Pick<PathOptions, "role" | "invited">): boolean {
  return o.invited && o.role === "athlete";
}

export function buildOnboardingPath(o: PathOptions): StepId[] {
  const invited = isInvitedAthlete(o);
  const coach = o.role === "coach";

  if (!o.elite) {
    if (invited) return INVITE_ATHLETE_PATH;
    const base = o.claimed ? (coach ? PROGRAM_COACH_PATH : PROGRAM_ATHLETE_PATH) : (coach ? COACH_PATH : ATHLETE_PATH);
    const post: StepId[] = [];
    if (!o.claimed) {
      post.push("ob_sport", "ob_program");
      if (o.has === "import") post.push("ob_import");
      else if (o.has !== "later") post.push("ob_goal", "ob_weak", "ob_days");
    }
    if (coach) post.push("ob_invite");
    return [...base, ...post];
  }

  if (coach) {
    const base = o.claimed ? PROGRAM_COACH_PATH : COACH_PATH;
    const post: StepId[] = [];
    if (!o.claimed) post.push("ob_sport");
    post.push("ob_count");
    if (!o.claimed) {
      post.push("ob_program");
      if (o.has === "import") post.push("ob_import");
      else if (o.has !== "later") post.push("ob_goal", "ob_weak", "ob_days");
    }
    post.push("ob_plan", "ob_decide", "ob_insight", "ob_week", "ob_invite");
    if (o.pushAvailable) post.push("ob_notif");
    post.push("ob_pay");
    return [...base, ...post];
  }

  if (invited) return INVITE_ATHLETE_PATH;
  const base = o.claimed ? PROGRAM_ATHLETE_PATH : ATHLETE_PATH;
  const post: StepId[] = [];
  if (!o.claimed) {
    post.push("ob_sport", "ob_program");
    if (o.has === "import") post.push("ob_import");
    else if (o.has !== "later") post.push("ob_goal", "ob_weak", "ob_days");
  }
  // Sans programme exploitable, ob_plan et ob_week prennent une séance type de son sport : toujours là.
  post.push("ob_plan");
  if (o.healthAvailable) post.push("ob_health");
  post.push("ob_decide", "ob_insight", "ob_week");
  if (o.pushAvailable) post.push("ob_notif");
  post.push("ob_pay");
  return [...base, ...post];
}

/* Interrupteur du parcours Elite : ALLUMÉ pour tout le monde depuis le 2026-10-18. Le couper :
   NEXT_PUBLIC_ELITE_ONBOARDING=0 sur Vercel puis redéployer. `?elite=1` / `?elite=0` dans l'URL force
   un parcours pour un test (mémorisé, pour survivre à la redirection Google ou au lien de l'email). */
const ELITE_KEY = "tpc_elite_onboarding";
export function readEliteFlag(): boolean {
  const envOn = process.env.NEXT_PUBLIC_ELITE_ONBOARDING !== "0";
  if (typeof window === "undefined") return envOn;
  try {
    const p = new URLSearchParams(window.location.search).get("elite");
    if (p === "1" || p === "0") localStorage.setItem(ELITE_KEY, p);
    const s = localStorage.getItem(ELITE_KEY);
    if (s === "1") return true;
    if (s === "0") return false;
  } catch { /* stockage bloqué */ }
  return envOn;
}
