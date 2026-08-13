"use client";

import { useState } from "react";
import { WellnessRing } from "@/components/coach/CoachAthleteCard";
import { zoneLabel } from "@/lib/wellness";
import { BEHAVIOR_META } from "@/lib/behaviors";
import { parseAndApply, adjustDifficulty } from "@/lib/loadAdjust";
import { type AutoregDir, AUTOREG_CHIPS, formatAutoregPct, autoregTitle } from "@/lib/autoregulation";

/* Modal décharge/surcharge — Planning (/week, /coach/planning, CTA directs sur la carte "aujourd'hui")
   et mode chaîné de Coach Control ("Traiter les décisions"). Repris du même moule visuel que
   ReconduireModal.tsx (chips, DiffGauge avant/après, diff preview strikethrough/bold) plutôt que le
   bottom-sheet littéral du POC — cohérence avec les autres modales de l'app (fond blanc, radius 30,
   centré), toutes construites sur ce même gabarit, jamais de bottom sheet ailleurs dans le repo. */

export interface AdjustSessionTarget {
  id: string;
  name: string;
  notes: string | null;
  target_difficulty: number | null;
}

interface Props {
  session: AdjustSessionTarget;
  dir: AutoregDir;
  reco: number;
  wellnessScore: number | null;
  behaviors?: string[];
  advice: string;
  onClose: () => void;
  onConfirm: (pct: number) => Promise<void>;
  /* Mode chaîné (Coach Control, "Traiter les décisions (N) →") */
  chainCurrent?: number;
  chainTotal?: number;
  onSkip?: () => void;
}

export default function AdjustSessionModal({ session, dir, reco, wellnessScore, behaviors = [], advice, onClose, onConfirm, chainCurrent, chainTotal, onSkip }: Props) {
  const [pct, setPct] = useState(reco);
  const [saving, setSaving] = useState(false);
  const chips = AUTOREG_CHIPS[dir];
  const chipsLabel = dir === "low" ? "De combien alléger ?" : "De combien surcharger ?";

  const lines = session.notes ? session.notes.split("\n").filter(Boolean) : [];
  const baseDiff = session.target_difficulty ?? 6;
  const effDiff = adjustDifficulty(baseDiff, pct);
  const effZone = effDiff <= 3 ? "FACILE" : effDiff <= 6 ? "MODÉRÉE" : "DURE";
  const effColor = effDiff <= 3 ? "#2a8045" : effDiff <= 6 ? "#f8a840" : "#E8571A";

  const rendered = lines.map(line => ({ line, after: parseAndApply(line, pct) }));
  const changedCount = rendered.filter(r => r.after !== r.line).length;

  async function handleConfirm() {
    setSaving(true);
    await onConfirm(pct);
    setSaving(false);
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
        borderRadius: 30, width: "100%", maxWidth: 480,
        maxHeight: "calc(100vh - 34px)", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ padding: "24px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.045em" }}>{autoregTitle(dir)}</div>
            {chainTotal != null && chainTotal > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#8a8f94" }}>Décision {(chainCurrent ?? 0) + 1}/{chainTotal}</span>
                <div style={{ display: "flex", gap: 3 }}>
                  {Array.from({ length: chainTotal }).map((_, i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i === chainCurrent ? "#d44000" : "rgba(0,0,0,.14)" }} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, background: "#f0efed", border: "none", cursor: "pointer", fontSize: 15, color: "#62686e", flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 0" }}>
          {/* Contexte wellness */}
          <div style={{ background: "#faf9f7", border: "1px solid rgba(0,0,0,.06)", borderRadius: 16, padding: 14, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: behaviors.length ? 8 : 0 }}>
              <WellnessRing score={wellnessScore} size={48} />
              <div style={{ fontSize: 13, fontWeight: 900, color: "#171b1f" }}>{zoneLabel(wellnessScore)}</div>
            </div>
            {behaviors.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {behaviors.map(b => {
                  const meta = BEHAVIOR_META[b];
                  if (!meta) return null;
                  return (
                    <span key={b} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: meta.positive ? "rgba(47,158,68,.12)" : "rgba(212,64,0,.10)", color: meta.positive ? "#2f9e44" : "#d44000" }}>
                      {meta.emoji} {meta.label}
                    </span>
                  );
                })}
              </div>
            )}
            <div style={{ borderTop: "1px solid rgba(0,0,0,.06)", margin: "10px 0 8px" }} />
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "#3a3f44" }}>{advice}</div>
          </div>

          {/* Jauge de difficulté effective */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase", color: "#8a8f94" }}>Difficulté effective</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", color: effColor }}>{effZone}</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: "#fff", background: effColor, borderRadius: 999, padding: "2px 8px" }}>{effDiff}</span>
              </div>
            </div>
            <div style={{ width: "100%", height: 8, borderRadius: 999, background: "#e7e4df", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 999, width: `${effDiff * 10}%`, background: effColor, transition: "width .2s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8a8f94", marginTop: 4 }}>
              <span>Facile</span><span>Modérée</span><span>Dure</span>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 6 }}>Séance</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#171b1f", marginBottom: 16 }}>{session.name}</div>

          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 }}>{chipsLabel}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {chips.map(v => {
              const active = v === pct;
              return (
                <button
                  key={v}
                  onClick={() => setPct(v)}
                  style={{
                    padding: "9px 16px", borderRadius: 999, fontSize: 14, fontWeight: 800, cursor: "pointer",
                    border: `1.5px solid ${active ? "#d44000" : "rgba(0,0,0,.12)"}`,
                    background: active ? "linear-gradient(180deg,#f04a08,#d44000)" : "#fff",
                    color: active ? "#fff" : "#62686e",
                    boxShadow: active ? "0 4px 12px rgba(212,64,0,.22)" : "none",
                  }}
                >
                  {formatAutoregPct(v)}
                </button>
              );
            })}
          </div>

          {/* Aperçu */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94" }}>Aperçu</div>
            <span style={{ fontSize: 10, fontWeight: 800, color: changedCount > 0 ? "#d44000" : "#8a8f94", background: changedCount > 0 ? "rgba(212,64,0,.10)" : "#f0efed", borderRadius: 999, padding: "2px 8px" }}>
              {changedCount} modifié{changedCount > 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ marginBottom: 20, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,0,0,.06)" }}>
            {rendered.length === 0 && <div style={{ fontSize: 12, color: "#bbb", fontStyle: "italic", padding: 12, textAlign: "center" }}>Aucun exercice</div>}
            {rendered.map(({ line, after }, i) => {
              const changed = after !== line;
              return changed ? (
                <div key={i} style={{ padding: "8px 12px", background: "#fff8f5", borderTop: i > 0 ? "1px solid rgba(0,0,0,.05)" : "none" }}>
                  <div style={{ fontSize: 11, color: "#b8bfc4", textDecoration: "line-through", marginBottom: 1, wordBreak: "break-word" }}>{line}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#E8571A", wordBreak: "break-word" }}>{after}</div>
                </div>
              ) : (
                <div key={i} style={{ fontSize: 12, color: "#aaa", fontStyle: "italic", padding: "8px 12px", borderTop: i > 0 ? "1px solid rgba(0,0,0,.05)" : "none", wordBreak: "break-word" }}>
                  {line}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{
          flexShrink: 0, display: "flex", gap: 10, alignItems: "center",
          padding: "16px 24px 20px", borderTop: "1px solid #f0f0f0", background: "#fff",
        }}>
          {onSkip && (
            <button onClick={onSkip} style={{ background: "none", border: "none", color: "#8a8f94", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
              Sauter →
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "#f5f5f5", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 14, cursor: "pointer", color: "#666" }}>
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            style={{ background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "..." : `Appliquer ${formatAutoregPct(pct)} →`}
          </button>
        </div>
      </div>
    </div>
  );
}
