import { validDecision, type AutoregDecisionRecord } from "@/lib/autoregDecisionRecord";
import type { AutoregProposal } from "@/lib/autoregPersonal";

/* Résultat de fin de séance (2026-10-22, POC « Notes en un tap », section « Fin de séance ») : ce
   que la séance a appris, en mots. Titre = ressentie vs prévu ; puis au plus 2 lignes : si la
   décision du matin était juste, et la place de la séance dans la semaine. Rien d'inventé : une
   ligne sans donnée ne s'affiche pas. */

export type ResultSession = { id: string; date: string; rpe: number; duration: number | null; target_difficulty: number | null; name?: string | null; autoreg_decision?: AutoregDecisionRecord | null; autoreg_proposal?: AutoregProposal | null };
export type WeekSession = { id: string; date: string; rpe: number | null; duration: number | null; done: boolean };

export interface SessionResult { title: string; sub: string | null; rows: { icon: string; text: string }[] }

const ORD = (n: number) => `${n}e`;

export function sessionResult(s: ResultSession, week: WeekSession[]): SessionResult {
  const planned = s.target_difficulty;
  const gap = planned != null && planned > 0 ? Math.round(s.rpe) - Math.round(planned) : null;
  const how = (g: number) => (Math.abs(g) === 1 ? "Un peu plus " : Math.abs(g) === 2 ? "Modérément plus " : "Beaucoup plus ");
  let title = gap == null ? "Séance enregistrée." : gap === 0 ? "Ressentie comme prévu." : `${how(gap)}${gap > 0 ? "dure" : "facile"} que prévu.`;
  /* Pas de ligne « « Très dur » pour une séance prévue modérée » : elle mélangeait les mots de Foster
     (la note) et les zones de l'app (le prévu). Le titre compare des chiffres, il reste juste. */
  const sub = null;
  const rows: SessionResult["rows"] = [];

  /* Verdict de la reco du matin (2026-10-23, piste 1) : à chaque séance, sans attendre de bilan. La
     décision cliquée d'abord ; sinon la reco figée au check-in (autoreg_proposal), que le sportif ait
     cliqué ou non. Le titre devient le verdict, la ligne dit ce qui avait été proposé. */
  const d = validDecision(s);
  const p = s.autoreg_proposal && s.autoreg_proposal.date === s.date ? s.autoreg_proposal : null;
  const proposed = d ? d.proposed : p ? p.proposed : undefined;
  const original = d?.original_difficulty ?? p?.original_difficulty ?? planned ?? null;
  if (proposed !== undefined && original) {
    const rpe = Math.round(s.rpe);
    const applied = !!d && Math.round(d.applied_difficulty) !== Math.round(d.original_difficulty);
    if (proposed === "low") {
      title = applied
        ? (rpe - Math.round(d!.applied_difficulty) <= 1 ? "L'ajustement était juste." : "Bien d'avoir allégé : même comme ça, c'était dur.")
        : (rpe >= Math.round(original) + 1 ? "L'alerte du matin était fondée." : "Tu avais de la marge. Je retiens.");
      rows.push({ icon: "⬇", text: applied ? "Ce matin, l'app proposait d'alléger, et tu as allégé." : "Ce matin, l'app proposait d'alléger. Tu as gardé ta séance." });
    } else if (proposed === "high") {
      title = applied
        ? (rpe - Math.round(d!.applied_difficulty) <= 1 ? "Tu avais de quoi pousser." : "Surcharge encaissée, mais dure. La prochaine fois, un cran de moins.")
        : (rpe <= Math.round(original) - 2 ? "Tu avais de la marge : pousser était possible." : "Séance comme prévu.");
      rows.push({ icon: "⬆", text: applied ? "Ce matin, l'app proposait de pousser, et tu as poussé." : "Ce matin, l'app proposait de pousser. Tu as gardé ta séance." });
    } else {
      const g = rpe - Math.round(original);
      if (g >= 2) title = "Plus dure que prévu, je ne l'avais pas vu venir.";
      else if (g === 0) title = "Séance comme prévu.";
    }
  }

  // Sa place dans la semaine : séances dures enchaînées, sinon son poids dans la charge.
  const others = week.filter(w => w.id !== s.id && w.done && w.rpe != null);
  const hard = others.filter(w => (w.rpe ?? 0) >= 8).length + (s.rpe >= 8 ? 1 : 0);
  if (s.rpe >= 8 && hard >= 2) {
    rows.push({ icon: "⚡", text: `Ta ${ORD(hard)} séance très dure de la semaine : tu enchaînes. Demain matin, ton check-in en tiendra compte.` });
  } else if (s.duration && others.length > 0) {
    const load = (w: { rpe: number | null; duration: number | null }) => (w.rpe ?? 0) * (w.duration ?? 0);
    const total = load(s) + others.reduce((a, w) => a + load(w), 0);
    const share = total > 0 ? load(s) / total : 0;
    const part = share >= 0.5 ? "plus de la moitié" : share >= 0.4 ? "près de la moitié" : share >= 0.3 ? "presque un tiers" : share >= 0.25 ? "un quart" : null;
    if (part) rows.push({ icon: "⚡", text: `Elle pèse ${part} de ta charge de la semaine.` });
  }
  return { title, sub, rows: rows.slice(0, 2) };
}
