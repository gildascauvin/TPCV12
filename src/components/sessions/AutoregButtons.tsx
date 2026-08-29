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
  /* Bug réel trouvé en testant la sandbox (2026-08-19) : `onApply` renvoie systématiquement
     `undefined` à la fois quand il gate (compte non actif, redirection paywall/signup) ET parfois
     quand il réussit (certains appelants ne renvoient rien d'explicite) — `apply()` ne pouvait donc
     jamais distinguer "gaté, rien d'écrit" de "réussi" et marquait toujours la décision "traitée"
     en localStorage, y compris quand rien n'avait été sauvegardé (un compte free/expired qui
     clique "Appliquer" voyait "✓ appliqué" alors que la DB n'avait pas bougé). Prop optionnelle,
     absente = comportement historique inchangé (ancien code sans gating) ; tous les appelants
     réels doivent désormais la passer. */
  isActive?: boolean;
  /* Variante claire, pour rester lisible quand le parent (AlertBox, CoachAthleteCard) passe en
     fond pastel plutôt que sombre. Toutes les couleurs codées en dur ici supposaient un parent
     sombre (texte blanc, boutons translucides blancs) — défaut "dark" pour les appelants pas
     concernés (AdjustSessionModal, FrisePreviews). */
  variant?: "dark" | "light";
  /* Couleur du CTA principal ("⬇ Alléger →"), dérivée de la vraie sévérité (suggestionSeverityColor,
     autoregulation.ts) par l'appelant qui connaît la suggestion complète — le cas 🚨 critique a un
     CTA rouge, cohérent avec le bandeau et le halo déjà rouges dans ce cas, pas seulement l'orange
     générique du cas ⚠️ modéré. Absente = repli historique (orange fixe pour "low", vert fixe pour
     "high") — utilisé par les appelants pas concernés par ce raffinement. */
  severityColor?: string;
}

export default function AutoregButtons({ sessionId, dir, reco, advice, sessionLabel, onPreviewChange, onApply, onMaintenir, onUndo, onOpenModal, isActive, variant = "dark", severityColor }: Props) {
  const light = variant === "light";
  const tint = dir === "low" ? "#8a2d00" : "#166534"; // même palette que AlertBox
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
    // isActive === false : le compte n'est pas actif, onApply n'a fait que déclencher le
    // paywall/signup (rien d'écrit) — ne jamais marquer "traité" dans ce cas (voir commentaire du
    // prop isActive plus haut). Les chips restent ouvertes, prêtes à réessayer après connexion.
    if (isActive === false) return;
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
      {advice && (() => {
        /* Même split titre/détail qu'AlertBox (AlertText) : "\n" sépare un titre court en gras
           d'un détail en dessous. Un `advice` sans "\n" reste affiché tel quel, une seule ligne. */
        const nl = advice.indexOf("\n");
        const headline = nl === -1 ? advice : advice.slice(0, nl);
        const detail = nl === -1 ? null : advice.slice(nl + 1);
        return (
          <div style={{ marginBottom: mode === "idle" ? 10 : 9 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.2, color: light ? tint : "#fff", marginBottom: detail ? 5 : 0 }}>
              {headline}
            </div>
            {detail && (
              <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.45, color: light ? tint : "#fff", opacity: light ? 1 : 0.85 }}>
                {detail}
              </div>
            )}
          </div>
        );
      })()}

      {mode === "idle" && (
        <div style={{ display: "flex", gap: 7 }}>
          <button
            onClick={maintenir}
            style={light
              ? { flex: 1, border: "1px solid rgba(0,0,0,.14)", background: "rgba(255,255,255,.6)", color: tint, borderRadius: 10, padding: "10px 8px", fontSize: 12, fontWeight: 900, cursor: "pointer" }
              : { flex: 1, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.12)", color: "#fff", borderRadius: 10, padding: "10px 8px", fontSize: 12, fontWeight: 900, cursor: "pointer" }}
          >
            → Maintenir
          </button>
          <button
            onClick={openChips}
            style={{ flex: 1, border: "none", background: severityColor ?? (dir === "low" ? "#f28a00" : "#2a8045"), color: "#fff", borderRadius: 10, padding: "10px 8px", fontSize: 12, fontWeight: 900, cursor: "pointer" }}
          >
            {autoregCtaLabel(dir)}
          </button>
        </div>
      )}

      {mode === "open" && (
        <div>
          <div style={{ borderTop: `1px solid ${light ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.12)"}`, margin: "0 0 9px" }} />
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: light ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.5)", marginBottom: 8 }}>
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
                    border: `1px solid ${active ? "#E8571A" : light ? "rgba(0,0,0,.16)" : "rgba(255,255,255,.18)"}`,
                    background: active ? "#E8571A" : light ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.08)",
                    color: active ? "#fff" : light ? "rgba(0,0,0,.6)" : "rgba(255,255,255,.75)",
                    borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer",
                  }}
                >
                  {formatAutoregPct(v)}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button onClick={cancel} style={{ flex: 1, background: light ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.09)", color: light ? "rgba(0,0,0,.5)" : "rgba(255,255,255,.6)", border: "none", borderRadius: 10, padding: 9, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              Annuler
            </button>
            <button onClick={apply} disabled={applying} style={{ flex: 2, background: "#E8571A", color: "#fff", border: "none", borderRadius: 10, padding: 9, fontSize: 12, fontWeight: 900, cursor: applying ? "default" : "pointer", opacity: applying ? 0.7 : 1 }}>
              {applying ? "..." : `Appliquer ${formatAutoregPct(selectedPct)} →`}
            </button>
          </div>
        </div>
      )}

      {mode === "decided" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: light ? "rgba(0,0,0,.04)" : "rgba(255,255,255,.08)", border: `1px solid ${light ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.12)"}`, borderRadius: 10, padding: "8px 11px" }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#2a8045", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, flexShrink: 0 }}>✓</div>
          <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: light ? "rgba(0,0,0,.75)" : "rgba(255,255,255,.9)", minWidth: 0 }}>
            {decidedPct !== null ? `${formatAutoregPct(decidedPct)} appliqué · ${sessionLabel}` : `Maintenu · ${sessionLabel}`}
          </div>
          <button onClick={undo} disabled={undoing} style={{ background: "none", border: "none", color: light ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.5)", fontSize: 11, fontWeight: 700, cursor: undoing ? "default" : "pointer", opacity: undoing ? 0.6 : 1, flexShrink: 0 }}>
            {undoing ? "..." : "Annuler"}
          </button>
        </div>
      )}
    </div>
  );
}
