/* Le juge des conseils (2026-10-24, POC « Boucle de vérification » PAggDE9BaiVBJM3tUCnuXF).

   Trois paramètres pour chaque séance : le PRÉVU (difficulté et texte au moment du conseil, figés
   dans autoreg_proposal), le CONSEIL (alléger, pousser, rien), le RÉALISÉ (la note de séance, et le
   texte une fois la séance faite). Une seule règle, partagée par l'écran post-séance, « Mes
   conseils », le recalage et l'écran coach : avant, le verdict comptait en points et le bilan en mots,
   et une même séance pouvait être « fondée » le soir et « de trop » dans le bilan.

   « Plus dure que prévu » = ressentie au moins 1 point au-dessus du prévu (même seuil que le signal
   appris, autoregPersonal.learnSignals). « De la marge » = au moins 1 point en dessous.
   Jours sans conseil (choix de Gildas, 2026-10-24, assumé en faveur de l'app) : on juge la DÉCISION
   « rien à changer », pas la précision au point près. Raté seulement si la séance a changé de
   catégorie (dure → très dure : un ajustement aurait servi). Sur Gildas : 9 ratés sur 80 au lieu de 32.

   Le réalisé : le texte final, comparé ligne par ligne au texte figé le matin, dit si la séance a été
   allégée, gardée ou poussée. Texte inchangé = séance gardée, sauf correction « J'ai allégé sans le
   noter » (sessions.autoreg_followed). Un clic sur Alléger / Pousser (autoreg_decision) prime sur
   tout. Analyse du 24/10 sur 111 séances de Gildas : les jours d'alerte, il n'écrit pas moins
   (charge relative 0,98 contre 0,97) : d'où la correction possible, jamais une question. */

import { qualitativeDifficulty, type AutoregDir } from "@/lib/autoregulation";
import { parseLine, type ParsedLine } from "@/lib/exerciseParser";
import { validDecision, type AutoregDecisionRecord } from "@/lib/autoregDecisionRecord";
import type { AutoregProposal } from "@/lib/autoregPersonal";

export const HARDER_POINTS = 1;
const WORDS = ["légère", "modérée", "dure", "très dure"];
export const EASIER_POINTS = 1;

export type Outcome =
  | "justified"    // alléger : séance plus dure que prévu (gardée), ou encore dure même allégée
  | "margin"       // alléger : séance gardée, pas plus dure → alerte de trop
  | "followed_ok"  // alléger : allégée et bien passée → hors des comptes (on ne sait pas ce qu'aurait donné la séance prévue)
  | "push_right"   // pousser : poussée sans être dure, ou gardée avec de la marge
  | "push_wrong"   // pousser : poussée et dure, ou gardée sans marge
  | "none_same"    // rien : séance comme prévu (à un point près vers le facile)
  | "none_harder"  // rien : plus dure que prévu → raté
  | "none_easier"; // rien : nettement plus facile → hors des comptes

/* Compté juste / faux dans les comptes ; null = hors des comptes. */
export function outcomeRight(o: Outcome): boolean | null {
  if (o === "justified" || o === "push_right" || o === "none_same") return true;
  if (o === "margin" || o === "push_wrong" || o === "none_harder") return false;
  return null;
}

/* ── Le réalisé lu dans le texte ─────────────────────────────────────────────────────────────── */

export type TextChange = { before: string | null; after: string | null };
export type TextVerdict = { dir: "lighter" | "heavier" | "same" | "mixed"; changes: TextChange[] };

const keyOf = (p: ParsedLine) => p.name.toLowerCase().replace(/^[a-h]\d?\s*[-–:.)]\s*/, "").replace(/[^a-zà-ÿ0-9&+ ]/g, "").replace(/\s+/g, " ").trim();
const repsOf = (r: string | null | undefined) => (r ? r.split("+").reduce((a, b) => a + (parseFloat(b) || 0), 0) || 1 : 1);

/* Quantités comparables d'une ligne : séries, répétitions, charge haute, %, distance, temps. */
function measures(p: ParsedLine): number[] {
  const sets = p.entries.length ? p.entries.reduce((a, e) => a + e.n, 0) : p.schemes.reduce((a, s) => a + (s.sets ?? 1), 0);
  const reps = p.schemes.reduce((a, s) => a + (s.sets ?? 1) * repsOf(s.reps), 0);
  const top = p.entries.length ? Math.max(...p.entries.map(e => e.load)) : 0;
  const dist = p.schemes.reduce((a, s) => a + (s.sets ?? 1) * (s.dist ?? 0), 0);
  const sec = p.schemes.reduce((a, s) => a + (s.sets ?? 1) * (s.sec ?? 0), 0);
  return [sets, reps, top, p.pct ?? 0, dist, sec];
}

function lineDir(a: ParsedLine, b: ParsedLine): "lighter" | "heavier" | "same" | "mixed" {
  const ma = measures(a), mb = measures(b);
  let down = 0, up = 0;
  ma.forEach((v, i) => { if (mb[i] < v - 1e-9) down++; else if (mb[i] > v + 1e-9) up++; });
  return down && up ? "mixed" : down ? "lighter" : up ? "heavier" : "same";
}

const clean = (t: string | null | undefined) => (t ?? "").split("\n").map(l => l.trim()).filter(Boolean);

/* null = rien à comparer (pas de texte figé le matin). */
export function compareNotes(planned: string | null | undefined, done: string | null | undefined): TextVerdict | null {
  if (planned == null) return null;
  const A = clean(planned), B = clean(done);
  if (A.join("\n") === B.join("\n")) return { dir: "same", changes: [] };
  const pa = A.map(parseLine), pb = B.map(parseLine);
  const usedB = new Set<number>();
  let lighter = 0, heavier = 0;
  const changes: TextChange[] = [];
  // Appariement : texte identique, sinon même exercice ; puis, pour les lignes restantes, même
  // prescription (séries, reps, charge, distance, temps) sous un autre nom = ligne renommée, pas un
  // changement (2026-10-26, « 3x10m Lesté » devenu « 3x10m sprint Lesté » affiché barré).
  const match: number[] = pa.map(() => -1);
  pa.forEach((a, i) => {
    let j = B.findIndex((t, k) => !usedB.has(k) && t === A[i]);
    if (j < 0) j = pb.findIndex((b, k) => !usedB.has(k) && keyOf(b) && keyOf(b) === keyOf(a));
    if (j >= 0) { usedB.add(j); match[i] = j; }
  });
  pa.forEach((a, i) => {
    if (match[i] >= 0 || a.kind !== "full") return;
    const ma = measures(a).join();
    const j = pb.findIndex((b, k) => !usedB.has(k) && b.kind === "full" && measures(b).join() === ma);
    if (j >= 0) { usedB.add(j); match[i] = j; }
  });
  pa.forEach((a, i) => {
    const j = match[i];
    if (j < 0) { if (a.kind === "full") { lighter++; changes.push({ before: A[i], after: null }); } return; }
    if (B[j] === A[i] || a.kind !== "full" || pb[j].kind !== "full") return;
    const d = lineDir(a, pb[j]);
    if (d === "same") return;
    if (d === "lighter") lighter++; else if (d === "heavier") heavier++; else { lighter++; heavier++; }
    changes.push({ before: A[i], after: B[j] });
  });
  pb.forEach((b, k) => { if (!usedB.has(k) && b.kind === "full") { heavier++; changes.push({ before: null, after: B[k] }); } });
  const dir = lighter && heavier ? "mixed" : lighter ? "lighter" : heavier ? "heavier" : "same";
  return { dir, changes };
}

/* ── Qui a fait quoi ─────────────────────────────────────────────────────────────────────────── */

export type JudgedSession = {
  date: string; rpe: number | null; target_difficulty: number | null; notes?: string | null;
  autoreg_decision?: AutoregDecisionRecord | null; autoreg_proposal?: AutoregProposal | null; autoreg_followed?: boolean | null;
};

/* Comment on sait si le conseil a été suivi : clic, correction du sportif (ou du coach), texte. */
export type FollowSource = "click" | "answer" | "text" | "assumed";
export type Follow = { followed: boolean; source: FollowSource; applied: number | null; text: TextVerdict | null };

export function adviceOf(s: JudgedSession): { proposed: AutoregDir | null; original: number } | null {
  const d = validDecision(s);
  const p = s.autoreg_proposal && s.autoreg_proposal.date === s.date ? s.autoreg_proposal : null;
  const proposed = d ? d.proposed : p ? p.proposed : undefined;
  const original = d?.original_difficulty ?? p?.original_difficulty ?? s.target_difficulty ?? null;
  if (proposed === undefined || !original) return null;
  return { proposed, original };
}

export function resolveFollow(s: JudgedSession, proposed: AutoregDir | null): Follow {
  const d = validDecision(s);
  const p = s.autoreg_proposal && s.autoreg_proposal.date === s.date ? s.autoreg_proposal : null;
  const text = compareNotes(p?.original_notes ?? d?.original?.notes ?? null, s.notes);
  if (d && Math.round(d.applied_difficulty) !== Math.round(d.original_difficulty)) return { followed: true, source: "click", applied: d.applied_difficulty, text };
  if (s.autoreg_followed != null) return { followed: s.autoreg_followed, source: "answer", applied: null, text };
  if (text && proposed) {
    const want = proposed === "low" ? "lighter" : "heavier";
    if (text.dir === want) return { followed: true, source: "text", applied: null, text };
  }
  // Clic « Garder », texte inchangé ou pas de texte figé : séance gardée (le réalisé, c'est ce qui est écrit).
  return { followed: false, source: d ? "click" : text ? "text" : "assumed", applied: null, text };
}

export function judge(proposed: AutoregDir | null, original: number, rpe: number, f: Follow): Outcome {
  const g = Math.round(rpe) - Math.round(original);
  if (proposed === "low") {
    if (f.followed) {
      const hard = f.applied != null ? Math.round(rpe) - Math.round(f.applied) >= 2 : g >= HARDER_POINTS;
      return hard ? "justified" : "followed_ok";
    }
    return g >= HARDER_POINTS ? "justified" : "margin";
  }
  if (proposed === "high") {
    if (f.followed) {
      const ok = f.applied != null ? Math.round(rpe) - Math.round(f.applied) <= 1 : g <= HARDER_POINTS;
      return ok ? "push_right" : "push_wrong";
    }
    return g <= -EASIER_POINTS ? "push_right" : "push_wrong";
  }
  const word = (n: number) => WORDS.indexOf(qualitativeDifficulty(n));
  if (word(rpe) > word(original)) return "none_harder";
  if (g <= -2) return "none_easier";
  return "none_same";
}

/* Raccourci : le verdict complet d'une séance faite, null sans conseil figé ou rejoué. */
export function judgeSession(s: JudgedSession): { proposed: AutoregDir | null; original: number; follow: Follow; outcome: Outcome } | null {
  if (s.rpe == null) return null;
  const a = adviceOf(s);
  if (!a) return null;
  const follow = resolveFollow(s, a.proposed);
  return { ...a, follow, outcome: judge(a.proposed, a.original, s.rpe, follow) };
}
