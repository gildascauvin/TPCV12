"use client";

/* Carte « Ton bilan est prêt » en haut de l'Accueil (2026-10-23) : le bilan du mois passé les 3
   premiers jours du mois, sinon celui de la semaine passée du lundi au mercredi. Elle disparaît une
   fois ouverte ou fermée ; ensuite le bilan se retrouve dans le sélecteur de date. Rien si la période
   n'a pas au moins 3 check-ins (un bilan vide ne donne pas envie de revenir). */

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { mondayOf, periodFor, type BilanPeriodKind } from "@/lib/bilan";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function addDays(iso: string, n: number) { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

export function pendingBilan(today: string): { kind: BilanPeriodKind; anchor: string; label: string } | null {
  const day = Number(today.slice(8));
  if (day <= 3) {
    const prev = addDays(today.slice(0, 7) + "-01", -1);
    return { kind: "month", anchor: prev, label: `Ton bilan de ${MONTHS[Number(prev.slice(5, 7)) - 1]}` };
  }
  const dow = (new Date(today + "T12:00:00").getDay() + 6) % 7;
  if (dow <= 2) {
    const prevMonday = addDays(mondayOf(today), -7);
    return { kind: "week", anchor: prevMonday, label: "Ton bilan de la semaine" };
  }
  return null;
}

const seenKey = (kind: string, start: string) => `tpc_bilan_seen_${kind}_${start}`;

export default function BilanCard({ userId, today, onOpen }: { userId: string; today: string; onOpen: (kind: BilanPeriodKind, anchor: string) => void }) {
  const pending = pendingBilan(today);
  const [show, setShow] = useState(false);
  const period = pending ? periodFor(pending.kind, pending.anchor, pending.anchor) : null;

  useEffect(() => {
    if (!pending || !period) return;
    try { if (localStorage.getItem(seenKey(pending.kind, period.start))) return; } catch { /* stockage indisponible : on affiche */ }
    let alive = true;
    createClient().from("wellness_daily").select("id", { count: "exact", head: true })
      .eq("user_id", userId).gte("date", period.start).lte("date", period.end)
      .then(({ count, error }) => {
        if (error) { console.error("[bilan] carte", error.message); return; }
        if (alive && (count ?? 0) >= 3) { setShow(true); posthog.capture("bilan_card_shown", { period: pending.kind }); }
      });
    return () => { alive = false; };
  }, [userId, today]);

  if (!show || !pending || !period) return null;
  const markSeen = () => { try { localStorage.setItem(seenKey(pending.kind, period.start), "1"); } catch { /* sans effet */ } setShow(false); };

  return (
    <div style={{ position: "relative", marginBottom: 14 }}>
      <button
        onClick={() => { markSeen(); onOpen(pending.kind, pending.anchor); }}
        style={{
          width: "100%", textAlign: "left", cursor: "pointer", border: 0, borderRadius: 20, padding: "16px 18px",
          background: "linear-gradient(135deg, #d44000 0%, #8a2c00 100%)", boxShadow: "0 14px 40px rgba(212,64,0,0.35)",
          color: "#fff", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 6,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "#ffd9c7" }}>NOUVEAU</span>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, lineHeight: 1.2, paddingRight: 28 }}>{pending.label} est prêt</span>
        <span style={{ fontSize: 13, color: "#ffe6da" }}>Ce que tes données ont appris, en quelques écrans ›</span>
      </button>
      <button onClick={() => { markSeen(); posthog.capture("bilan_card_dismissed", { period: pending.kind }); }} aria-label="Masquer" style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, border: 0, borderRadius: 16, background: "rgba(0,0,0,0.18)", color: "#fff", fontSize: 18, cursor: "pointer" }}>×</button>
    </div>
  );
}
