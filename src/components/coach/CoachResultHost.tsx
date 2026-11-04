"use client";

/* Écran de résultat côté coach (2026-10-23) : toucher une séance faite d'un sportif (Coach Control,
   Planning) ouvre le même écran que le sportif voit en fin de séance, à la 3e personne : le verdict
   de la reco du matin (« L'alerte du matin était fondée », « Ton ajustement était juste »…),
   ressenti vs prévu, sa place dans la semaine. Sans les données de la montre : le coach n'y a pas
   accès (health_* propriétaire seul). « Modifier la séance » ouvre l'éditeur d'avant.
   Depuis le 2026-11-04 : mini bilan plein écran comme le sportif (« Sa semaine », « Ressenti vs prévu »),
   et après un point forme saisi par le coach, une seule slide « Sa séance du jour » (ce que la reco du
   matin change ; le score, il le voit déjà sur le radar). */

import { useEffect, useRef, useState } from "react";
import { useExitAnimation } from "@/hooks/useExitAnimation";
import posthog from "posthog-js";
import { SessionExtras, RecalNote, checkRecalAfter, type RecalNotice } from "@/components/physio/PhysioRevealHost";
import MiniBilan from "@/components/physio/MiniBilan";
import { sessionSlides, todaySlide } from "@/components/physio/miniSlides";
import { loadBilanRaw } from "@/lib/bilanData";
import type { TodaySession } from "@/lib/resultContext";
import { sessionResult, type ResultSession, type WeekSession } from "@/lib/sessionInsight";

export const COACH_RESULT = "tpc-coach-result";
export type CoachResultDetail = { session: ResultSession; week: WeekSession[]; subject: string; onEdit?: () => void };

/* Point forme saisi par le coach (WellnessModal + subject) : la reco figée renvoyée par /api/sessions/proposal. */
export const COACH_CHECKIN_RESULT = "tpc-coach-checkin-result";
export type CoachCheckinDetail = { subject: string; athleteId: string; date: string; session: TodaySession };
export function requestCoachCheckinResult(detail: CoachCheckinDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COACH_CHECKIN_RESULT, { detail }));
}

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
  const [checkin, setCheckin] = useState<CoachCheckinDetail | null>(null);
  const currentId = useRef<string | null>(null);
  const [recal, setRecal] = useState<RecalNotice | null>(null);
  const [sport, setSport] = useState<string | null>(null);
  const [before, setBefore] = useState<WeekSession[]>([]);
  // Fermeture animée ; « Modifier la séance » enchaîne sans animation.
  const { close: dismiss, exitClass } = useExitAnimation(() => { setShown(null); setCheckin(null); });
  /* Sport (photo) et 4 semaines avant le lundi (barres « Sa semaine ») du sportif, via la route coach du bilan. */
  const loadAthlete = (athleteId: string, date: string, key: string) => {
    loadBilanRaw({ userId: "", today: date, athleteId }).then(raw => {
      if (currentId.current !== key) return;
      setSport(raw.profile?.sport ?? null);
      const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const monday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const from = new Date(d); from.setDate(from.getDate() - 28);
      const fromIso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
      setBefore((raw.sessions as WeekSession[]).filter(x => x.date >= fromIso && x.date < monday));
    }).catch(e => console.error("[coach] données du sportif", e));
  };
  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent<CoachResultDetail>).detail;
      setCheckin(null); setShown(detail); setSport(null); setBefore([]);
      currentId.current = detail.session.id;
      const athleteId = (detail.session as { athlete_id?: string }).athlete_id;
      setRecal(null);
      if ((detail.session as { _real?: boolean })._real !== false && athleteId) {
        loadAthlete(athleteId, detail.session.date, detail.session.id);
        // Recalage du sportif vérifié aussi quand c'est le coach qui note la séance ; le sportif garde l'annulation.
        checkRecalAfter(detail.session.id).catch(() => null)
          .then(rc => { if (currentId.current === detail.session.id) setRecal(rc); })
          .catch(err => console.error("[coach] recalage", err));
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
    const onCheckin = (e: Event) => {
      const detail = (e as CustomEvent<CoachCheckinDetail>).detail;
      setShown(null); setCheckin(detail); setSport(null);
      currentId.current = `checkin-${detail.athleteId}-${detail.date}`;
      loadAthlete(detail.athleteId, detail.date, currentId.current);
      posthog.capture("coach_checkin_result_shown", { proposed: detail.session.autoreg_proposal?.proposed ?? null });
    };
    window.addEventListener(COACH_RESULT, on);
    window.addEventListener(COACH_CHECKIN_RESULT, onCheckin);
    return () => { window.removeEventListener(COACH_RESULT, on); window.removeEventListener(COACH_CHECKIN_RESULT, onCheckin); };
  }, []);

  if (checkin) {
    const first = checkin.subject.split(" ")[0];
    const slide = todaySlide(checkin.session, checkin.date, sport, first);
    if (!slide) return null;
    return <MiniBilan slides={[slide]} title={`POINT FORME DE ${first.toUpperCase()}`} alt={false} onClose={dismiss} exitClass={exitClass} />;
  }
  if (!shown) return null;
  const first = shown.subject.split(" ")[0];
  const r = sessionResult(shown.session, shown.week, shown.subject);
  const close = () => setShown(null);
  /* Le coach corrige le réalisé (« Léa a allégé sans le noter »), comme le sportif. */
  const correct = async (followed: boolean | null) => {
    const ss = shown.session;
    const res = await fetch("/api/sessions/followed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: ss.id, followed }) }).catch(() => null);
    if (!res?.ok) { console.error("[coach] correction", res?.status); return; }
    posthog.capture("autoreg_followed_corrected", { followed, side: "coach" });
    setShown(cur => cur && cur.session.id === ss.id ? { ...cur, session: { ...cur.session, autoreg_followed: followed } } : cur);
  };
  const real = (shown.session as { _real?: boolean })._real !== false;
  const slides = sessionSlides({
    session: shown.session, summary: r, result: null, mean: "", week: shown.week, workout: null, before,
    extras: <SessionExtras r={r} onCorrect={real ? correct : undefined} />,
    recal: recal ? <RecalNote recal={recal} subject={first} /> : null,
  }, sport, first);
  if (!slides.length) return null;
  const edit = shown.onEdit ? (
    <button onClick={() => { const fn = shown.onEdit; close(); fn?.(); }}
      style={{ height: 46, borderRadius: 14, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Modifier la séance</button>
  ) : null;
  return (
    <MiniBilan slides={slides} title={`SÉANCE DE ${first.toUpperCase()}`} alt={false} onClose={dismiss} exitClass={exitClass} actions={edit}
      onSlide={(key, index) => posthog.capture("mini_bilan_slide_viewed", { kind: "coach_session", slide: key, index, slides: slides.length })} />
  );
}
