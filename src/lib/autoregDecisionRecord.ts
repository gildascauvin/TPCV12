/* Décision d'autorégulation persistée sur la séance (2026-10-04, migration 030, colonne
   `autoreg_decision` sur sessions ET coach_sessions). Avant, la décision ne vivait qu'en
   localStorage du jour : perdue le lendemain, sur un autre appareil et côté coach, donc la carte
   "Séance faite" ne pouvait comparer le RPE réel qu'au plan, jamais à ce qui avait été proposé.
   Gildas (cas réel) : "Surcharge" proposée, maintenue, RPE 6 pour 5 → la carte disait "plus dure
   que prévu" alors que la reco allait dans son sens.

   Wording validé par Gildas : jamais de chiffre, le sens de la reco + ce qui a été fait. */

import type { AutoregDir, AutoregOriginal } from "@/lib/autoregulation";

export interface AutoregDecisionRecord {
  /* Sens de la reco au moment de la décision, null = pas de reco ("plan cohérent"). Figée : un
     check-in modifié après coup ne la réécrit pas. */
  proposed: AutoregDir | null;
  zoneLow: number | null;
  zoneHigh: number | null;
  original_difficulty: number;
  applied_difficulty: number;
  original?: AutoregOriginal | null;
  /* Posés côté serveur (/api/sessions/decision) : qui a décidé, et la date de la séance. */
  by?: "athlete" | "coach";
  by_name?: string | null;
  date?: string;
  decided_at?: string;
}

/* Une séance déplacée à un autre jour repart de zéro (la reco dépend du check-in du jour). */
export function validDecision(s: { date: string; autoreg_decision?: AutoregDecisionRecord | null } | null | undefined): AutoregDecisionRecord | null {
  const d = s?.autoreg_decision;
  if (!d) return null;
  if (d.date && d.date !== s!.date) return null;
  return d;
}

/* Fire-and-forget : une écriture ratée laisse juste la carte sans repère, jamais un écran cassé. */
export function saveDecisionRecord(sessionId: string, decision: AutoregDecisionRecord | null): void {
  if (typeof window === "undefined" || !/^[0-9a-f-]{36}$/i.test(sessionId)) return;
  fetch("/api/sessions/decision", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, decision }),
  }).then(r => { if (!r.ok) console.error("autoreg_decision", r.status); }).catch(e => console.error("autoreg_decision", e));
}

export type DecisionViewer = { role: "athlete" | "coach"; subjectName?: string };

type Choice = "maintain" | "apply" | "less" | "more" | "opposite";

function choiceOf(d: AutoregDecisionRecord): Choice {
  const o = Math.round(d.original_difficulty), a = Math.round(d.applied_difficulty);
  if (a === o) return "maintain";
  if (!d.proposed || d.zoneLow === null || d.zoneHigh === null) return "apply";
  const up = d.proposed === "high";
  if (up ? a < o : a > o) return "opposite";
  if (a >= d.zoneLow && a <= d.zoneHigh) return "apply";
  const short = up ? a < d.zoneLow : a > d.zoneHigh;
  return short ? "less" : "more";
}

/* "Surcharge proposée, tu as maintenu." — null quand il n'y a rien à dire (pas de reco, rien bougé). */
export function decisionSummary(d: AutoregDecisionRecord, viewer: DecisionViewer): string | null {
  const choice = choiceOf(d);
  const self = !d.by || d.by === viewer.role;
  const first = viewer.subjectName?.split(" ")[0];
  const actor = self ? "tu" : viewer.role === "athlete" ? "ton coach" : (first || "ton sportif");
  const has = self ? "as" : "a";
  const up = (dir: AutoregDir) => dir === "high";
  const o = Math.round(d.original_difficulty), a = Math.round(d.applied_difficulty);
  const movedVerb = a > o ? "surchargé" : "allégé";

  if (!d.proposed) {
    if (choice === "maintain") return null;
    const plan = viewer.role === "coach" ? (self ? "Son plan" : "Le plan") : "Ton plan";
    return `${plan} était cohérent, ${actor} ${has} ${movedVerb}.`;
  }
  const head = up(d.proposed) ? "Surcharge recommandée" : "Allègement recommandé";
  const pp = up(d.proposed) ? "appliquée" : "appliqué";
  const verb = up(d.proposed) ? "surchargé" : "allégé";
  const tail = {
    maintain: `${actor} ${has} maintenu`,
    apply: `${actor} l'${has} ${pp}`,
    less: `${actor} ${has} ${verb} un peu moins`,
    more: `${actor} ${has} ${verb} davantage`,
    opposite: `${actor} ${has} ${movedVerb}`,
  }[choice];
  return `${head}, ${tail}.`;
}

/* RPE réel comparé à la zone proposée (prioritaire) ou, sans reco, au plan. Jamais de chiffre. */
export function feltLine(rpe: number | null, planned: number | null, zone: { low: number; high: number } | null, coach: boolean): string {
  if (rpe === null) return coach ? "RPE pas encore noté." : "Pense à noter ton RPE.";
  const r = Math.round(rpe);
  if (zone) {
    if (r < zone.low) return coach ? "Difficulté sous la zone recommandée : il restait de la marge." : "Difficulté sous la zone recommandée : tu avais de la marge.";
    if (r > zone.high) return "Difficulté au-dessus de la zone recommandée : plus dure que conseillé.";
    return "Difficulté dans la zone recommandée.";
  }
  if (planned === null) return "Séance faite.";
  const gap = r - Math.round(planned);
  if (gap >= 1) return "Difficulté plus élevée que prévu.";
  if (gap <= -1) return "Difficulté plus basse que prévu.";
  return "Difficulté comme prévu.";
}
