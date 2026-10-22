import { validDecision, type AutoregDecisionRecord } from "@/lib/autoregDecisionRecord";

/* Résultat de fin de séance (2026-10-22, POC « Notes en un tap », section « Fin de séance ») : ce
   que la séance a appris, en mots. Titre = ressentie vs prévu ; puis au plus 2 lignes : si la
   décision du matin était juste, et la place de la séance dans la semaine. Rien d'inventé : une
   ligne sans donnée ne s'affiche pas. */

export type ResultSession = { id: string; date: string; rpe: number; duration: number | null; target_difficulty: number | null; name?: string | null; autoreg_decision?: AutoregDecisionRecord | null };
export type WeekSession = { id: string; date: string; rpe: number | null; duration: number | null; done: boolean };

export interface SessionResult { title: string; sub: string | null; rows: { icon: string; text: string }[] }

const ORD = (n: number) => `${n}e`;

export function sessionResult(s: ResultSession, week: WeekSession[]): SessionResult {
  const planned = s.target_difficulty;
  const gap = planned != null && planned > 0 ? Math.round(s.rpe) - Math.round(planned) : null;
  const how = (g: number) => (Math.abs(g) === 1 ? "Un peu plus " : Math.abs(g) === 2 ? "Modérément plus " : "Beaucoup plus ");
  const title = gap == null ? "Séance enregistrée." : gap === 0 ? "Ressentie comme prévu." : `${how(gap)}${gap > 0 ? "dure" : "facile"} que prévu.`;
  /* Pas de ligne « « Très dur » pour une séance prévue modérée » : elle mélangeait les mots de Foster
     (la note) et les zones de l'app (le prévu). Le titre compare des chiffres, il reste juste. */
  const sub = null;
  const rows: SessionResult["rows"] = [];

  // La décision du matin était-elle juste ?
  const d = validDecision(s);
  if (d?.proposed) {
    const applied = d.applied_difficulty !== d.original_difficulty;
    if (d.proposed === "low") {
      if (applied) rows.push(s.rpe - d.applied_difficulty <= 1
        ? { icon: "⬇", text: "L'allègement était juste : la séance est passée au niveau visé." }
        : { icon: "⬇", text: "Même allégée, elle a été dure : bien d'avoir allégé. Soigne ta récup ce soir." });
      else rows.push(s.rpe >= d.original_difficulty + 1
        ? { icon: "⬇", text: "La reco d'alléger était justifiée : la prochaine fois, suis-la." }
        : { icon: "→", text: "Tu as bien fait de maintenir : ta forme a suivi." });
    } else {
      if (applied) rows.push(s.rpe - d.applied_difficulty <= 1
        ? { icon: "⬆", text: "La surcharge est passée : tu avais de la marge." }
        : { icon: "⬆", text: "Surcharge encaissée, mais dure : la prochaine fois, un cran de moins." });
      else rows.push(s.rpe <= d.original_difficulty - 2
        ? { icon: "⬆", text: "Tu avais de la marge : la reco de pousser était justifiée." }
        : { icon: "→", text: "Tu as bien fait de maintenir." });
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
