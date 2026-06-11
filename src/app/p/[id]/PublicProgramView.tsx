"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Program, SessionTemplate, WeekTemplate } from "@/types";
import { SessionTemplateCard, avgWeekRpe, loadBarColor } from "@/components/programs/ProgramBuilderModal";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

interface Props {
  program: Program;
  coachName: string | null;
}

export default function PublicProgramView({ program, coachName }: Props) {
  const [weekIdx, setWeekIdx] = useState(0);
  const [userMode, setUserMode] = useState<"coach" | "athlete" | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("mode").eq("user_id", user.id).single();
      if (data?.mode) setUserMode(data.mode as "coach" | "athlete");
    });
  }, []);

  async function handleClaimConnected() {
    setClaiming(true);
    try {
      const res = await fetch("/api/programs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: program.id }),
      });
      if (res.ok) {
        setClaimed(true);
        setTimeout(() => {
          window.location.href = userMode === "coach" ? "/coach/planning" : "/today";
        }, 1200);
      }
    } finally {
      setClaiming(false);
    }
  }

  function handleClaimGuest() {
    if (typeof window !== "undefined") {
      localStorage.setItem("claim_program_id", program.id);
    }
    window.location.href = "/register";
  }

  const weekAvgLoads = program.template.weeks.map(w => avgWeekRpe(w as WeekTemplate));
  const maxAvgLoad = Math.max(...weekAvgLoads, 0.01);
  const week = program.template.weeks[weekIdx] ?? {};

  return (
    <div style={{ position: "fixed", inset: 0, background: "#f1f0ee", display: "flex", flexDirection: "column" }}>

      {/* Topbar */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)", height: 56, padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/" style={{ color: "#8a8f94", fontSize: 20, textDecoration: "none", padding: "4px 6px" }}>←</a>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#171b1f", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {program.name}
            </div>
            {coachName && (
              <div style={{ fontSize: 11, color: "#8a8f94", lineHeight: 1 }}>par {coachName}</div>
            )}
          </div>
        </div>
        <a href="/login" style={{ fontSize: 13, fontWeight: 600, color: "#8a8f94", textDecoration: "none" }}>Se connecter</a>
      </div>

      {/* Week tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)", padding: "0 18px", display: "flex", alignItems: "flex-end", height: 56, gap: 0, overflowX: "auto", flexShrink: 0 }}>
        {program.template.weeks.map((_, i) => {
          const avg = weekAvgLoads[i];
          const barH = Math.max(4, Math.round((avg / maxAvgLoad) * 26));
          const isActive = i === weekIdx;
          return (
            <div
              key={i}
              onClick={() => setWeekIdx(i)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, padding: "0 4px 8px", borderBottom: isActive ? "2.5px solid #d44000" : "2.5px solid transparent", flexShrink: 0, cursor: "pointer" }}
            >
              <div style={{ width: 18, height: barH, borderRadius: "2px 2px 0 0", background: loadBarColor(avg), opacity: isActive ? 1 : 0.55 }} />
              <span style={{ fontSize: 11, fontWeight: isActive ? 800 : 500, color: isActive ? "#171b1f" : "#8a8f94", padding: "0 4px" }}>S{i + 1}</span>
            </div>
          );
        })}
      </div>

      {/* 7-column grid */}
      <div style={{ flex: 1, overflowX: "auto", overflowY: "auto", padding: "12px 18px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(160px, 1fr))", gap: 8, minWidth: 900 }}>
          {DAYS.map(day => {
            const daySessions = (week[day] ?? []) as SessionTemplate[];
            return (
              <div key={day} style={{ background: "#fff", borderRadius: 26, border: "1px solid rgba(0,0,0,.08)", padding: 16, boxShadow: "0 6px 18px rgba(0,0,0,0.05)" }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 1000, letterSpacing: "0.12em", color: "#8a8f94", textTransform: "uppercase" }}>{day}</div>
                </div>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.13em", color: "#8a8f94", textTransform: "uppercase", marginBottom: 7 }}>
                  Séances · {daySessions.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {daySessions.length === 0 && (
                    <div style={{ fontSize: 10, color: "#8a8f94", textAlign: "center", border: "0.5px dashed rgba(0,0,0,0.12)", borderRadius: 10, padding: "11px 4px" }}>
                      Repos / libre
                    </div>
                  )}
                  {daySessions.map((s, sIdx) => (
                    <SessionTemplateCard key={sIdx} session={s} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom CTA */}
      <div style={{ background: "#fff", borderTop: "1px solid rgba(0,0,0,.08)", padding: "12px 18px 20px", display: "flex", gap: 10, flexShrink: 0 }}>
        {claimed ? (
          <div style={{ flex: 1, textAlign: "center", padding: "14px 0", fontSize: 15, fontWeight: 800, color: "#2f9e44" }}>
            ✓ Programme ajouté à ta bibliothèque !
          </div>
        ) : userMode !== null ? (
          <button
            onClick={handleClaimConnected}
            disabled={claiming}
            style={{ flex: 1, padding: "13px", borderRadius: 12, border: "none", background: claiming ? "#e8e4df" : "linear-gradient(180deg,#f04a08,#d44000)", color: claiming ? "#aaa" : "#fff", fontWeight: 700, fontSize: 13, cursor: claiming ? "not-allowed" : "pointer", boxShadow: claiming ? "none" : "0 4px 12px rgba(212,64,0,.20)" }}
          >
            {claiming ? "Ajout en cours…" : "📚 Ajouter à ma bibliothèque →"}
          </button>
        ) : (
          <>
            <button
              onClick={handleClaimGuest}
              style={{ flex: 1, padding: "13px", borderRadius: 12, border: "2px solid rgba(0,0,0,.10)", background: "#faf9f7", color: "#555", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Créer un compte →
            </button>
            <button
              onClick={handleClaimGuest}
              style={{ flex: 1, padding: "13px", borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 12px rgba(212,64,0,.20)" }}
            >
              👤 S&apos;approprier →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
