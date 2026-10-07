/* Priming Elite personnalisé (2026-10-07, POC https://claude.ai/artifact/MgsQY4Fncy8XtVgmNBA9Q5).
   Le titre de la modale suit le déclencheur (ce que l'utilisateur essayait de faire), puis le
   prénom, le sport et, côté coach, ses sportifs.

   Le déclencheur est noté juste avant l'ouverture (markPrimingSource) par la surface cliquée :
   LockedBlur (surface → source), les gates de décision, les graphes floutés, l'événement
   OPEN_PRIMING (checklist, 1re décision). PrimingJourneyModal le lit à l'ouverture
   (peekPrimingSource puis clearPrimingSource) ; rien de noté = titre générique ("checklist"). */
import { sessionsComplement } from "@/lib/sportCategories";

export type PrimingSource = "decision" | "insight" | "progress" | "first" | "checklist";

let pending: PrimingSource | null = null;
let pendingAthlete: string | null = null;

/** `ifEmpty` : ne remplace pas une source déjà notée dans le même clic (ex. LockedBlur note
    "decision" puis appelle un `unlock` générique de la page). */
export function markPrimingSource(source: PrimingSource, opts?: { athleteName?: string | null; ifEmpty?: boolean }) {
  if (opts?.athleteName) pendingAthlete = opts.athleteName;
  if (opts?.ifEmpty && pending) return;
  pending = source;
}

/** Sportif concerné (coach), noté indépendamment de la source. */
export function markPrimingAthlete(name: string | null | undefined) {
  if (name) pendingAthlete = name;
}

/** Lu à l'ouverture de la modale (initialiseur de state), effacé dans un effet : un initialiseur
    peut être appelé 2 fois en StrictMode, il ne doit donc rien consommer. */
export function peekPrimingSource(): { source: PrimingSource; athleteName: string | null } {
  return { source: pending ?? "checklist", athleteName: pendingAthlete };
}

export function clearPrimingSource() {
  pending = null;
  pendingAthlete = null;
}

export function sourceFromSurface(surface: string): PrimingSource {
  if (/test|verdict/.test(surface)) return "progress";
  if (/decision|coach_card/.test(surface)) return "decision";
  return "insight";
}

export function sourceFromEvent(detailSource: unknown): PrimingSource {
  return detailSource === "first_decision" ? "first" : "checklist";
}

/* ---------- Contexte de personnalisation (prénom, sport, sportifs du coach) ---------- */

export interface PrimingContext {
  name: string | null;
  /** "de trail", "d'Hyrox"… ou null si sport inconnu/libre (la phrase s'en passe alors). */
  sportDe: string | null;
  /** Coach : vrais sportifs (ni invitation en attente, ni sportif démo "soi-même"). */
  athleteNames: string[];
}

const EMPTY: PrimingContext = { name: null, sportDe: null, athleteNames: [] };
let cached: PrimingContext | null = null;
let inflight: Promise<PrimingContext> | null = null;

export function getCachedPrimingContext() { return cached; }

/** Préchargé par usePaywall dès qu'un compte non abonné ouvre une page, pour que la modale
    s'ouvre déjà personnalisée. */
export function loadPrimingContext(): Promise<PrimingContext> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return EMPTY;
      const { data: profile, error } = await supabase
        .from("profiles").select("name, sport, mode").eq("user_id", user.id).maybeSingle();
      if (error) console.error("[primingContext] profile error:", error);
      const first = (profile?.name ?? "").trim().split(/\s+/)[0] || null;
      let athleteNames: string[] = [];
      if (profile?.mode === "coach") {
        const { data: rows, error: aErr } = await supabase
          .from("coach_athletes").select("name, user_id, invite_email").eq("coach_id", user.id).order("created_at");
        if (aErr) console.error("[primingContext] athletes error:", aErr);
        const self = (profile?.name ?? "").trim().toLowerCase();
        athleteNames = (rows ?? [])
          .filter(r => !(r.invite_email && !r.user_id))
          .filter(r => !(r.user_id === null && (r.name ?? "").trim().toLowerCase() === self))
          .map(r => (r.name ?? "").trim().split(/\s+/)[0])
          .filter(Boolean);
      }
      return { name: first, sportDe: sessionsComplement(profile?.sport), athleteNames };
    } catch (e) {
      console.error("[primingContext]", e);
      return EMPTY;
    }
  })().then(c => { cached = c; inflight = null; return c; });
  return inflight;
}

/* ---------- Textes (validés sur le POC le 2026-10-07) ---------- */

export function primingTitles(role: "athlete" | "coach", source: PrimingSource, ctx: PrimingContext, athleteName: string | null): { eyebrow: string; title: string; sub: string } {
  const de = ctx.sportDe ? ` ${ctx.sportDe}` : "";
  const hey = ctx.name ? `${ctx.name}, ` : "";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const eyebrow = {
    decision: "Décision réservée à Elite",
    insight: "Analyse réservée à Elite",
    progress: "Analyse réservée à Elite",
    first: "Ta décision offerte est utilisée",
    checklist: "Passe à Elite",
  }[source];

  if (role === "athlete") {
    const t = {
      decision: [`Une séance trop lourde un jour de fatigue, c'est des semaines perdues.`, `Elite ajuste chaque séance${de} à ta forme du jour : alléger, maintenir ou pousser.`],
      insight: [`Tu sens quand tu es fatigué. Pas encore pourquoi.`, `Elite relie ton sommeil, ta charge et tes habitudes à ta forme du lendemain.`],
      progress: [`Ton résultat a bougé. Bon signe ou pas ?`, `Elite situe chaque test${de} par rapport à sa cible et te dit quoi travailler en priorité.`],
      first: [`Demain, ta forme aura encore changé. Ta séance, non.`, `Tu viens d'ajuster ta 1re séance. Avec Elite, chaque séance${de} suit ta forme, sans que tu aies à deviner.`],
      checklist: [cap(`${hey}ton plan${de} est écrit pour un jour parfait.`), `Les jours parfaits sont rares. Elite l'ajuste à ta vraie forme, séance après séance.`],
    }[source];
    return { eyebrow, title: t[0], sub: t[1] };
  }

  const names = ctx.athleteNames;
  const n = names.length;
  const a = athleteName ?? names[0] ?? null;
  const group = n >= 2 ? ` Pour tes ${n} sportifs${de}.` : "";
  const t = {
    decision: [`Qui alléger ce matin ? Tu ne devrais pas avoir à deviner.`, `Elite te donne une décision par sportif, calculée sur sa forme et sa charge.${group}`],
    insight: [`Un sportif décroche rarement sans prévenir.`, `Elite te montre pourquoi ${a ?? "un sportif"} décroche, avant la blessure ou la stagnation.`],
    progress: [`Lequel de tes sportifs est en retard, et sur quoi ?`, `Elite situe les tests de chaque sportif${de} par rapport à leur cible : forces, faiblesses, priorité.`],
    first: [
      a && n >= 2 ? `${a} a eu sa décision ce matin. Tes ${n - 1} autres sportifs attendent.` : `${a ?? "Ton sportif"} a eu sa décision ce matin. Demain, sa forme aura changé.`,
      n >= 2 ? `Avec Elite, chacun de tes ${n} sportifs a la sienne chaque matin, calculée sur sa forme et sa charge.` : `Avec Elite, chaque sportif a la sienne chaque matin, calculée sur sa forme et sa charge.`,
    ],
    checklist: [
      n >= 2 ? cap(`${hey}tes ${n} sportifs${de} ne récupèrent pas tous pareil.`) : cap(`${hey}tes sportifs${de} ne récupèrent pas tous pareil.`),
      `Ils suivent pourtant la même séance. Elite te dit chaque matin qui alléger, maintenir ou pousser, et de combien.`,
    ],
  }[source];
  return { eyebrow, title: t[0], sub: t[1] };
}

/** Ligne Elite surlignée (index dans PLAN_FEATURES.elite) selon le déclencheur, -1 = aucune. */
export function primingHitIndex(source: PrimingSource): number {
  return { decision: 0, insight: 1, progress: 2, first: 0, checklist: -1 }[source];
}
