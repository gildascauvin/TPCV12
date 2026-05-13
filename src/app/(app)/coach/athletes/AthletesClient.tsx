"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import InviteModal from "@/components/coach/InviteModal";
import type { CoachAthlete } from "@/types";

function scoreColor(s: number) { return s >= 75 ? "#2f9e44" : s >= 60 ? "#f28a00" : "#d10000"; }
function statusLabel(s: number) { return s >= 75 ? "Disponible" : s >= 60 ? "Stable" : "À surveiller"; }

function AthleteRing({ score }: { score: number }) {
  const r = 20;
  const circ = +(2 * Math.PI * r).toFixed(1);
  const offset = +(circ * (1 - score / 100)).toFixed(1);
  return (
    <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0, borderRadius: 999, background: "linear-gradient(145deg,#171717,#2f2f2f)", filter: "drop-shadow(0 6px 14px rgba(0,0,0,.14))" }}>
      <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={scoreColor(score)} strokeWidth="5"
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
  const router = useRouter();
  const [athletes, setAthletes] = useState(initialAthletes);
  const [showInvite, setShowInvite] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(athlete: CoachAthlete) {
    const label = athlete.user_id ? "Retirer ce sportif de ton espace ?" : "Supprimer ce sportif ?";
    if (!confirm(label)) return;
    setDeleting(athlete.id);
    await fetch("/api/athlete/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachAthleteId: athlete.id }),
    });
    setAthletes(prev => prev.filter(a => a.id !== athlete.id));
    setDeleting(null);
  }

  return (
    <>
      <div className="page-shell">

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 4 }}>Coach</div>
            <div style={{ fontSize: 28, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", lineHeight: 1.1 }}>Mes athlètes</div>
            <div style={{ fontSize: 13, color: "#62686e", marginTop: 4 }}>
              {athletes.length} sportif{athletes.length !== 1 ? "s" : ""} suivi{athletes.length !== 1 ? "s" : ""}
            </div>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            style={{ height: 40, paddingLeft: 18, paddingRight: 18, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 20px rgba(212,64,0,.22)", flexShrink: 0, marginTop: 4 }}
          >
            + Inviter
          </button>
        </div>

        {athletes.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: 28, textAlign: "center", boxShadow: "0 4px 14px rgba(0,0,0,.05)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏅</div>
            <div style={{ fontSize: 18, fontWeight: 1000, color: "#171b1f", marginBottom: 8 }}>Aucun sportif encore</div>
            <div style={{ fontSize: 14, color: "#8a8f94", lineHeight: 1.5, marginBottom: 20 }}>
              Invite un sportif pour commencer à suivre son wellness et ses séances.
            </div>
            <button
              onClick={() => setShowInvite(true)}
              style={{ height: 46, paddingLeft: 24, paddingRight: 24, borderRadius: 14, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.24)" }}
            >
              Inviter un sportif →
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
            {athletes.map(a => (
              <div key={a.id} style={{
                background: a.user_id ? "#fff" : "rgba(255,255,255,.72)",
                border: a.user_id ? "1px solid rgba(47,158,68,.20)" : "1px solid rgba(34,54,38,.12)",
                borderRadius: 26, padding: 18,
                boxShadow: a.user_id ? "0 8px 24px rgba(47,158,68,.07)" : "0 12px 32px rgba(32,59,43,.08)",
              }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                  <AthleteRing score={a.wellness_score} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 16, fontWeight: 950, lineHeight: 1.1, color: "#1f2428" }}>{a.name}</div>
                      {a.user_id && (
                        <div style={{ padding: "2px 7px", borderRadius: 999, background: "rgba(47,158,68,.12)", color: "#2f9e44", fontSize: 9, fontWeight: 900, letterSpacing: "0.08em" }}>RÉEL</div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#6f7478", marginTop: 3 }}>
                      {a.sport} · <span style={{ color: scoreColor(a.wellness_score), fontWeight: 700 }}>{statusLabel(a.wellness_score)}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => router.push(`/coach/planning?athlete=${a.id}`)}
                    style={{ flex: 1, height: 38, borderRadius: 11, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(212,64,0,.22)" }}
                  >
                    Voir planning
                  </button>
                  <button
                    onClick={() => handleDelete(a)}
                    style={{ height: 38, paddingLeft: 12, paddingRight: 12, borderRadius: 11, background: "#fff8f8", border: "1px solid rgba(200,30,30,.20)", color: "#c81e1e", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: deleting === a.id ? 0.5 : 1 }}
                  >
                    {a.user_id ? "Retirer" : "Supprimer"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onLinked={() => router.refresh()}
        />
      )}
    </>
  );
}
