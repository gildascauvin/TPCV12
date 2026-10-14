"use client";

import { useEffect, useState } from "react";
import DiffGauge from "@/components/calendar/DiffGauge";
import { RADIUS } from "@/lib/theme";
import { loadPhysioData, PHYSIO_REVEAL, type PhysioRevealDetail } from "@/lib/physioData";
import { heartResultFor, heartVerdictText, physioVerdictAt, type HeartResult, type PhysioVerdict } from "@/lib/physioCompare";
import posthog from "posthog-js";

/* Fin de formulaire "Ressenti vs physiologie" (2026-10-11). Le tiroir qui vient d'enregistrer
   (Terminer la séance, check-in) se ferme ; cet écran prend le relais avec la comparaison, la note
   étant déjà figée en base. Monté une fois dans le layout de l'app, côté sportif. */

type Shown =
  | { kind: "session"; detail: Extract<PhysioRevealDetail, { kind: "session" }>; result: HeartResult | null }
  | { kind: "wellness"; verdict: PhysioVerdict | null };

export default function PhysioRevealHost({ userId }: { userId: string }) {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const onReveal = async (e: Event) => {
      const detail = (e as CustomEvent<PhysioRevealDetail>).detail;
      const data = await loadPhysioData(userId, true).catch(() => null);
      if (!data) return;
      if (detail.kind === "session") {
        const history = data.sessions.filter(s => s.id !== detail.sessionId);
        const result = heartResultFor({ date: detail.date, duration: detail.duration, rpe: detail.rpe }, history, data.workouts);
        if (!result) return;
        setShown({ kind: "session", detail, result });
        posthog.capture("physio_reveal_shown", { kind: "session", result: result.kind === "ok" ? result.verdict : "calibrating" });
      } else {
        const verdict = physioVerdictAt(detail.date, detail, data.checkins, data.health);
        if (!verdict) return;
        setShown({ kind: "wellness", verdict });
        posthog.capture("physio_reveal_shown", { kind: "wellness", result: verdict.kind });
      }
    };
    window.addEventListener(PHYSIO_REVEAL, onReveal);
    return () => window.removeEventListener(PHYSIO_REVEAL, onReveal);
  }, [userId]);

  if (!shown) return null;
  const close = () => setShown(null);

  let title: string, sub: string, body: React.ReactNode;
  if (shown.kind === "session") {
    const r = shown.result!;
    const t = heartVerdictText(r);
    title = "Séance enregistrée ✓";
    sub = `${shown.detail.duration} min · difficulté ${shown.detail.rpe}`;
    body = (
      <div style={{ background: "#f7f8f9", borderRadius: RADIUS.block, padding: "14px 14px" }}>
        {r.kind === "ok" && (
          <div style={{ display: "grid", gridTemplateColumns: "64px 1fr 28px", gap: "8px 10px", alignItems: "center", marginBottom: 12, fontSize: 12.5, fontWeight: 700, color: "#171b1f" }}>
            <span>Ressenti</span><DiffGauge value={r.rpe} height={10} /><span style={mono}>{r.rpe}</span>
            <span>♥ Cœur</span><DiffGauge value={Math.max(1, Math.round(r.predicted))} height={10} /><span style={mono}>{Math.round(r.predicted)}</span>
          </div>
        )}
        <div style={{ fontSize: 14, fontWeight: 800, color: "#171b1f", lineHeight: 1.3 }}>{t.title}</div>
        <div style={{ fontSize: 13, color: "#62686e", marginTop: 5, lineHeight: 1.45 }}>{t.text}</div>
      </div>
    );
  } else {
    const v = shown.verdict!;
    title = "Ta nuit selon tes données physiologiques";
    sub = "Check-in enregistré ✓";
    body = (
      <div style={{ background: "#f7f8f9", borderRadius: RADIUS.block, padding: "14px 14px" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#171b1f", lineHeight: 1.3 }}>{v.title}</div>
        <div style={{ fontSize: 13, color: "#62686e", marginTop: 5, lineHeight: 1.45 }}>{v.text}</div>
      </div>
    );
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2147483100, padding: 18 }}
      onClick={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div style={{ background: "#fff", color: "#171b1f", border: "1px solid rgba(0,0,0,.10)", boxShadow: "0 42px 120px rgba(0,0,0,.34)", borderRadius: RADIUS.card, padding: 26, width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 16, animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{title}</div>
          <div style={{ fontSize: 13.5, color: "#62686e", marginTop: 4 }}>{sub}</div>
        </div>
        {body}
        <div style={{ fontSize: 11.5, color: "#8a8f94", textAlign: "center" }}>
          {shown.kind === "session" ? "Ta note est enregistrée : la comparaison ne la modifie pas." : "Tes réponses sont enregistrées : tes données physiologiques ne les modifient pas."}
        </div>
        <button
          onClick={close}
          style={{ height: 46, borderRadius: RADIUS.control, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)" }}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

const mono: React.CSSProperties = { fontFamily: "var(--font-mono), monospace", fontSize: 14, fontWeight: 700, textAlign: "right" };
