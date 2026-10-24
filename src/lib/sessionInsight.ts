import type { AutoregDecisionRecord } from "@/lib/autoregDecisionRecord";
import type { AutoregProposal } from "@/lib/autoregPersonal";
import { judgeSession, type Outcome, type TextChange } from "@/lib/adviceJudge";

/* Résultat de fin de séance (2026-10-22, POC « Notes en un tap », section « Fin de séance ») : ce
   que la séance a appris, en mots. Titre = ressentie vs prévu ; puis au plus 2 lignes : si la
   décision du matin était juste, et la place de la séance dans la semaine. Rien d'inventé : une
   ligne sans donnée ne s'affiche pas. */

export type ResultSession = { id: string; date: string; rpe: number; duration: number | null; target_difficulty: number | null; name?: string | null; notes?: string | null; autoreg_decision?: AutoregDecisionRecord | null; autoreg_proposal?: AutoregProposal | null; autoreg_followed?: boolean | null };
export type WeekSession = { id: string; date: string; rpe: number | null; duration: number | null; done: boolean };

/* `correct` : lien discret qui corrige le réalisé quand le texte n'a pas bougé (« J'ai allégé sans le
   noter »). `changes` : ce que le texte final a changé par rapport au texte du matin. */
export interface SessionResult {
  title: string; sub: string | null; rows: { icon: string; text: string }[];
  outcome?: Outcome | null; changes?: TextChange[]; correct?: { label: string; followed: boolean } | null;
}

const ORD = (n: number) => `${n}e`;

/* Verdict du conseil du matin (piste 1 le 2026-10-23 ; règle unique et réalisé le 2026-10-24, voir
   adviceJudge.ts) : à chaque séance notée qui avait un conseil (clic, reco figée ou rejouée), y compris
   « rien à changer ». Registre impersonnel, sans « je » ni « l'app » (Gildas, 2026-10-24) : des
   constats courts. `subject` = prénom du sportif côté coach. null = pas de conseil ce jour-là. */
export type Verdict = { title: string; row: { icon: string; text: string } | null; outcome: Outcome; changes: TextChange[]; correct: SessionResult["correct"] };
export function sessionVerdict(s: ResultSession, subject?: string): Verdict | null {
  const j = judgeSession(s);
  if (!j) return null;
  const { proposed, original, follow, outcome } = j;
  const had = subject ? `${subject} avait` : "tu avais";
  const g = Math.round(s.rpe) - Math.round(original);
  const changes = follow.source === "text" && follow.text ? follow.text.changes.slice(0, 3) : [];
  let title: string, row: Verdict["row"] = null, correct: Verdict["correct"] = null;
  if (proposed === "low" || proposed === "high") {
    const verb = proposed === "low" ? "alléger" : "pousser";
    const doneWord = proposed === "low" ? "allégée" : "poussée";
    row = { icon: proposed === "low" ? "⬇" : "⬆", text: `Conseil du matin : ${verb} · séance ${follow.followed ? doneWord : "gardée"}.` };
    title =
      outcome === "justified" ? (follow.followed ? "Allègement justifié : même allégée, la séance a été dure." : "Alerte du matin confirmée.")
      : outcome === "followed_ok" ? "Ajustement juste."
      : outcome === "margin" ? `Alerte de trop : ${had} de la marge.`
      : outcome === "push_right" ? (follow.followed ? "Surcharge validée." : `Surcharge justifiée : ${had} de la marge.`)
      : follow.followed ? "Surcharge trop forte : la séance a été dure." : "Séance comme prévu : pousser n'était pas nécessaire.";
    if (!follow.followed && follow.source !== "click" && follow.source !== "answer") {
      correct = { followed: true, label: subject ? `${subject} a ${proposed === "low" ? "allégé" : "poussé"} sans le noter` : `J'ai ${proposed === "low" ? "allégé" : "poussé"} sans le noter` };
    } else if (follow.followed && follow.source === "answer") {
      correct = { followed: false, label: "En fait, séance gardée" };
    }
  } else {
    row = { icon: "·", text: "Conseil du matin : rien à changer." };
    title = outcome === "none_harder" ? `${g >= 2 ? "Plus dure" : "Un peu plus dure"} que prévu, sans alerte ce matin.`
      : outcome === "none_easier" ? `Plus facile que prévu : ${had} de la marge.`
      : "Séance comme prévu, conforme à la lecture du matin.";
  }
  return { title, row, outcome, changes, correct };
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
  return { title, sub, rows: rows.slice(0, 2), outcome: v?.outcome ?? null, changes: v?.changes ?? [], correct: v?.correct ?? null };
}
