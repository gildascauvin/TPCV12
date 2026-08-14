"use client";

import { useEffect, useState } from "react";
import {
  type AutoregDir, type AutoregOriginal, AUTOREG_CHIPS, formatAutoregPct, autoregCtaLabel,
  getAutoregDecision, setAutoregDecision, clearAutoregDecision,
} from "@/lib/autoregulation";

/* Bloc décision inline partagé — Coach Control (CoachAthleteCard.tsx) et Aujourd'hui
   (TodayClient.tsx). Gère son propre état d'interaction (idle → chips ouvertes → traité,
   persistée en localStorage via sessionId) ; délègue l'écriture réelle (DB) au parent via
   `onApply`, qui reste seul responsable du mécanisme de sauvegarde propre à sa surface
   (Supabase direct côté sportif, callSessionAPI admin côté coach).
   Pas de jauge, pas de diff séparée ici (contrairement au modal Planning/mode chaîné) — la
   prévisualisation se fait directement dans les lignes d'exercice de la carte séance, via
   `onPreviewChange`, que le parent redescend au composant qui affiche ces lignes. */

interface Props {
  sessionId: string;
  dir: AutoregDir;
  reco: number;
  advice: string;
  /* Ex. "Sprint technique" — utilisé dans la ligne "traité" ("−15% appliqué · Sprint technique") */
  sessionLabel: string;
  onPreviewChange?: (pct: number | null) => void;
  /* Retourne le snapshot AVANT écriture (notes/target_difficulty d'origine) — capturé par le
     parent, seul à connaître la valeur pré-modification au moment précis de l'appel. Stocké
     avec la décision pour permettre un "Annuler" fidèle (voir autoregulation.ts). */
  onApply?: (pct: number) => Promise<AutoregOriginal | void>;
  onMaintenir?: () => void;
  /* Reçoit le snapshot d'origine stocké au moment de la décision (absent pour un "Maintenir",
     qui n'a rien écrit) — au parent de réécrire ces valeurs telles quelles en base. */
  onUndo?: (original?: AutoregOriginal) => void | Promise<void>;
  /* Planning (/week, /coach/planning) : pas d'expansion inline, "Alléger/Surcharger →" ouvre
     directement le modal (AdjustSessionModal) — fourni, remplace tout le mode "open" ci-dessous.
     Le "traité" reste géré ici (localStorage) ; le parent doit rappeler setAutoregDecision() lui-même
     une fois le modal confirmé (voir WeekClient.tsx/CoachPlanningClient.tsx). */
  onOpenModal?: () => void;
}

export default function AutoregButtons({ sessionId, dir, reco, advice, sessionLabel, onPreviewChange, onApply, onMaintenir, onUndo, onOpenModal }: Props) {
  const [mode, setMode] = useState<"idle" | "open" | "decided">("idle");
  const [selectedPct, setSelectedPct] = useState(reco);
  const [decidedPct, setDecidedPct] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    const decision = getAutoregDecision(sessionId);
    if (decision) {
      setMode("decided");
      setDecidedPct(decision.pct);
      if (decision.pct !== null) onPreviewChange?.(decision.pct);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function openChips() {
    if (onOpenModal) { onOpenModal(); return; }
    setSelectedPct(reco);
    setMode("open");
    onPreviewChange?.(reco);
  }

  function cancel() {
    setMode("idle");
    onPreviewChange?.(null);
  }

  function selectChip(v: number) {
    setSelectedPct(v);
    onPreviewChange?.(v);
  }

  async function maintenir() {
    setAutoregDecision(sessionId, dir, null);
    setMode("decided");
    setDecidedPct(null);
    onMaintenir?.();
  }

  async function apply() {
    if (!onApply) return;
    setApplying(true);
    const original = await onApply(selectedPct);
    setApplying(false);
    setAutoregDecision(sessionId, dir, selectedPct, original ?? undefined);
    setMode("decided");
    setDecidedPct(selectedPct);
    onPreviewChange?.(selectedPct);
  }

  async function undo() {
    const decision = getAutoregDecision(sessionId);
    setUndoing(true);
    await onUndo?.(decision?.original);
    setUndoing(false);
    clearAutoregDecision(sessionId);
    setMode("idle");
    onPreviewChange?.(null);
  }

  const chips = AUTOREG_CHIPS[dir];
  const chipsLabel = dir === "low" ? "De combien alléger ?" : "De combien surcharger ?";

  return (
    <div>
      {advice && (
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: "#fff", marginBottom: mode === "idle" ? 10 : 9 }}>
          {advice}
        </div>
      )}

      {mode === "idle" && (
        <div style={{ display: "flex", gap: 7 }}>
          <button
            onClick={maintenir}
            style={{ flex: 1, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.12)", color: "#fff", borderRadius: 10, padding: "10px 8px", fontSize: 12, fontWeight: 900, cursor: "pointer" }}
          >
            → Maintenir
          </button>
          <button
            onClick={openChips}
            style={{ flex: 1, border: "none", background: dir === "low" ? "#f28a00" : "#2a8045", color: "#fff", borderRadius: 10, padding: "10px 8px", fontSize: 12, fontWeight: 900, cursor: "pointer" }}
          >
            {autoregCtaLabel(dir)}
          </button>
        </div>
      )}

      {mode === "open" && (
        <div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,.12)", margin: "0 0 9px" }} />
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginBottom: 8 }}>
            {chipsLabel}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {chips.map(v => {
              const active = v === selectedPct;
              return (
                <button
                  key={v}
                  onClick={() => selectChip(v)}
                  style={{
                    border: `1px solid ${active ? "#E8571A" : "rgba(255,255,255,.18)"}`,
                    background: active ? "#E8571A" : "rgba(255,255,255,.08)",
                    color: active ? "#fff" : "rgba(255,255,255,.75)",
                    borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer",
                  }}
                >
                  {formatAutoregPct(v)}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button onClick={cancel} style={{ flex: 1, background: "rgba(255,255,255,.09)", color: "rgba(255,255,255,.6)", border: "none", borderRadius: 10, padding: 9, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              Annuler
            </button>
            <button onClick={apply} disabled={applying} style={{ flex: 2, background: "#E8571A", color: "#fff", border: "none", borderRadius: 10, padding: 9, fontSize: 12, fontWeight: 900, cursor: applying ? "default" : "pointer", opacity: applying ? 0.7 : 1 }}>
              {applying ? "..." : `Appliquer ${formatAutoregPct(selectedPct)} →`}
            </button>
          </div>
        </div>
      )}

      {mode === "decided" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, padding: "8px 11px" }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#2a8045", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, flexShrink: 0 }}>✓</div>
          <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.9)", minWidth: 0 }}>
            {decidedPct !== null ? `${formatAutoregPct(decidedPct)} appliqué · ${sessionLabel}` : `Maintenu · ${sessionLabel}`}
          </div>
          <button onClick={undo} disabled={undoing} style={{ background: "none", border: "none", color: "rgba(255,255,255,.5)", fontSize: 11, fontWeight: 700, cursor: undoing ? "default" : "pointer", opacity: undoing ? 0.6 : 1, flexShrink: 0 }}>
            {undoing ? "..." : "Annuler"}
          </button>
        </div>
      )}
    </div>
  );
}
