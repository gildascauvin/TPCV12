"use client";

import { useEffect, useState } from "react";
import {
  type AutoregDir, type AutoregOriginal, formatAutoregPct, autoregCtaLabel,
  getAutoregDecision, setAutoregDecision, clearAutoregDecision,
} from "@/lib/autoregulation";
import DecisionGauge, { TOLERANCE } from "@/components/sessions/DecisionGauge";

// pct <-> difficulté (1-10) — vue/entrée de la jauge, jamais un nouvel axe de calcul : `selectedPct`
// reste la seule source de vérité (voir plus bas), ces 2 fonctions ne font que le traduire pour
// l'affichage/l'interaction (2026-09, remplace les chips ±% par une jauge draggable).
function diffFromPct(plannedDifficulty: number, pct: number): number {
  return plannedDifficulty * (1 + pct / 100);
}
function pctFromDiff(plannedDifficulty: number, diff: number): number {
  if (plannedDifficulty <= 0) return 0;
  return Math.round((diff / plannedDifficulty - 1) * 1000) / 10; // 1 décimale
}

/* Bloc décision partagé — Coach Control (CoachAthleteCard.tsx), Aujourd'hui (TodayClient.tsx) et
   Planning (/week, /coach/planning, via WeekSessionCard/DayColumn.tsx). Gère son propre état
   d'interaction (active → traité, persistée en localStorage via sessionId) ; délègue l'écriture
   réelle (DB) au parent via `onApply`, qui reste seul responsable du mécanisme de sauvegarde propre
   à sa surface (Supabase direct côté sportif, callSessionAPI admin côté coach).

   2e itération (2026-09, retour de Gildas sur le POC) : "la jauge de décision EST la jauge de
   difficulté de la séance, pas 2 jauges" — ce composant est désormais monté DIRECTEMENT dans la
   carte séance (remplace le DiffGauge statique), plus dans un encart insight séparé (AlertBox
   redevient informatif seul, sans actions, sur les 4 surfaces). Plus d'étape "cliquer pour ouvrir" :
   dès qu'une suggestion existe, la jauge (DecisionGauge) est visible et déjà positionnée sur la reco,
   avec Maintenir/Appliquer juste en dessous — `selectedPct` reste la seule source de vérité, la
   jauge n'en est qu'une vue/entrée traduite en difficulté 1-10 (voir diffFromPct/pctFromDiff
   plus haut). Remplace l'ancien mode "Planning ouvre AdjustSessionModal via onOpenModal" (retiré,
   plus aucun appelant) — cette modale reste utilisée SEULEMENT par le mode chaîné "Traiter les
   décisions" de Coach Control (CoachClient.tsx), indépendamment de ce composant. La prévisualisation
   se fait directement dans les lignes d'exercice de la carte séance, via `onPreviewChange`, que le
   parent redescend au composant qui affiche ces lignes — déclenchée dès le montage (reco
   pré-positionnée), pas seulement après un clic. */

interface Props {
  sessionId: string;
  dir: AutoregDir;
  reco: number;
  advice: string;
  /* Difficulté prévue AVANT ajustement (1-10) — nécessaire pour positionner la jauge (2026-09,
     remplace les chips ±%). Défaut 6 (jamais réellement atteint : AutoregButtons n'est rendu que
     lorsqu'une suggestion existe, ce qui garantit déjà `plannedDifficulty` non-null côté appelant —
     filet de sécurité pur pour les rares appelants qui ne le passent pas, ex. FrisePreviews en mode
     non-cliquable). */
  plannedDifficulty?: number;
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

export default function AutoregButtons({ sessionId, dir, reco, advice, sessionLabel, plannedDifficulty = 6, onPreviewChange, onApply, onMaintenir, onUndo, isActive, variant = "dark", severityColor }: Props) {
  const light = variant === "light";
  const tint = dir === "low" ? "#8a2d00" : "#166534"; // même palette que AlertBox
  const [mode, setMode] = useState<"active" | "decided">("active");
  // 3e itération (2026-09) — le curseur démarre à la difficulté PRÉVUE d'origine (pct=0), donc EN
  // DEHORS de la zone conseillée par construction (c'est justement ce décalage qui a déclenché la
  // suggestion). Retour de Gildas, fidèle au POC : "le curseur du RPE prévu est normalement en
  // dehors de la plage conseillée... le clic sur le CTA mets le curseur dans le range conseillé".
  const [selectedPct, setSelectedPct] = useState(0);
  const [decidedPct, setDecidedPct] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    const decision = getAutoregDecision(sessionId);
    if (decision) {
      setMode("decided");
      setDecidedPct(decision.pct);
      if (decision.pct !== null) onPreviewChange?.(decision.pct);
      return;
    }
    // Rien à prévisualiser au montage — le curseur est sur la difficulté d'origine (0%), donc
    // aucun ajustement n'est encore proposé tant que l'utilisateur n'a pas dragué ou cliqué le CTA.
    onPreviewChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const currentDiff = diffFromPct(plannedDifficulty, selectedPct);
  const targetDiff = diffFromPct(plannedDifficulty, reco);
  const inZone = Math.abs(currentDiff - targetDiff) <= TOLERANCE;
  // Le verbe du CTA suit la position RÉELLE du curseur, pas le `dir` figé de la suggestion — si
  // l'utilisateur drague au-delà de la zone côté opposé à `dir` (ex. suggestion "Alléger" mais
  // curseur tiré plus bas que la zone), il faut alors remonter, donc "Surcharger", pas "Alléger".
  // Retour de Gildas : "selon si le curseur est à gauche ou à droite du range, le CTA doit
  // s'ajuster". À l'état par défaut (curseur non dragué), ça coïncide toujours avec `dir` (c'est ce
  // décalage qui a déclenché la suggestion), donc aucun changement visible tant qu'on ne drague pas.
  const cursorDir: AutoregDir = currentDiff < targetDiff ? "high" : "low";
  // Cas réel (pas juste théorique) : `reco` est parfois assez faible (mismatch tout juste au-dessus
  // du seuil de 35) pour que la difficulté PRÉVUE d'origine (pct=0) tombe déjà dans la zone cible
  // (targetDifficulty±TOLERANCE) sans qu'aucun drag n'ait eu lieu — rien à ajuster. Retour de
  // Gildas : "quand un RPE prévu est déjà dans le range conseillé, pas besoin de CTA" — seul
  // `Maintenir` reste alors pertinent (pas d'écriture, le plan est déjà bon). Dès que l'utilisateur
  // drague (selectedPct!==0), le CTA réapparaît normalement, in-zone ou non.
  const hideAdjustCta = selectedPct === 0 && inZone;

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
    // Hors zone : un seul clic sur le CTA-verbe fait à la fois sauter le curseur dans la zone
    // conseillée ET applique — fidèle au POC (voir commentaire sur `selectedPct` plus haut), pas
    // une étape de confirmation séparée. Dans la zone : applique la valeur déjà réglée par l'user.
    const pctToApply = inZone ? selectedPct : reco;
    if (!inZone) {
      setSelectedPct(reco);
      onPreviewChange?.(reco);
    }
    setApplying(true);
    const original = await onApply(pctToApply);
    setApplying(false);
    // isActive === false : le compte n'est pas actif, onApply n'a fait que déclencher le
    // paywall/signup (rien d'écrit) — ne jamais marquer "traité" dans ce cas (voir commentaire du
    // prop isActive plus haut). Les chips restent ouvertes, prêtes à réessayer après connexion.
    if (isActive === false) return;
    setAutoregDecision(sessionId, dir, pctToApply, original ?? undefined);
    setMode("decided");
    setDecidedPct(pctToApply);
    onPreviewChange?.(pctToApply);
  }

  async function undo() {
    const decision = getAutoregDecision(sessionId);
    setUndoing(true);
    await onUndo?.(decision?.original);
    setUndoing(false);
    clearAutoregDecision(sessionId);
    setMode("active");
    setSelectedPct(0);
    onPreviewChange?.(null);
  }

  return (
    <div>
      {advice && (() => {
        /* Même split titre/détail qu'AlertBox (AlertText) : "\n" sépare un titre court en gras
           d'un détail en dessous. Un `advice` sans "\n" reste affiché tel quel, une seule ligne. */
        const nl = advice.indexOf("\n");
        const headline = nl === -1 ? advice : advice.slice(0, nl);
        const detail = nl === -1 ? null : advice.slice(nl + 1);
        return (
          <div style={{ marginBottom: 9 }}>
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

      {mode === "active" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <DecisionGauge
              dir={dir}
              light={light}
              targetDifficulty={diffFromPct(plannedDifficulty, reco)}
              value={diffFromPct(plannedDifficulty, selectedPct)}
              onChange={newDiff => selectChip(pctFromDiff(plannedDifficulty, newDiff))}
            />
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button
              onClick={maintenir}
              style={light
                ? { flex: hideAdjustCta ? undefined : 1, width: hideAdjustCta ? "100%" : undefined, border: "1px solid rgba(0,0,0,.14)", background: "rgba(255,255,255,.6)", color: tint, borderRadius: 10, padding: 9, fontSize: 12, fontWeight: 900, cursor: "pointer" }
                : { flex: hideAdjustCta ? undefined : 1, width: hideAdjustCta ? "100%" : undefined, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.12)", color: "#fff", borderRadius: 10, padding: 9, fontSize: 12, fontWeight: 900, cursor: "pointer" }}
            >
              → Maintenir
            </button>
            {!hideAdjustCta && (
              <button onClick={apply} disabled={applying} style={{ flex: 2, background: severityColor ?? "#E8571A", color: "#fff", border: "none", borderRadius: 10, padding: 9, fontSize: 12, fontWeight: 900, cursor: applying ? "default" : "pointer", opacity: applying ? 0.7 : 1 }}>
                {applying ? "..." : inZone ? "Appliquer →" : autoregCtaLabel(cursorDir)}
              </button>
            )}
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
