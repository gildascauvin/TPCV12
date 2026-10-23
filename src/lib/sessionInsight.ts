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

/* Verdict de la reco du matin (2026-10-23, piste 1) : à chaque séance, sans attendre de bilan. La
   décision cliquée d'abord ; sinon la reco figée au check-in (autoreg_proposal), que le sportif ait
   cliqué ou non. Le titre devient le verdict, la ligne dit ce qui avait été proposé. null = pas de
   verdict (aucune reco ce jour-là, ou écart sans alerte) : le titre reste ressentie vs prévu.
   Extrait le 2026-10-24 pour la carte Coach Control (même texte que l'écran de résultat coach). */
export function sessionVerdict(s: ResultSession, subject?: string): { title: string; row: { icon: string; text: string } | null } | null {
  if (s.rpe == null) return null;
  const d = validDecision(s);
  const p = s.autoreg_proposal && s.autoreg_proposal.date === s.date ? s.autoreg_proposal : null;
  const proposed = d ? d.proposed : p ? p.proposed : undefined;
  const original = d?.original_difficulty ?? p?.original_difficulty ?? s.target_difficulty ?? null;
  if (proposed === undefined || !original) return null;
  const rpe = Math.round(s.rpe);
  const applied = !!d && Math.round(d.applied_difficulty) !== Math.round(d.original_difficulty);
  const who = subject ?? "Tu";
  const had = subject ? `${subject} avait` : "Tu avais";
  // Qui a ajusté : côté coach, « tu » si c'est le coach, sinon le prénom.
  const adjuster = subject ? (d?.by === "coach" ? "tu as" : `${subject} a`) : "tu as";
  const kept = subject ? `${who} a gardé sa séance.` : "Tu as gardé ta séance.";
  if (proposed === "low") {
    const title = applied
      ? (rpe - Math.round(d!.applied_difficulty) <= 1 ? (subject && d?.by === "coach" ? "Ton ajustement était juste." : "L'ajustement était juste.") : "Bien d'avoir allégé : même comme ça, c'était dur.")
      : (rpe >= Math.round(original) + 1 ? "L'alerte du matin était fondée." : `${had} de la marge. Je retiens.`);
    return { title, row: { icon: "⬇", text: applied ? `Ce matin, l'app proposait d'alléger, et ${adjuster} allégé.` : `Ce matin, l'app proposait d'alléger. ${kept}` } };
  }
  if (proposed === "high") {
    const title = applied
      ? (rpe - Math.round(d!.applied_difficulty) <= 1 ? `${had} de quoi pousser.` : "Surcharge encaissée, mais dure. La prochaine fois, un cran de moins.")
      : (rpe <= Math.round(original) - 2 ? `${had} de la marge : pousser était possible.` : "Séance comme prévu.");
    return { title, row: { icon: "⬆", text: applied ? `Ce matin, l'app proposait de pousser, et ${adjuster} poussé.` : `Ce matin, l'app proposait de pousser. ${kept}` } };
  }
  const g = rpe - Math.round(original);
  if (g >= 2) return { title: "Plus dure que prévu, je ne l'avais pas vu venir.", row: null };
  if (g === 0) return { title: "Séance comme prévu.", row: null };
  return null;
}

/* `subject` = prénom du sportif : écran côté coach (2026-10-23), à la 3e personne. Le « tu » qui
   reste désigne le coach quand c'est lui qui a décidé. */
export function sessionResult(s: ResultSession, week: WeekSession[], subject?: string): SessionResult {
  const planned = s.target_difficulty;
  const gap = planned != null && planned > 0 ? Math.round(s.rpe) - Math.round(planned) : null;
  const how = (g: number) => (Math.abs(g) === 1 ? "Un peu plus " : Math.abs(g) === 2 ? "Modérément plus " : "Beaucoup plus ");
  let title = gap == null ? "Séance enregistrée." : gap === 0 ? "Ressentie comme prévu." : `${how(gap)}${gap > 0 ? "dure" : "facile"} que prévu.`;
  /* Pas de ligne « « Très dur » pour une séance prévue modérée » : elle mélangeait les mots de Foster
     (la note) et les zones de l'app (le prévu). Le titre compare des chiffres, il reste juste. */
  const sub = null;
  const rows: SessionResult["rows"] = [];

  const v = sessionVerdict(s, subject);
  if (v) { title = v.title; if (v.row) rows.push(v.row); }

  // Sa place dans la semaine : séances dures enchaînées, sinon son poids dans la charge.
  const others = week.filter(w => w.id !== s.id && w.done && w.rpe != null);
  const hard = others.filter(w => (w.rpe ?? 0) >= 8).length + (s.rpe >= 8 ? 1 : 0);
  if (s.rpe >= 8 && hard >= 2) {
    rows.push({ icon: "⚡", text: subject
      ? `Sa ${ORD(hard)} séance très dure de la semaine : ${subject} enchaîne. Regarde son ressenti demain matin.`
      : `Ta ${ORD(hard)} séance très dure de la semaine : tu enchaînes. Demain matin, ton check-in en tiendra compte.` });
  } else if (s.duration && others.length > 0) {
    const load = (w: { rpe: number | null; duration: number | null }) => (w.rpe ?? 0) * (w.duration ?? 0);
    const total = load(s) + others.reduce((a, w) => a + load(w), 0);
    const share = total > 0 ? load(s) / total : 0;
    const part = share >= 0.5 ? "plus de la moitié" : share >= 0.4 ? "près de la moitié" : share >= 0.3 ? "presque un tiers" : share >= 0.25 ? "un quart" : null;
    if (part) rows.push({ icon: "⚡", text: `Elle pèse ${part} de ${subject ? "sa" : "ta"} charge de la semaine.` });
  }
  return { title, sub, rows: rows.slice(0, 2) };
}
