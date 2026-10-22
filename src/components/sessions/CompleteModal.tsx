"use client";

import { useEffect, useState } from "react";
import type { Session } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { fetchWorkoutsForDay, workoutLabel, workoutTime, type HealthWorkout } from "@/lib/healthWorkouts";
import { chronoMinutes } from "@/lib/liveSession";
import { invalidatePhysio, requestPhysioReveal } from "@/lib/physioData";
import PhysioTeaser from "@/components/physio/PhysioTeaser";
import ScaleBars, { CR10_LABELS } from "@/components/ui/ScaleBars";
import RpeInsightLine from "@/components/sessions/RpeInsightLine";
import { rpeInsight, type RatedSession, type RpeInsight } from "@/lib/rpeInsight";


interface CompleteModalProps {
  session: Session;
  onSave: (data: { rpe: number; duration: number }) => Promise<void>;
  onClose: () => void;
}

export default function CompleteModal({ session, onSave, onClose }: CompleteModalProps) {
  /* Note en un tap (2026-10-17) : jamais de valeur par défaut pour une 1re note (le 6 d'avant
     était enregistré tel quel si on validait sans toucher). Une séance déjà notée garde sa note. */
  const [rpe, setRpe] = useState<number | null>(session.rpe ?? null);
  /* Séance démarrée avec le chrono (2026-10-02) : sa durée, pauses déduites, est pré-remplie. */
  const chrono = session.duration == null ? chronoMinutes(session) : null;
  const [duration, setDuration] = useState(session.duration ?? chrono ?? 45);
  const [saving, setSaving] = useState(false);
  /* Insight après la note (2026-10-20) : historique des séances notées, lu une fois. */
  const [rated, setRated] = useState<RatedSession[]>([]);
  const [insight, setInsight] = useState<RpeInsight | null>(null);
  useEffect(() => {
    let alive = true;
    const since = new Date(`${session.date}T12:00:00`); since.setDate(since.getDate() - 90);
    createClient().from("sessions").select("date, rpe")
      .eq("user_id", session.user_id).eq("done", true).not("rpe", "is", null).neq("id", session.id)
      .gte("date", since.toISOString().slice(0, 10)).lte("date", session.date)
      .then(({ data }) => { if (alive && data) setRated(data as RatedSession[]); });
    return () => { alive = false; };
  }, [session.id, session.user_id, session.date]);
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

  /* Ressenti à l'aveugle (2026-10-11) : la comparaison au cœur reste floutée jusqu'à la validation
     (PhysioRevealHost), note figée : rien ne peut la caler sur le cœur. */
  const hasHeart = workouts.some(w => w.trimp != null);
  const rpeMissing = rpe == null;

  async function handleSave() {
    if (rpe == null) return;
    setSaving(true);
    await onSave({ rpe, duration });
    setSaving(false);
    // Écran de résultat pour tous (2026-10-22) : ce que la séance a appris ; la comparaison au cœur
    // s'y ajoute quand la montre l'a mesurée. Aussi à la correction d'une séance déjà notée.
    if (hasHeart) invalidatePhysio();
    requestPhysioReveal({ kind: "session", sessionId: session.id, date: session.date, rpe, duration });
  }


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
        width: "100%", maxWidth: 400, maxHeight: "calc(100dvh - 36px)", overflowY: "auto",
        animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)",
      }}>
        {/* Title */}
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "#171b1f", marginBottom: 4 }}>
          Terminer la séance
        </div>
        <div style={{ fontSize: 14, color: "#62686e", marginBottom: 22, lineHeight: 1.4 }}>
          {session.name}
        </div>

        {hasHeart && <PhysioTeaser label="♥ Séance mesurée" text="Renseigne ton ressenti pour le comparer à ce qu'a mesuré ta fréquence cardiaque." chips={["142 bpm", "171 max", "Effort"]} />}

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
                {workouts.length > 1 ? "Enregistrés dans Santé ce jour-là :" : "Enregistré dans Santé :"}
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

        {/* RPE — jauge 1-10 (ScaleBars, palette charge), un libellé CR-10 par note. */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94" }}>Difficulté réelle</div>
          </div>
          <ScaleBars value={rpe} palette="load" labels={CR10_LABELS}
            onChange={n => { setRpe(n); setInsight(null); }}
            onRelease={n => setInsight(rpeInsight(n, session.target_difficulty, rated, session.date))} />
          <RpeInsightLine insight={insight} />
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
            onClick={handleSave} disabled={saving || rpeMissing}
            style={{ flex: 1, height: 46, borderRadius: 16, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: rpeMissing ? "default" : "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)", opacity: rpeMissing ? 0.45 : 1 }}
          >
            {saving ? "..." : "Valider ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
