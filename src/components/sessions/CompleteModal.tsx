"use client";

import { hapticTick } from "@/lib/native";
import { useEffect, useState } from "react";
import type { Session } from "@/types";
import { computeFatigueImpact } from "@/lib/wellness";
import { createClient } from "@/lib/supabase/client";
import { fetchWorkoutsForDay, workoutLabel, workoutTime, type HealthWorkout } from "@/lib/healthWorkouts";
import { chronoMinutes } from "@/lib/liveSession";

interface CompleteModalProps {
  session: Session;
  onSave: (data: { rpe: number; duration: number }) => Promise<void>;
  onClose: () => void;
}

export default function CompleteModal({ session, onSave, onClose }: CompleteModalProps) {
  const [rpe, setRpe] = useState(session.rpe ?? 6);
  /* Séance démarrée avec le chrono (2026-10-02) : sa durée, pauses déduites, est pré-remplie. */
  const chrono = session.duration == null ? chronoMinutes(session) : null;
  const [duration, setDuration] = useState(session.duration ?? chrono ?? 45);
  const [saving, setSaving] = useState(false);
  // Entraînements enregistrés par la montre ce jour-là (app iOS → health_workouts). Si la séance n'a pas
  // encore de durée, on pré-remplit avec le plus long ; le sportif peut en choisir un autre ou ajuster.
  const [workouts, setWorkouts] = useState<HealthWorkout[]>([]);
  const [picked, setPicked] = useState<string | null>(chrono != null ? "chrono" : null);

  useEffect(() => {
    let alive = true;
    fetchWorkoutsForDay(createClient(), session.user_id, session.date).then(ws => {
      if (!alive || !ws.length) return;
      setWorkouts(ws);
      if (session.duration == null && chrono == null) {
        const longest = ws.reduce((a, b) => (b.duration_min > a.duration_min ? b : a));
        setPicked(longest.platform_id);
        setDuration(Math.min(240, longest.duration_min));
      }
    });
    return () => { alive = false; };
  }, [session.user_id, session.date, session.duration, chrono]);

  async function handleSave() {
    setSaving(true);
    await onSave({ rpe, duration });
    setSaving(false);
  }

  const impact = computeFatigueImpact(rpe, duration);
  const rpeCls = rpe >= 8 ? "hard" : rpe >= 5 ? "moderate" : "easy";
  const rpeColor = { hard: "#d44000", moderate: "#b96500", easy: "#2f9e44" }[rpeCls];

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2147483100, padding: 18,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", color: "#171b1f",
        border: "1px solid rgba(0,0,0,.10)",
        boxShadow: "0 42px 120px rgba(0,0,0,.34)",
        borderRadius: 24, padding: 28,
        width: "100%", maxWidth: 400,
        animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
      }}>
        {/* Title */}
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "#171b1f", marginBottom: 4 }}>
          Terminer la séance
        </div>
        <div style={{ fontSize: 14, color: "#62686e", marginBottom: 22, lineHeight: 1.4 }}>
          {session.name}
        </div>

        {/* Duration */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94" }}>Durée</div>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 20, fontWeight: 700, color: "#171b1f", letterSpacing: "-0.02em" }}>{duration} <span style={{ fontSize: 12, color: "#8a8f94", fontWeight: 600 }}>min</span></div>
          </div>
          <input
            type="range" min={5} max={240} step={1} value={duration}
            onChange={e => { setDuration(Number(e.target.value)); setPicked(null); }}
            style={{ width: "100%", accentColor: "#d44000", cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8a8f94", marginTop: 4 }}>
            <span>5 min</span><span>2h</span><span>4h</span>
          </div>
          {chrono != null && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button
                onClick={() => { setPicked("chrono"); setDuration(Math.min(240, chrono)); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999,
                  border: picked === "chrono" ? "1px solid rgba(212,64,0,.45)" : "1px solid rgba(0,0,0,.10)",
                  background: picked === "chrono" ? "#fff3e8" : "#f7f8f9", color: picked === "chrono" ? "#d44000" : "#3b4046",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                <span aria-hidden>⏱</span><span>Chrono · {chrono} min</span>
              </button>
            </div>
          )}
          {workouts.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "#8a8f94", marginBottom: 6 }}>
                {workouts.length > 1 ? "Enregistrés par ta montre ce jour-là :" : "Enregistré par ta montre :"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {workouts.map(w => {
                  const on = picked === w.platform_id;
                  return (
                    <button
                      key={w.platform_id}
                      onClick={() => { setPicked(w.platform_id); setDuration(Math.min(240, w.duration_min)); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999,
                        border: on ? "1px solid rgba(212,64,0,.45)" : "1px solid rgba(0,0,0,.10)",
                        background: on ? "#fff3e8" : "#f7f8f9", color: on ? "#d44000" : "#3b4046",
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      <span aria-hidden>⌚</span>
                      <span>{workoutLabel(w.workout_type)} · {workoutTime(w.start_at)} · {w.duration_min} min</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RPE */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94" }}>Difficulté réelle</div>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 20, fontWeight: 700, color: rpeColor, letterSpacing: "-0.02em" }}>{rpe}<span style={{ fontSize: 12, color: "#8a8f94", fontWeight: 600 }}>/10</span></div>
          </div>
          <input
            type="range" min={1} max={10} step={1} value={rpe}
            onChange={(e) => { const n = Number(e.target.value); hapticTick(rpe, n); setRpe(n); }}
            style={{ width: "100%", accentColor: "#d44000", cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8a8f94", marginTop: 4 }}>
            <span>Très facile</span><span>Modéré</span><span>Max effort</span>
          </div>
        </div>

        {/* Stats mini grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <div style={{ background: "#f7f8f9", borderRadius: 16, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 22, fontWeight: 700, color: "#171b1f", letterSpacing: "-0.02em", lineHeight: 1 }}>{duration}</div>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginTop: 4 }}>MINUTES</div>
          </div>
          <div style={{ background: "#f7f8f9", borderRadius: 16, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 22, fontWeight: 700, color: rpeColor, letterSpacing: "-0.02em", lineHeight: 1 }}>{rpe}</div>
            <div style={{ fontSize: 9, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginTop: 4 }}>DIFFICULTÉ</div>
          </div>
        </div>

        {/* Impact banner */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff3e8", border: "0.5px solid rgba(212,64,0,.22)", borderRadius: 12, padding: "10px 13px", marginBottom: 20, fontSize: 13, color: "#d44000", fontWeight: 700 }}>
          🔥 Impact fatigue estimé : −{impact} pts
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, height: 46, borderRadius: 16, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#62686e", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave} disabled={saving}
            style={{ flex: 1, height: 46, borderRadius: 16, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)" }}
          >
            {saving ? "..." : "Valider ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
