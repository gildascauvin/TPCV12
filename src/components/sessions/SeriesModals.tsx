"use client";

import { useState } from "react";
import ChargeAdjustPicker from "@/components/sessions/ChargeAdjustPicker";
import { NO_ADJUST, type ChargeAdjust } from "@/lib/chargeAdjust";

/* Fenêtres des séances en série (2026-11-01, façon Google Agenda), communes à l'éditeur de
   programme et au Planning sportif / coach :
   - SeriesChoiceModal : « Cette séance seulement / Celle-ci et les suivantes (jusqu'à …) » après
     une modification, un déplacement ou une suppression. Le fond ne ferme pas la fenêtre.
   - RepeatModal : « Répéter chaque semaine jusqu'à … » + progression (ChargeAdjustPicker). */

const OVERLAY: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 2147483300 };
const CARD: React.CSSProperties = { background: "#fff", color: "#171b1f", borderRadius: 30, maxWidth: 420, width: "100%", boxShadow: "0 42px 120px rgba(0,0,0,.34)", animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" };
const TITLE: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25 };
const SELECT: React.CSSProperties = { padding: "4px 6px", borderRadius: 9, border: "1px solid rgba(0,0,0,.15)", fontSize: 14, fontWeight: 700, background: "#fff", color: "#171b1f", fontFamily: "inherit" };
const PRIMARY: React.CSSProperties = { width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 12px rgba(212,64,0,.20)" };
const SECONDARY: React.CSSProperties = { padding: "12px 18px", borderRadius: 12, border: "1px solid rgba(0,0,0,.10)", background: "#faf9f7", color: "#555", fontWeight: 700, fontSize: 14, cursor: "pointer" };

function Radio({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 16, border: `1.5px solid ${on ? "#d44000" : "rgba(0,0,0,.08)"}`, background: on ? "rgba(212,64,0,.04)" : "#fff", marginBottom: 8, cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#171b1f" }}>
      <span style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${on ? "#d44000" : "#c9c6c1"}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {on && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d44000" }} />}
      </span>
      {children}
    </div>
  );
}

export function SeriesChoiceModal({ title, summary, untilOptions, defaultAll = true, confirmLabel = "OK", onConfirm, onCancel }: {
  title: string;
  summary?: string;
  /** Présent : « Celle-ci et les suivantes, jusqu'à [▾] ». Dernière option sélectionnée par défaut. */
  untilOptions?: { value: string; label: string }[];
  defaultAll?: boolean;
  confirmLabel?: string;
  onConfirm: (all: boolean, until: string | null) => void;
  /** Absent : pas de bouton Annuler (« Cette séance seulement » fait office de choix par défaut). */
  onCancel?: () => void;
}) {
  const [all, setAll] = useState(defaultAll);
  const [until, setUntil] = useState(untilOptions?.length ? untilOptions[untilOptions.length - 1].value : null);
  return (
    <div style={OVERLAY}>
      <div style={{ ...CARD, padding: 28 }}>
        <div style={{ ...TITLE, marginBottom: summary ? 6 : 18 }}>{title}</div>
        {summary && <div style={{ fontSize: 13, color: "#62686e", marginBottom: 18, lineHeight: 1.45 }}>{summary}</div>}
        <Radio on={!all} onClick={() => setAll(false)}>Cette séance seulement</Radio>
        <Radio on={all} onClick={() => setAll(true)}>
          {untilOptions?.length ? (
            <span>Celle-ci et les suivantes, jusqu&apos;à{" "}
              <select value={until ?? ""} onClick={e => e.stopPropagation()} onChange={e => { setUntil(e.target.value); setAll(true); }} style={SELECT}>
                {untilOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </span>
          ) : <span>Celle-ci et les suivantes</span>}
        </Radio>
        <button onClick={() => onConfirm(all, all ? until : null)} style={{ ...PRIMARY, marginTop: 12 }}>{confirmLabel}</button>
        {onCancel && <button onClick={onCancel} style={{ ...SECONDARY, width: "100%", marginTop: 8 }}>Annuler</button>}
      </div>
    </div>
  );
}

export function RepeatModal({ sessionName, dayLabel, untilOptions, untilDate, onConfirm, onCancel }: {
  sessionName: string;
  /** « lundi » */
  dayLabel: string;
  /** Programme : semaines possibles (« S4 »). */
  untilOptions?: { value: string; label: string }[];
  /** Planning : date de fin libre (valeur par défaut, ISO). */
  untilDate?: string;
  onConfirm: (until: string, step: ChargeAdjust) => void;
  onCancel: () => void;
}) {
  const [until, setUntil] = useState(untilOptions?.length ? untilOptions[untilOptions.length - 1].value : (untilDate ?? ""));
  const [step, setStep] = useState<ChargeAdjust>(NO_ADJUST);
  return (
    <div style={OVERLAY}>
      <div style={{ ...CARD, maxHeight: "92dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ overflowY: "auto", padding: 28 }}>
          <div style={{ ...TITLE, marginBottom: 16 }}>Répéter « {sessionName} »</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 18, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            Chaque {dayLabel}, jusqu&apos;{untilOptions ? "à" : "au"}
            {untilOptions ? (
              <select value={until} onChange={e => setUntil(e.target.value)} style={SELECT}>
                {untilOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input type="date" value={until} onChange={e => setUntil(e.target.value)} style={{ ...SELECT, fontSize: 15 }} />
            )}
          </div>
          <ChargeAdjustPicker value={step} onChange={setStep} title="Progression chaque semaine" />
        </div>
        <div style={{ flexShrink: 0, padding: "20px 28px 20px", borderTop: "1px solid rgba(0,0,0,.08)", display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={SECONDARY}>Annuler</button>
          <button disabled={!until} onClick={() => until && onConfirm(until, step)} style={{ ...PRIMARY, flex: 1, width: "auto", opacity: until ? 1 : .5 }}>↻ Répéter</button>
        </div>
      </div>
    </div>
  );
}

/** Ligne du tiroir : « ↻ Chaque lundi jusqu'au 30/11 » ou bouton « ↻ Répéter chaque semaine ». */
export function SeriesRow({ label, onRepeat }: { label: string | null; onRepeat?: () => void }) {
  if (label) return <div style={{ fontSize: 13, fontWeight: 700, color: "#62686e" }}>{label}</div>;
  if (!onRepeat) return null;
  return (
    <button onClick={onRepeat} style={{ background: "#f7f8f9", border: "1px solid rgba(0,0,0,.08)", borderRadius: 12, padding: "7px 11px", fontSize: 13, fontWeight: 700, color: "#62686e", cursor: "pointer" }}>
      ↻ Répéter chaque semaine
    </button>
  );
}
