"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AddAthleteModal from "@/components/coach/AddAthleteModal";
import type { CoachAthlete } from "@/types";

function scoreColor(s: number) { return s >= 75 ? "#2f9e44" : s >= 60 ? "#f28a00" : "#d10000"; }
function statusLabel(s: number) { return s >= 75 ? "Disponible" : s >= 60 ? "Stable" : "À surveiller"; }

function AthleteRing({ score }: { score: number }) {
  const r = 20;
  const circ = +(2 * Math.PI * r).toFixed(1);
  const offset = +(circ * (1 - score / 100)).toFixed(1);
  const color = scoreColor(score);
  return (
    <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0, borderRadius: 999, background: "linear-gradient(145deg,#171717,#2f2f2f)", filter: "drop-shadow(0 6px 14px rgba(0,0,0,.14))" }}>
      <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.04em", color: "#fff" }}>{score}</span>
        <span style={{ fontSize: 6.5, fontWeight: 1000, letterSpacing: "0.13em", color: "rgba(255,255,255,.56)", marginTop: 2, textTransform: "uppercase" }}>well.</span>
      </div>
    </div>
  );
}

interface Props {
  userId: string;
  initialAthletes: CoachAthlete[];
}

export default function AthletesClient({ userId, initialAthletes }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [athletes, setAthletes] = useState<CoachAthlete[]>(initialAthletes);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CoachAthlete | null>(null);

  const saveAthlete = useCallback(async (data: { name: string; sport: string; wellness_score: number }) => {
    if (editing) {
      const { data: saved } = await supabase
        .from("coach_athletes").update(data).eq("id", editing.id).select().single();
      if (saved) setAthletes(prev => prev.map(a => a.id === saved.id ? saved as CoachAthlete : a));
    } else {
      const { data: saved } = await supabase
        .from("coach_athletes").insert({ coach_id: userId, ...data }).select().single();
      if (saved) setAthletes(prev => [...prev, saved as CoachAthlete]);
    }
    setEditing(null);
    setShowModal(false);
  }, [supabase, userId, editing]);

  const deleteAthlete = useCallback(async () => {
    if (!editing) return;
    await supabase.from("coach_athletes").delete().eq("id", editing.id);
    setAthletes(prev => prev.filter(a => a.id !== editing.id));
    setEditing(null);
    setShowModal(false);
  }, [supabase, editing]);

  return (
    <>
      <div style={{ padding: "16px 18px 100px", maxWidth: 600, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 4 }}>Coach</div>
            <div style={{ fontSize: 28, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", lineHeight: 1.1 }}>Mes athlètes</div>
            <div style={{ fontSize: 13, color: "#62686e", marginTop: 4 }}>
              {athletes.length} sportif{athletes.length !== 1 ? "s" : ""} suivi{athletes.length !== 1 ? "s" : ""}
            </div>
          </div>
          <button
            onClick={() => { setEditing(null); setShowModal(true); }}
            style={{ height: 40, paddingLeft: 16, paddingRight: 16, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)", flexShrink: 0, marginTop: 4 }}
          >
            + Ajouter
          </button>
        </div>

        {athletes.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: 28, textAlign: "center", boxShadow: "0 4px 14px rgba(0,0,0,.05)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏅</div>
            <div style={{ fontSize: 18, fontWeight: 1000, color: "#171b1f", marginBottom: 8 }}>Aucun sportif encore</div>
            <div style={{ fontSize: 14, color: "#8a8f94", lineHeight: 1.5, marginBottom: 20 }}>
              Ajoute ton premier sportif pour commencer à suivre son wellness et ses séances.
            </div>
            <button
              onClick={() => { setEditing(null); setShowModal(true); }}
              style={{ height: 46, paddingLeft: 24, paddingRight: 24, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)" }}
            >
              Ajouter un sportif →
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
            {athletes.map(a => (
              <div key={a.id} style={{
                background: "rgba(255,255,255,.72)", border: "1px solid rgba(34,54,38,.12)",
                borderRadius: 26, padding: 18,
                boxShadow: "0 12px 32px rgba(32,59,43,.08)",
              }}>
                {/* Card head */}
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                  <AthleteRing score={a.wellness_score} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 950, lineHeight: 1.1, color: "#1f2428" }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: "#6f7478", marginTop: 3 }}>
                      {a.sport} · <span style={{ color: scoreColor(a.wellness_score), fontWeight: 700 }}>{statusLabel(a.wellness_score)}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                  <button
                    onClick={() => router.push(`/coach/planning?athlete=${a.id}`)}
                    style={{ flex: 1, height: 38, borderRadius: 11, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(212,64,0,.22)" }}
                  >
                    Voir planning
                  </button>
                  <button
                    onClick={() => { setEditing(a); setShowModal(true); }}
                    style={{ height: 38, paddingLeft: 14, paddingRight: 14, borderRadius: 11, background: "#f0efed", color: "#62686e", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    Modifier
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <AddAthleteModal
          athlete={editing}
          onSave={saveAthlete}
          onDelete={editing ? deleteAthlete : undefined}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </>
  );
}
