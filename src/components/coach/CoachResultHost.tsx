"use client";

/* Écran de résultat côté coach (2026-10-23) : toucher une séance faite d'un sportif (Coach Control,
   Planning) ouvre le même écran que le sportif voit en fin de séance, à la 3e personne : le verdict
   de la reco du matin (« L'alerte du matin était fondée », « Ton ajustement était juste »…),
   ressenti vs prévu, sa place dans la semaine. Sans les données de la montre : le coach n'y a pas
   accès (health_* propriétaire seul). « Modifier la séance » ouvre l'éditeur d'avant. */

import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { SessionBlock, loadAccounts, checkRecalAfter, type Accounts, type RecalNotice } from "@/components/physio/PhysioRevealHost";
import { sessionResult, type ResultSession, type WeekSession } from "@/lib/sessionInsight";
import { RADIUS } from "@/lib/theme";

export const COACH_RESULT = "tpc-coach-result";
export type CoachResultDetail = { session: ResultSession; week: WeekSession[]; subject: string; onEdit?: () => void };

export function requestCoachResult(detail: CoachResultDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COACH_RESULT, { detail }));
}

/* Séance faite et notée → écran de résultat ; sinon l'action d'origine (éditeur). */
export function openCoachSession<S extends { id: string; date: string; done: boolean; rpe: number | null; duration: number | null; target_difficulty: number | null; name?: string | null; athlete_id?: string }>(
  s: S, all: S[], subject: string, onEdit: () => void,
) {
  if (!s.done || s.rpe == null) { onEdit(); return; }
  const d = new Date(s.date + "T12:00:00");
  const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const week = all.filter(x => (x.athlete_id ?? null) === (s.athlete_id ?? null) && x.date >= iso(monday) && x.date <= iso(sunday))
    .map(x => ({ id: x.id, date: x.date, rpe: x.rpe, duration: x.duration, done: x.done }));
  requestCoachResult({ session: { ...(s as unknown as ResultSession), rpe: s.rpe }, week, subject, onEdit });
}

export default function CoachResultHost() {
  const [shown, setShown] = useState<CoachResultDetail | null>(null);
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const currentId = useRef<string | null>(null);
  const [recal, setRecal] = useState<RecalNotice | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent<CoachResultDetail>).detail;
      setShown(detail);
      setAccounts(null);
      currentId.current = detail.session.id;
      const athleteId = (detail.session as { athlete_id?: string }).athlete_id;
      setRecal(null);
      if ((detail.session as { _real?: boolean })._real !== false && athleteId) {
        // Recalage du sportif vérifié aussi quand c'est le coach qui note la séance ; le sportif garde l'annulation.
        checkRecalAfter(detail.session.id).catch(() => null)
          .then(rc => { if (currentId.current === detail.session.id) setRecal(rc); return loadAccounts({ userId: "", athleteId }); })
          .then(a => { if (currentId.current === detail.session.id) setAccounts(a); })
          .catch(e => console.error("[coach] comptes", e));
      }
      /* Sans décision ni reco figée : la reco rejouée par le serveur, pour que le verdict existe aussi
         sur les séances d'avant (sportif réel seulement, `_real`). */
      const ss = detail.session as ResultSession & { _real?: boolean };
      const fixed = (ss.autoreg_decision && ss.autoreg_decision.date === ss.date) || (ss.autoreg_proposal && ss.autoreg_proposal.date === ss.date);
      if (!fixed && ss._real !== false) {
        fetch("/api/coach/session-replay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: ss.id }) })
          .then(r => r.ok ? r.json() : null)
          .then(j => { if (j?.proposal) setShown(cur => cur && cur.session.id === ss.id ? { ...cur, session: { ...cur.session, autoreg_proposal: j.proposal } } : cur); })
          .catch(err => console.error("[coach] rejeu", err));
      }
      const r = sessionResult(detail.session, detail.week, detail.subject);
      posthog.capture("coach_session_result_shown", { rows: r.rows.length, verdict: !!(detail.session.autoreg_proposal || detail.session.autoreg_decision) });
    };
    window.addEventListener(COACH_RESULT, on);
    return () => window.removeEventListener(COACH_RESULT, on);
  }, []);
  if (!shown) return null;
  const r = sessionResult(shown.session, shown.week, shown.subject);
  const close = () => setShown(null);
  /* Le coach corrige le réalisé (« Léa a allégé sans le noter »), comme le sportif. */
  const correct = async (followed: boolean | null) => {
    const ss = shown.session;
    const res = await fetch("/api/sessions/followed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: ss.id, followed }) }).catch(() => null);
    if (!res?.ok) { console.error("[coach] correction", res?.status); return; }
    posthog.capture("autoreg_followed_corrected", { followed, side: "coach" });
    setShown(cur => cur && cur.session.id === ss.id ? { ...cur, session: { ...cur.session, autoreg_followed: followed } } : cur);
    const athleteId = (ss as { athlete_id?: string }).athlete_id;
    if (athleteId) loadAccounts({ userId: "", athleteId }).then(setAccounts).catch(() => {});
  };
  const real = (shown.session as { _real?: boolean })._real !== false;
  const btn: React.CSSProperties = { height: 46, borderRadius: RADIUS.control, fontSize: 14, fontWeight: 800, cursor: "pointer" };
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2147483100, padding: 18 }}
      onClick={e => { if (e.target === e.currentTarget) close(); }}
      role="dialog" aria-modal="true" aria-label={`Séance de ${shown.subject}`}
    >
      <div style={{ background: "#fff", color: "#171b1f", border: "1px solid rgba(0,0,0,.10)", boxShadow: "0 42px 120px rgba(0,0,0,.34)", borderRadius: RADIUS.card, padding: 26, width: "100%", maxWidth: 400, maxHeight: "calc(100dvh - 36px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#62686e" }}>{shown.subject}{shown.session.name ? ` · ${shown.session.name}` : ""}</div>
        <SessionBlock r={r} onCorrect={real ? correct : undefined} accounts={accounts} recal={recal} subject={shown.subject} />
        <div style={{ display: "grid", gridTemplateColumns: shown.onEdit ? "1fr 1fr" : "1fr", gap: 10 }}>
          {shown.onEdit && (
            <button onClick={() => { const fn = shown.onEdit; close(); fn?.(); }} style={{ ...btn, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#171b1f" }}>Modifier la séance</button>
          )}
          <button onClick={close} style={{ ...btn, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", boxShadow: "0 10px 24px rgba(212,64,0,.22)" }}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
