"use client";

import { useState, type ReactNode } from "react";
import { CHARGE_PRESETS, presetOf, adjustLineCharge, type ChargeAdjust, type ChargePreset } from "@/lib/chargeAdjust";
import { ExerciseLineView, type ExerciseLineViewData } from "@/components/sessions/ExerciseLineView";

/* Réglage de charge commun à Dupliquer / Reconduire (Planning sportif et coach, Accueil, Coach
   Control, éditeur de programme) : 3 raccourcis + Intensité % / Volume % (chargeAdjust.ts).
   En Maintien, aucun réglage n'est affiché. */

const LABEL: React.CSSProperties = { fontSize: 11, fontFamily: "var(--font-mono), monospace", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 10 };
const PRESET_CARDS: { key: ChargePreset; icon: string; label: string }[] = [
  { key: "deload", icon: "📉", label: "Décharge" },
  { key: "maintien", icon: "⏸", label: "Maintien" },
  { key: "surcharge", icon: "📈", label: "Surcharge" },
];

const signed = (v: number, unit = "") => `${v > 0 ? "+" : v < 0 ? "−" : ""}${String(Math.abs(v)).replace(".", ",")}${unit}`;

function Stepper({ title, hint, value, step, unit, min, max, onChange }: { title: string; hint: string; value: number; step: number; unit: string; min: number; max: number; onChange: (v: number) => void }) {
  // Valeur touchable : saisie libre au clavier (au % près), bornée et arrondie au demi-point.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v * 2) / 2));
  const commit = () => {
    const v = parseFloat(draft.replace(",", ".").replace("−", "-").replace(/[^\d.+-]/g, ""));
    if (!Number.isNaN(v)) onChange(clamp(v));
    setEditing(false);
  };
  const btn = (disabled: boolean): React.CSSProperties => ({ width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(0,0,0,.12)", background: "#fff", fontSize: 17, color: "#171b1f", cursor: disabled ? "default" : "pointer", opacity: disabled ? .35 : 1 });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#171b1f" }}>{title}</div>
        <div style={{ fontSize: 11.5, color: "#8a8f94", marginTop: 2 }}>{hint}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <button aria-label={`${title} moins`} disabled={value <= min} onClick={() => onChange(clamp(value - step))} style={btn(value <= min)}>−</button>
        {editing ? (
          <input
            autoFocus inputMode="decimal" value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            style={{ width: 64, height: 34, textAlign: "center", fontSize: 16, fontWeight: 800, borderRadius: 10, border: "1.5px solid #d44000", outline: "none", fontFamily: "inherit" }}
          />
        ) : (
          <button
            aria-label={`${title} : saisir une valeur`}
            onClick={() => { setDraft(value ? String(value).replace(".", ",") : ""); setEditing(true); }}
            style={{ minWidth: 64, height: 34, textAlign: "center", fontSize: 14, fontWeight: 800, color: value ? "#d44000" : "#171b1f", background: "transparent", border: "1px dashed rgba(0,0,0,.15)", borderRadius: 10, cursor: "text" }}
          >
            {value ? signed(value, unit) : "="}
          </button>
        )}
        <button aria-label={`${title} plus`} disabled={value >= max} onClick={() => onChange(clamp(value + step))} style={btn(value >= max)}>+</button>
      </div>
    </div>
  );
}

export default function ChargeAdjustPicker({ value, onChange, title = "Charge de la copie" }: { value: ChargeAdjust; onChange: (a: ChargeAdjust) => void; title?: string }) {
  const preset = presetOf(value);
  // Maintien = rien à régler ; Décharge / Surcharge ouvrent les réglages, préremplis.
  const open = preset !== "maintien";
  const pick = (k: ChargePreset) => onChange(CHARGE_PRESETS[k]);
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={LABEL}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
        {PRESET_CARDS.map(m => {
          const on = preset === m.key;
          return (
            <div key={m.key} onClick={() => pick(m.key)} style={{ border: `2px solid ${on ? "#d44000" : "#eee"}`, background: on ? "rgba(212,64,0,.05)" : "#fff", borderRadius: 16, padding: "12px 8px", textAlign: "center", cursor: "pointer" }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: on ? "#d44000" : "#171b1f" }}>{m.label}</div>
            </div>
          );
        })}
      </div>
      {open && (
        <div style={{ background: "#f7f8f9", borderRadius: 16, padding: "2px 14px" }}>
          <Stepper title="Intensité" hint="Charges, %, allure, zone, RPE" value={value.inten} step={2.5} unit=" %" min={-50} max={50} onChange={inten => onChange({ ...value, inten })} />
          <div style={{ height: 1, background: "rgba(0,0,0,.06)" }} />
          <Stepper title="Volume" hint="Séries, durées, distances" value={value.vol} step={10} unit=" %" min={-80} max={100} onChange={vol => onChange({ ...value, vol })} />
        </div>
      )}
    </div>
  );
}

/** Rendu des lignes en avant/après dans une carte d'aperçu (prop renderExerciseLine des cartes). */
export function chargePreviewLine(adjust: ChargeAdjust) {
  return function render(line: string, index: number, view: ExerciseLineViewData): ReactNode {
    const text = adjustLineCharge(line, adjust);
    return (
      <div style={{ padding: "7px 9px", borderTop: index > 0 ? "1px solid rgba(0,0,0,.07)" : "none", background: "#fff" }}>
        <ExerciseLineView text={text} original={line} ctx={view.ctx} adjusting={text !== line} compact />
      </div>
    );
  };
}
