import { validDecision, type AutoregDecisionRecord } from "@/lib/autoregDecisionRecord";
import { zoneRange } from "@/lib/autoregulation";
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
  outcome?: Outcome | null; changes?: TextChange[]; correct?: { label: string; followed: boolean | null } | null;
}

const ORD = (n: number) => `${n}e`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/* Points entre le ressenti et la zone de la jauge (sessionZone) : > 0 au-dessus, < 0 en dessous,
   0 dedans. null sans zone. Les mots suivent la distance réelle (2026-10-26, Gildas : « un peu »
   affiché pour un point loin de la zone). */
function zoneGap(s: ResultSession): number | null {
  const z = sessionZone(s);
  if (!z) return null;
  const r = Math.round(s.rpe);
  return r > z.high ? r - z.high : r < z.low ? r - z.low : 0;
}
const vsZone = (n: number, ref: string) =>
  `${Math.abs(n) === 1 ? "un peu plus" : Math.abs(n) === 2 ? "plus" : "beaucoup plus"} ${n > 0 ? "dure" : "facile"} que ${ref}`;

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
  // Changements du texte affichés seulement s'il y avait un conseil à suivre (alléger/pousser) :
  // avec « rien à changer », ils n'expliquent rien.
  const changes = proposed && follow.source === "text" && follow.text ? follow.text.changes.slice(0, 3) : [];
  let title: string, row: Verdict["row"] = null, correct: Verdict["correct"] = null;
  /* Titre calé sur la zone de la jauge (2026-10-26, Gildas) : jamais « dans la zone » ou « juste »
     quand le ressenti est hors de la zone dessinée (celle de la jauge de décision), et l'écart dit en
     mots selon la distance. Le verdict (outcome, compté dans « Conseils confirmés ») ne change pas. */
  const zg = zoneGap(s);
  if (proposed === "low" || proposed === "high") {
    const verb = proposed === "low" ? "alléger" : "pousser";
    const doneWord = proposed === "low" ? "allégée" : "poussée";
    row = { icon: proposed === "low" ? "⬇" : "⬆", text: `Conseil du matin : ${verb} · séance ${follow.followed ? doneWord : "gardée"}.` };
    title =
      outcome === "justified" ? (follow.followed ? "Allègement justifié : même allégée, la séance a été dure." : "Alerte du matin confirmée.")
      : outcome === "followed_ok" ? (zg ? `Allégée, ${vsZone(zg, "la zone conseillée")}.` : "Ajustement juste.")
      : outcome === "margin" ? `Alerte de trop : ${had} de la marge.`
      : outcome === "push_right" ? (follow.followed ? (zg ? `Poussée, ${vsZone(zg, "la zone conseillée")}.` : "Surcharge validée.") : `Surcharge justifiée : ${had} de la marge.`)
      : follow.followed ? "Surcharge trop forte : la séance a été dure." : "Séance comme prévu : pousser n'était pas nécessaire.";
    if (!follow.followed && follow.source !== "click" && follow.source !== "answer") {
      correct = { followed: true, label: subject ? `${subject} a ${proposed === "low" ? "allégé" : "poussé"} sans le noter` : `J'ai ${proposed === "low" ? "allégé" : "poussé"} sans le noter` };
    } else if (follow.source === "answer") {
      // Retour arrière toujours possible : null = on revient à ce que dit le texte (séance gardée s'il n'a pas bougé).
      correct = follow.followed
        ? { followed: null, label: "En fait, séance gardée" }
        : { followed: true, label: subject ? `${subject} a ${proposed === "low" ? "allégé" : "poussé"} sans le noter` : `J'ai ${proposed === "low" ? "allégé" : "poussé"} sans le noter` };
    }
  } else {
    row = { icon: "·", text: "Conseil du matin : rien à changer." };
    title = outcome === "none_harder" ? "Plus dure que prévu, sans alerte ce matin."
      : outcome === "none_easier" ? `Plus facile que prévu : ${had} de la marge.`
      : zg ? `${cap(vsZone(zg, "prévu"))}, sans alerte ce matin.`
      : g === 0 ? "Séance comme prévu, conforme à la lecture du matin."
      : "Dans la zone prévue, conforme à la lecture du matin.";
  }
  return { title, row, outcome, changes, correct };
}

/* `subject` = prénom du sportif : écran côté coach (2026-10-23), à la 3e personne. Le « tu » qui
   reste désigne le coach quand c'est lui qui a décidé. */
export function sessionResult(s: ResultSession, week: WeekSession[], subject?: string): SessionResult {
  const planned = s.target_difficulty;
  const gap = planned != null && planned > 0 ? Math.round(s.rpe) - Math.round(planned) : null;
  // Écart compté depuis la zone de la jauge quand elle existe (le point dans la zone = comme prévu).
  const zg = zoneGap(s) ?? gap;
  let title = zg == null ? "Séance enregistrée." : zg === 0 ? "Ressentie comme prévu." : `${cap(vsZone(zg, "prévu"))}.`;
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
      : `Ta ${ORD(hard)} séance très dure de la semaine : tu enchaînes. Demain matin, ton point forme en tiendra compte.` });
  } else if (s.duration && others.length > 0) {
    const load = (w: { rpe: number | null; duration: number | null }) => (w.rpe ?? 0) * (w.duration ?? 0);
    const total = load(s) + others.reduce((a, w) => a + load(w), 0);
    const share = total > 0 ? load(s) / total : 0;
    const part = share >= 0.5 ? "plus de la moitié" : share >= 0.4 ? "près de la moitié" : share >= 0.3 ? "presque un tiers" : share >= 0.25 ? "un quart" : null;
    if (part) rows.push({ icon: "⚡", text: `Elle pèse ${part} de ${subject ? "sa" : "ta"} charge de la semaine.` });
  }
  return { title, sub, rows: rows.slice(0, 2), outcome: v?.outcome ?? null, changes: v?.changes ?? [], correct: v?.correct ?? null };
}

/* Zone de la jauge de fin de séance (2026-10-26, Gildas : « la même zone que la decision ring ») :
   même règle que doneZone (decisionCard.ts) : la zone proposée ce matin-là (décision enregistrée,
   sinon reco figée ou rejouée), sinon la zone par défaut de l'anneau (le prévu et le point en dessous).
   `advised` = il y avait un conseil (alléger/pousser) : étiquette « Conseillé », sinon « Prévu ». */
export function sessionZone(s: ResultSession): { low: number; high: number; advised: boolean } | null {
  const d = validDecision(s);
  if (d?.proposed && d.zoneLow != null && d.zoneHigh != null) return { low: d.zoneLow, high: d.zoneHigh, advised: true };
  const p = s.autoreg_proposal;
  if (!d && p?.proposed && p.date === s.date && p.zoneLow != null && p.zoneHigh != null) return { low: p.zoneLow, high: p.zoneHigh, advised: true };
  if (!s.target_difficulty) return null;
  const z = zoneRange(Math.round(s.target_difficulty), "low");
  return { low: z.zoneLow, high: z.zoneHigh, advised: false };
}
