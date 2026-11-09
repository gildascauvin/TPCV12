"use client";

import { useEffect, useRef, useState } from "react";
import { useExitAnimation } from "@/hooks/useExitAnimation";
import type { Session } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { fetchWorkoutsForDay, workoutLabel, workoutTime, type HealthWorkout } from "@/lib/healthWorkouts";
import { isAndroidApp } from "@/lib/native";
import { chronoMinutes } from "@/lib/liveSession";
import { invalidatePhysio, requestPhysioReveal } from "@/lib/physioData";
import { CR10_LABELS } from "@/components/ui/ScaleBars";
import PointFormeRing from "@/components/wellness/PointFormeRing";
import { DARK_CARD_BG } from "@/lib/theme";
import { sessionLoad } from "@/lib/sessionLoad";
import RpeInsightLine from "@/components/sessions/RpeInsightLine";
import { rpeInsight, type RatedSession, type RpeInsight } from "@/lib/rpeInsight";


const DUR_MIN = 5, DUR_MAX = 240;

interface CompleteModalProps {
  session: Session;
  /* false = non enregistrée (31/10) : la fenêtre reste ouverte, pas d'écran de résultat. */
  onSave: (data: { rpe: number; duration: number }) => Promise<void | boolean>;
  onClose: () => void;
  /* Séance en direct : ce qui a bougé en séance, en mots (lib/liveSets sessionSummary). */
  summary?: string | null;
}

export default function CompleteModal({ session, onSave, onClose, summary }: CompleteModalProps) {
  /* Note en un tap (2026-10-17) : jamais de valeur par défaut pour une 1re note (le 6 d'avant
     était enregistré tel quel si on validait sans toucher). Une séance déjà notée garde sa note. */
  const { close, exitClass } = useExitAnimation(onClose);
  const [rpe, setRpe] = useState<number | null>(session.rpe ?? null);
  /* Séance démarrée avec le chrono (2026-10-02) : sa durée, pauses déduites, est pré-remplie. */
  const chrono = session.duration == null ? chronoMinutes(session) : null;
  const [duration, setDuration] = useState(session.duration ?? chrono ?? 45);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<0 | 1>(0);
  const [pulse, setPulse] = useState(0);
  const advance = useRef<number | null>(null);
  useEffect(() => () => { if (advance.current) window.clearTimeout(advance.current); }, []);
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
    const ok = await onSave({ rpe, duration });
    setSaving(false);
    if (ok === false) return;
    // Écran de résultat pour tous (2026-10-22) : ce que la séance a appris ; la comparaison au cœur
    // s'y ajoute quand la montre l'a mesurée. Aussi à la correction d'une séance déjà notée.
    if (hasHeart) invalidatePhysio();
    requestPhysioReveal({ kind: "session", sessionId: session.id, date: session.date, rpe, duration });
  }


  /* Fin de séance à l'anneau (2026-11-06, lot 2 du POC « Le curseur est le formulaire », version B) :
     plein écran sombre, l'effort puis la durée sur le même anneau que le point forme, en orange. La piste
     fine montre la charge de la séance (effort × durée) qui se construit ; la comparaison au prévu et à
     la semaine vit dans le mini bilan, juste après. Une séance déjà notée s'ouvre sur sa note. */
  const L = rpe == null ? null : sessionLoad(rpe, duration);
  const loadFill = L ? L.fill : null;
  const loadLine = (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, height: 22, marginTop: 10, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.75)", opacity: loadFill == null ? 0 : 1, transition: "opacity .3s" }}>
      <span aria-hidden style={{ width: 16, height: 4, borderRadius: 2, background: "#ff7a33" }} />
      Charge de la séance{L ? <b style={{ color: "#fff" }}>{L.word.toLowerCase()}</b> : null}
    </div>
  );
  const chip = (on: boolean) => ({
    display: "flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 999, fontFamily: "inherit",
    border: on ? "1px solid rgba(255,140,90,.65)" : "1px solid rgba(255,255,255,.14)",
    background: on ? "rgba(212,64,0,.18)" : "rgba(255,255,255,.05)", color: on ? "#ffc8a8" : "rgba(255,255,255,.75)",
    fontSize: 12.5, fontWeight: 700, cursor: "pointer",
  }) as React.CSSProperties;
  const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, "0")}` : ""}` : `${m} min`);

  /* « Valider » dans la feuille blanche, sous la réglette de durée (06/11). */
  const validateBtn = (
    <button onClick={handleSave} disabled={saving || rpeMissing}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 16px", borderRadius: 16, border: "1px solid rgba(212,64,0,0.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 14px 28px rgba(212,64,0,0.25)", fontFamily: "inherit", opacity: rpeMissing ? 0.45 : 1 }}>
              {saving ? <span aria-label="Enregistrement" style={{ width: 16, height: 16, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spinBtn 0.7s linear infinite" }} /> : `Valider ${fmtMin(duration)}`}
            </button>
  );
  return (
    <div className={exitClass} style={{ position: "fixed", inset: 0, zIndex: 2147483100, background: DARK_CARD_BG, color: "#fff", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", minHeight: "100%", display: "flex", flexDirection: "column", padding: "max(14px, env(safe-area-inset-top)) 20px calc(var(--answer-sheet-h, 0px) + max(18px, env(safe-area-inset-bottom)))", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, minHeight: 34 }}>
          {stage === 1 && (
            <button onClick={() => setStage(0)} aria-label="Retour"
              style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.06)", color: "#fff", cursor: "pointer", fontSize: 16, flexShrink: 0, display: "grid", placeItems: "center" }}>←</button>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.8)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.name}</div>
          <button onClick={close} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.6)", fontSize: 14, fontWeight: 700, padding: "6px 2px", fontFamily: "inherit", flexShrink: 0 }}>Annuler</button>
        </div>
        <div style={{ display: "flex", gap: 3, marginBottom: 22 }}>
          {[0, 1].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= stage ? "#fff" : "rgba(255,255,255,.14)", transition: "background 0.3s" }} />)}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: 24 }}>
          {stage === 0 ? (
            <div key="effort" style={{ animation: "modalIn 0.25s cubic-bezier(0.2,0,0,1)" }}>
              {summary && (
                <div style={{ fontSize: 13, lineHeight: 1.45, color: "rgba(255,255,255,.85)", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, padding: "10px 12px", marginBottom: 14 }}>{summary}</div>
              )}
              <div style={{ marginTop: 4 }}>
                <PointFormeRing value={rpe} labels={CR10_LABELS} kicker="Effort" placeholder="Touche ou glisse sur l'anneau" palette="charge" sheet="seg"
                  sheetTitle="Comment as-tu vécu ta séance ?" sheetSub="L'effort ressenti, sur toute la séance"
                  score={loadFill} pulse={pulse}
                  onChange={n => { if (advance.current) { window.clearTimeout(advance.current); advance.current = null; } setRpe(n); setInsight(null); }}
                  onRelease={n => {
                    setPulse(x => x + 1);
                    const ins = rpeInsight(n, session.target_difficulty, rated, session.date);
                    setInsight(ins);
                    advance.current = window.setTimeout(() => { advance.current = null; setStage(1); }, ins ? 2600 : 450);
                  }} />
              </div>
              {loadLine}
              <RpeInsightLine insight={insight} dark />
            </div>
          ) : (
            <div key="duree" style={{ animation: "modalIn 0.25s cubic-bezier(0.2,0,0,1)" }}>
              <div style={{ marginTop: 4 }}>
                <PointFormeRing value={duration} min={DUR_MIN} max={DUR_MAX} ticks={9} tickEvery={5} palette="charge" sheet="slider" sheetFooter={validateBtn}
                  sheetTitle="Combien de temps ?" sheetSub={picked === "chrono" ? "Préremplie par le chrono, pauses déduites" : "Glisse pour ajuster"}
                  wordOf={fmtMin} ends={["5 min", "4 h"]} kicker={picked === "chrono" ? "Chrono de la séance" : picked ? "Montre" : "Ta durée"} placeholder=""
                  better={m => 1 + Math.min(9, Math.floor(m / 25))}
                  score={loadFill} pulse={pulse}
                  onChange={m => { setDuration(m); setPicked(null); }} />
              </div>
              {loadLine}
              {(chrono != null || workouts.length > 0) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 14 }}>
                  {chrono != null && (
                    <button onClick={() => { setPicked("chrono"); setDuration(Math.min(DUR_MAX, Math.max(DUR_MIN, chrono))); }} style={chip(picked === "chrono")}>
                      <span aria-hidden>⏱</span>{picked === "chrono" ? "✓ " : ""}Chrono · {chrono} min
                    </button>
                  )}
                  {workouts.map(w => (
                    <button key={w.platform_id} onClick={() => { setPicked(w.platform_id); setDuration(Math.min(DUR_MAX, Math.max(DUR_MIN, w.duration_min))); }} style={chip(picked === w.platform_id)}>
                      <span aria-hidden>⌚</span>{picked === w.platform_id ? "✓ " : ""}{workoutLabel(w.workout_type)} · {workoutTime(w.start_at)} · {w.duration_min} min
                    </button>
                  ))}
                </div>
              )}
              {workouts.length > 0 && <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.5)", textAlign: "center", marginTop: 6 }}>Enregistré{workouts.length > 1 ? "s" : ""} dans {isAndroidApp() ? "Health Connect" : "Santé"} ce jour-là</div>}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
