"use client";

import { useEffect, useState } from "react";
import { proposalOfDay } from "@/lib/sessionInsight";

/* Gratuit dès le jour 0 (08/11, POC « Le gratuit ») : au-dessus du flou, un seul affichage tous les jours.
   Le compte à rebours jusqu'à son prochain point forme (demain, à l'heure de son rappel), puis ce qu'il
   rate, en texte, calculé sur ses propres décisions. */
export function missedLine(sessions: unknown[], today: string, signupDate: string | null, coach = false): string {
  if (signupDate && signupDate >= today) return coach ? "Tu viens de voir sa séance s'ajuster. Demain, elle se refait sur sa forme." : "Tu viens de voir ta séance s'ajuster. Demain, elle se refait sur ta forme.";
  const shift = (d: string, n: number) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const days = signupDate ? Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${signupDate}T12:00:00`).getTime()) / 86400000) : 7;
  const from = days >= 7 ? shift(today, -6) : (signupDate ?? shift(today, -6));
  let low = 0, high = 0;
  for (const s of sessions) {
    const d = (s as { date?: string }).date;
    if (!d || d < from || d > today) continue;
    const p = proposalOfDay(s);
    if (p?.proposed === "low") low++; else if (p?.proposed === "high") high++;
  }
  const n = low + high;
  if (!n) return coach ? "Demain matin, sa séance se cale sur sa forme." : "Demain matin, ta séance se cale sur ta forme.";
  const parts = [low ? `${low} allégée${low > 1 ? "s" : ""}` : null, high ? `${high} poussée${high > 1 ? "s" : ""}` : null].filter(Boolean).join(", ");
  const when = days >= 7 ? "cette semaine" : coach ? "depuis son inscription" : "depuis ton inscription";
  return `${n} séance${n > 1 ? "s" : ""} ${n > 1 ? "auraient" : "aurait"} changé ${when} : ${parts}.`;
}

function nextCheckin(hour: number): Date {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(hour, 0, 0, 0); return d;
}

export default function LockedRendezvous({ hour = 8, missed, coach = false }: { hour?: number; missed: string; coach?: boolean }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const target = nextCheckin(hour).getTime();
    const tick = () => setLeft(Math.max(0, Math.round((target - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [hour]);
  const hms = left == null ? "" : [Math.floor(left / 3600), Math.floor((left % 3600) / 60), left % 60].map(x => String(x).padStart(2, "0")).join(":");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 4, maxWidth: 280 }}>
      <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.75)", textShadow: "0 2px 10px rgba(0,0,0,.6)" }}>{coach ? "Son prochain point forme" : "Ton prochain point forme"}</span>
      <b style={{ fontFamily: "var(--font-mono), monospace", fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em", color: "#fff", textShadow: "0 2px 14px rgba(0,0,0,.6)", fontVariantNumeric: "tabular-nums", minHeight: 40 }} aria-label={left == null ? undefined : `Dans ${Math.floor(left / 3600)} heures et ${Math.floor((left % 3600) / 60)} minutes`}>{hms}</b>
      <span style={{ fontSize: 13, lineHeight: 1.4, color: "rgba(255,255,255,.85)", textShadow: "0 2px 10px rgba(0,0,0,.6)", marginBottom: 6 }}>{missed}</span>
    </div>
  );
}
