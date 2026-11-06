"use client";

import { useEffect, useRef, useState } from "react";
import { CR10_LABELS } from "@/components/ui/ScaleBars";
import RpeInsightLine from "@/components/sessions/RpeInsightLine";
import PointFormeRing from "@/components/wellness/PointFormeRing";
import { rpeInsight, type RpeInsight } from "@/lib/rpeInsight";
import { DARK_CARD_BG } from "@/lib/theme";
import { sessionLoad } from "@/lib/sessionLoad";
import type { CoachSession } from "@/types";
import { useExitAnimation } from "@/hooks/useExitAnimation";

interface Props {
  session: CoachSession;
  athleteName: string;
  onSave: (data: { rpe: number; duration: number }) => Promise<void>;
  onClose: () => void;
}

const DUR_MIN = 10, DUR_MAX = 180;
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, "0")}` : ""}` : `${m} min`);

/* Même formulaire à l'anneau que le sportif (CompleteModal, 2026-11-06) : effort puis durée, charge de la
   séance sur la piste fine. Aucune valeur par défaut pour une 1re note ; une séance déjà notée garde sa note. */
export default function CoachCompleteModal({ session, athleteName, onSave, onClose }: Props) {
  const { close, exitClass } = useExitAnimation(onClose);
  const [rpe, setRpe] = useState<number | null>(session.rpe ?? null);
  const [duration, setDuration] = useState(Math.max(DUR_MIN, Math.min(DUR_MAX, session.duration ?? 45)));
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<0 | 1>(0);
  const [pulse, setPulse] = useState(0);
  // Insight après la note : écart au prévu seulement (pas d'historique du sportif lu ici).
  const [insight, setInsight] = useState<RpeInsight | null>(null);
  const advance = useRef<number | null>(null);
  useEffect(() => () => { if (advance.current) window.clearTimeout(advance.current); }, []);
  const first = athleteName.split(" ")[0];

  async function handleSave() {
    if (rpe == null) return;
    setSaving(true);
    await onSave({ rpe, duration });
    setSaving(false);
  }

  const title = { fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.03em", color: "#fff", textAlign: "center", textWrap: "balance" } as React.CSSProperties;
  const L = rpe == null ? null : sessionLoad(rpe, duration);
  const loadFill = L ? L.fill : null;
  const loadLine = (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, height: 22, marginTop: 10, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.75)", opacity: loadFill == null ? 0 : 1, transition: "opacity .3s" }}>
      <span aria-hidden style={{ width: 16, height: 4, borderRadius: 2, background: "#ff7a33" }} />
      Charge de la séance{L ? <b style={{ color: "#fff" }}>{L.word.toLowerCase()}</b> : null}
    </div>
  );

  return (
    <div className={exitClass} style={{ position: "fixed", inset: 0, zIndex: 2147483100, background: DARK_CARD_BG, color: "#fff", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", minHeight: "100%", display: "flex", flexDirection: "column", padding: "max(14px, env(safe-area-inset-top)) 20px max(18px, env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, minHeight: 34 }}>
          {stage === 1 && (
            <button onClick={() => setStage(0)} aria-label="Retour"
              style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.06)", color: "#fff", cursor: "pointer", fontSize: 16, flexShrink: 0, display: "grid", placeItems: "center" }}>←</button>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.8)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.name} · {athleteName}</div>
          <button onClick={close} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,.6)", fontSize: 14, fontWeight: 700, padding: "6px 2px", fontFamily: "inherit", flexShrink: 0 }}>Annuler</button>
        </div>
        <div style={{ display: "flex", gap: 3, marginBottom: 22 }}>
          {[0, 1].map(i => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= stage ? "#fff" : "rgba(255,255,255,.14)", transition: "background 0.3s" }} />)}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingBottom: 24 }}>
          {stage === 0 ? (
            <div key="effort" style={{ animation: "modalIn 0.25s cubic-bezier(0.2,0,0,1)" }}>
              <div style={title}>Comment {first} a vécu sa séance ?</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginTop: 6, textAlign: "center" }}>L&apos;effort ressenti, sur toute la séance</div>
              <div style={{ marginTop: 18 }}>
                <PointFormeRing value={rpe} labels={CR10_LABELS} kicker="Effort" placeholder="Touche ou glisse sur l'anneau" palette="charge"
                  score={loadFill} pulse={pulse}
                  onChange={n => { if (advance.current) { window.clearTimeout(advance.current); advance.current = null; } setRpe(n); setInsight(null); }}
                  onRelease={n => {
                    setPulse(x => x + 1);
                    const ins = rpeInsight(n, session.target_difficulty, [], session.date);
                    setInsight(ins);
                    advance.current = window.setTimeout(() => { advance.current = null; setStage(1); }, ins ? 2600 : 450);
                  }} />
              </div>
              {loadLine}
              <RpeInsightLine insight={insight} dark />
            </div>
          ) : (
            <div key="duree" style={{ animation: "modalIn 0.25s cubic-bezier(0.2,0,0,1)" }}>
              <div style={title}>Combien de temps ?</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,.6)", marginTop: 6, textAlign: "center" }}>Glisse pour ajuster</div>
              <div style={{ marginTop: 18 }}>
                <PointFormeRing value={duration} min={DUR_MIN} max={DUR_MAX} ticks={7} tickEvery={5} palette="charge"
                  wordOf={fmtMin} ends={["10 min", "3 h"]} kicker="Durée" placeholder=""
                  better={m => 1 + Math.min(9, Math.floor(m / 20))}
                  score={loadFill} pulse={pulse}
                  onChange={setDuration} />
              </div>
              {loadLine}
            </div>
          )}
        </div>

        {stage === 1 && (
          <div style={{ position: "sticky", bottom: 0, paddingTop: 14 }}>
            <button onClick={handleSave} disabled={saving || rpe == null}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 16px", borderRadius: 16, border: "1px solid rgba(212,64,0,0.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 14px 28px rgba(212,64,0,0.25)", fontFamily: "inherit", opacity: rpe == null ? 0.45 : 1 }}>
              {saving ? <span aria-label="Enregistrement" style={{ width: 16, height: 16, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spinBtn 0.7s linear infinite" }} /> : `Valider ${fmtMin(duration)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
