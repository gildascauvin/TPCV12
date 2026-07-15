"use client";

import { useState, useEffect } from "react";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import type { Program, SessionTemplate, WeekTemplate } from "@/types";
import { SessionTemplateCard, avgWeekRpe, loadBarColor } from "@/components/programs/ProgramBuilderModal";
import { loadRule, ruleTagColors } from "@/lib/loadRule";

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
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    let embedded = false;
    try { embedded = window.self !== window.top; } catch { embedded = true; }
    setIsEmbedded(embedded);
    posthog.capture("program_page_viewed", {
      program_id: program.id,
      program_name: program.name,
      is_embedded: embedded,
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("mode").eq("user_id", user.id).single();
      if (data?.mode) setUserMode(data.mode as "coach" | "athlete");
    });
  }, []);

  async function handleClaimConnected() {
    posthog.capture("program_cta_clicked", {
      program_id: program.id,
      program_name: program.name,
      cta: "add_to_library",
      is_embedded: isEmbedded,
    });
    setClaiming(true);
    try {
      const res = await fetch("/api/programs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: program.id }),
      });
      if (res.ok) {
        posthog.capture("program_claimed", {
          program_id: program.id,
          program_name: program.name,
          user_mode: userMode,
          is_embedded: isEmbedded,
        });
        setClaimed(true);
        setTimeout(() => {
          const dest = userMode === "coach" ? "/coach/planning" : "/today";
          if (isEmbedded) window.open(dest, "_blank");
          else window.location.href = dest;
        }, 1200);
      }
    } finally {
      setClaiming(false);
    }
  }

  function handleClaimGuest(cta: "create_account" | "use_program") {
    posthog.capture("program_cta_clicked", {
      program_id: program.id,
      program_name: program.name,
      cta,
      is_embedded: isEmbedded,
    });
    if (typeof window !== "undefined") {
      localStorage.setItem("claim_program_id", program.id);
    }
    if (isEmbedded) window.open("/register", "_blank");
    else window.location.href = "/register";
  }

  const weekAvgLoads = program.template.weeks.map(w => avgWeekRpe(w as WeekTemplate));
  const maxAvgLoad = Math.max(...weekAvgLoads, 0.01);
  const week = program.template.weeks[weekIdx] ?? {};
  const isLocked = weekIdx > 0 && userMode === null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#f1f0ee", display: "flex", flexDirection: "column" }}>

      {/* Topbar */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)", height: 56, padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!isEmbedded && <a href="/" style={{ color: "#8a8f94", fontSize: 20, textDecoration: "none", padding: "4px 6px" }}>←</a>}
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#171b1f", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {program.name}
            </div>
            {coachName && (
              <div style={{ fontSize: 11, color: "#8a8f94", lineHeight: 1 }}>par {coachName}</div>
            )}
          </div>
        </div>
        <a href="/login" target={isEmbedded ? "_blank" : undefined} rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "#8a8f94", textDecoration: "none" }}>Se connecter</a>
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

      {/* 7-column grid — same layout as planning */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, var(--wk-col, 240px))",
        alignItems: "start",
        gap: 10,
        overflowX: "auto",
        overflowY: "auto",
        height: "100%",
        padding: "14px 16px 18px",
        scrollSnapType: "x proximity",
        scrollbarWidth: "thin",
        filter: isLocked ? "blur(7px)" : "none",
        pointerEvents: isLocked ? "none" : "auto",
        userSelect: isLocked ? "none" : "auto",
      }}>
        {DAYS.map((day, dayIdx) => {
          const daySessions = (week[day] ?? []) as SessionTemplate[];
          const prevSess = (week[DAYS[dayIdx - 1]] ?? []) as SessionTemplate[];
          const nextSess = (week[DAYS[dayIdx + 1]] ?? []) as SessionTemplate[];
          const ctx = {
            prevMax: prevSess.length ? Math.max(...prevSess.map(s => s.target_difficulty ?? 6)) : 0,
            nextMax: nextSess.length ? Math.max(...nextSess.map(s => s.target_difficulty ?? 6)) : 0,
          };
          const rule = loadRule(daySessions.map(s => ({ target_difficulty: s.target_difficulty })), ctx);
          const tagColor = ruleTagColors[rule.cls];
          return (
            <div key={day} style={{ background: "#fff", borderRadius: 26, border: "1px solid rgba(0,0,0,.08)", padding: 16, boxShadow: "0 6px 18px rgba(0,0,0,0.05)", scrollSnapAlign: "start" }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 1000, letterSpacing: "0.12em", color: "#8a8f94", textTransform: "uppercase" }}>{day}</div>
              </div>

              {(daySessions.length > 0 || rule.cls !== "rest") && (
                <div style={{ margin: "0 0 12px", padding: "11px 13px", borderRadius: 16, background: "#f5f5f5", border: "1px solid rgba(0,0,0,.06)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.02em", color: "#171b1f", lineHeight: 1.2 }}>{rule.title}</div>
                    <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.09em", borderRadius: 999, padding: "4px 7px", whiteSpace: "nowrap", background: tagColor.bg, color: tagColor.color, flexShrink: 0 }}>{rule.tag}</div>
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.45, color: "#555b60" }}>{rule.text}</div>
                </div>
              )}

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

      {isLocked && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(241,240,238,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 22, padding: "22px 26px", maxWidth: 300, textAlign: "center", boxShadow: "0 12px 32px rgba(0,0,0,.14)", border: "1px solid rgba(0,0,0,.06)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#171b1f", letterSpacing: "-0.02em", lineHeight: 1.3, marginBottom: 16 }}>
              Obtenir le programme complet et le personnaliser
            </div>
            <button
              onClick={() => handleClaimGuest("use_program")}
              style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 12px rgba(212,64,0,.20)" }}
            >
              Créer un compte
            </button>
          </div>
        </div>
      )}
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
              onClick={() => handleClaimGuest("create_account")}
              style={{ flex: 1, padding: "13px", borderRadius: 12, border: "2px solid rgba(0,0,0,.10)", background: "#faf9f7", color: "#555", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Créer un compte →
            </button>
            <button
              onClick={() => handleClaimGuest("use_program")}
              style={{ flex: 1, padding: "13px", borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 12px rgba(212,64,0,.20)" }}
            >
              👤 Utiliser ce programme →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
