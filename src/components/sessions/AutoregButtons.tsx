"use client";

import { useEffect, useState } from "react";
import {
  type AutoregDir, type AutoregOriginal, formatAutoregPoints, autoregCtaLabel, zoneRange,
  pointsToPct, pctToPoints,
  getAutoregDecision, setAutoregDecision, clearAutoregDecision,
} from "@/lib/autoregulation";
import DecisionGauge from "@/components/sessions/DecisionGauge";

// pct <-> difficulté (1-10) — vue/entrée de la jauge, jamais un nouvel axe de calcul : `selectedPct`
// reste la seule source de vérité (voir plus bas), ces 2 fonctions ne font que le traduire pour
// l'affichage/l'interaction (2026-09, remplace les chips ±% par une jauge draggable). Delta en
// points de RPE <-> % via la table FIXE pointsToPct()/pctToPoints() (2026-09-26, remplace l'ancien
// calcul proportionnel à `plannedDifficulty` — voir leur doc dans autoregulation.ts, "trop brutal"
// sur une séance déjà légère).
function diffFromPct(plannedDifficulty: number, pct: number): number {
  return plannedDifficulty + pctToPoints(pct);
}
function pctFromDiff(plannedDifficulty: number, diff: number): number {
  return pointsToPct(Math.round(diff - plannedDifficulty));
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
  /* `dir`/`reco` optionnels (2026-09-25, retour de Gildas — "même quand ya pas de reco, je veux
     pouvoir bouger la jauge et avoir le range") : absents = pas de suggestion système ("Plan
     cohérent"), la jauge reste montée en mode LIBRE — zone conseillée = la difficulté déjà prévue
     elle-même (reco=0), le sportif/coach peut quand même la faire glisser pour un ajustement
     volontaire, le CTA apparaissant dès qu'il sort de cette zone (verbe dérivé de la position réelle
     du curseur, cursorDir — jamais de `dir` figé à appliquer). Un vrai `dir`/`reco` (suggestion
     système) garde son comportement 100% inchangé : jauge pré-positionnée sur la reco, clic hors
     zone qui y saute. */
  dir?: AutoregDir;
  reco?: number;
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

export default function AutoregButtons({ sessionId, dir, reco = 0, advice, sessionLabel, plannedDifficulty = 6, onPreviewChange, onApply, onMaintenir, onUndo, isActive, variant = "dark", severityColor }: Props) {
  const light = variant === "light";
  const hasSuggestion = dir !== undefined;
  // Neutre (ni rouge "Alléger" ni vert "Surcharger") en mode libre — il n'y a pas de recommandation
  // à teinter, seul le curseur (cursorDir, plus bas) dira une direction une fois dragué.
  const tint = dir === "low" ? "#8a2d00" : dir === "high" ? "#166534" : (light ? "rgba(23,27,31,.5)" : "rgba(255,255,255,.5)"); // même palette que AlertBox
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
  // Cible CONSERVATRICE — toujours un entier, arrondi ici au cas où `plannedDifficulty` lui-même
  // serait fractionnaire (ex. 4.4, une séance déjà ajustée par le passé). C'est TOUJOURS la valeur
  // à appliquer (voir apply() plus bas), quelle que soit la direction — voir zoneRange()/
  // autoregulation.ts pour le pourquoi ("6-7" surcharge / "5-6" allège, jamais un point isolé).
  const targetInt = Math.round(diffFromPct(plannedDifficulty, reco));
  // Zone = 2 ENTIERS (2026-09-25, retour de Gildas avec capture : "des fois le range conseillé se
  // retrouve entre 2 entier de RPE, ce qui fait que c'est impossible de déplacer le curseur dedans"
  // — le curseur ne se pose QUE sur des entiers, voir DecisionGauge.tsx). En mode libre (pas de
  // suggestion, `dir` absent), la zone reste réduite au plan lui-même (rien à élargir sans
  // direction réelle).
  const { zoneLow, zoneHigh } = hasSuggestion
    ? zoneRange(targetInt, dir!)
    : { zoneLow: Math.round(plannedDifficulty), zoneHigh: Math.round(plannedDifficulty) };
  const roundedCurrent = Math.round(currentDiff);
  const inZone = roundedCurrent >= zoneLow && roundedCurrent <= zoneHigh;
  // Le verbe du CTA suit la position RÉELLE du curseur, pas le `dir` figé de la suggestion — si
  // l'utilisateur drague au-delà de la zone côté opposé à `dir` (ex. suggestion "Alléger" mais
  // curseur tiré plus bas que la zone), il faut alors remonter, donc "Surcharger", pas "Alléger".
  // Retour de Gildas : "selon si le curseur est à gauche ou à droite du range, le CTA doit
  // s'ajuster". À l'état par défaut (curseur non dragué), ça coïncide toujours avec `dir` (c'est ce
  // décalage qui a déclenché la suggestion), donc aucun changement visible tant qu'on ne drague pas.
  const cursorDir: AutoregDir = currentDiff < targetInt ? "high" : "low";
  // Cas réel (pas juste théorique) : `reco` est parfois assez faible (mismatch tout juste au-dessus
  // du seuil de 35) pour que la difficulté PRÉVUE d'origine (pct=0) tombe déjà dans la zone cible
  // sans qu'aucun drag n'ait eu lieu — rien à ajuster. Retour de Gildas (2026-09-25, généralisé) :
  // "quand le RPE prévu est déjà dans le range recommandé, pas besoin du CTA 'Maintenir'" — ni lui
  // ni "Alléger/Surcharger" ne s'affichent dans ce cas (avant : seul Maintenir restait) : s'il n'y a
  // rien à ajuster, il n'y a rien à décider non plus, la jauge seule (déjà en zone) suffit. Dès que
  // l'utilisateur drague (selectedPct!==0), les CTA réapparaissent normalement, in-zone ou non.
  const nothingToDecide = selectedPct === 0 && inZone;

  function selectChip(v: number) {
    setSelectedPct(v);
    onPreviewChange?.(v);
  }

  async function maintenir() {
    // `cursorDir` plutôt que `dir` (absent en mode libre, voir plus haut) — sans effet visible pour
    // "Maintenir" (pct=null, aucun texte/couleur n'en dépend en mode "decided"), mais reste correct
    // dans les deux cas plutôt que de forcer une valeur arbitraire.
    setAutoregDecision(sessionId, cursorDir, null);
    setMode("decided");
    setDecidedPct(null);
    onMaintenir?.();
  }

  async function apply() {
    if (!onApply) return;
    // Hors zone, AVEC une vraie suggestion système : un clic sur le CTA-verbe fait à la fois sauter
    // le curseur ET applique — fidèle au POC, pas une étape de confirmation séparée. Cible le RPE le
    // plus CONSERVATEUR (targetInt, jamais l'autre extrémité de la zone) — 2026-09-25, retour de
    // Gildas : "appliquer l'ajustement vise le RPE le plus conservateur (dans l'exemple 6-7 : 6)" —
    // jamais la reco% brute (qui pouvait tomber sur une valeur fractionnaire inatteignable en
    // draguant). Hors zone, EN MODE LIBRE (pas de suggestion) : applique directement où l'utilisateur
    // a dragué, ne JAMAIS sauter ailleurs (le geste EST la décision). Dans la zone (les deux cas) :
    // applique la valeur déjà réglée.
    const conservativePct = pctFromDiff(plannedDifficulty, targetInt);
    const pctToApply = inZone || !hasSuggestion ? selectedPct : conservativePct;
    if (!inZone && hasSuggestion) {
      setSelectedPct(conservativePct);
      onPreviewChange?.(conservativePct);
    }
    setApplying(true);
    const original = await onApply(pctToApply);
    setApplying(false);
    // isActive === false : le compte n'est pas actif, onApply n'a fait que déclencher le
    // paywall/signup (rien d'écrit) — ne jamais marquer "traité" dans ce cas (voir commentaire du
    // prop isActive plus haut). Les chips restent ouvertes, prêtes à réessayer après connexion.
    if (isActive === false) return;
    setAutoregDecision(sessionId, cursorDir, pctToApply, original ?? undefined);
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
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 12, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, color: light ? tint : "#fff", marginBottom: detail ? 5 : 0 }}>
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
          <div style={{ marginBottom: nothingToDecide ? 0 : 12 }}>
            <DecisionGauge
              dir={dir ?? cursorDir}
              light={light}
              zoneLow={zoneLow}
              zoneHigh={zoneHigh}
              value={diffFromPct(plannedDifficulty, selectedPct)}
              onChange={newDiff => selectChip(pctFromDiff(plannedDifficulty, newDiff))}
            />
          </div>
          {/* Aucun bouton si rien à décider (2026-09-25, voir nothingToDecide plus haut) — la jauge
             seule, déjà en zone, suffit ; pas de "Maintenir" pour confirmer un non-événement. */}
          {!nothingToDecide && (
            <div style={{ display: "flex", gap: 7 }}>
              <button
                onClick={maintenir}
                style={light
                  ? { flex: 1, border: "1px solid rgba(0,0,0,.14)", background: "rgba(255,255,255,.6)", color: tint, borderRadius: 10, padding: 9, fontSize: 12, fontWeight: 900, cursor: "pointer" }
                  : { flex: 1, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.12)", color: "#fff", borderRadius: 10, padding: 9, fontSize: 12, fontWeight: 900, cursor: "pointer" }}
              >
                → Maintenir
              </button>
              <button onClick={apply} disabled={applying} style={{ flex: 2, background: severityColor ?? "#E8571A", color: "#fff", border: "none", borderRadius: 10, padding: 9, fontSize: 12, fontWeight: 900, cursor: applying ? "default" : "pointer", opacity: applying ? 0.7 : 1 }}>
                {applying ? "..." : inZone ? "Appliquer →" : autoregCtaLabel(cursorDir)}
              </button>
            </div>
          )}
        </div>
      )}

      {mode === "decided" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: light ? "rgba(0,0,0,.04)" : "rgba(255,255,255,.08)", border: `1px solid ${light ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.12)"}`, borderRadius: 10, padding: "8px 11px" }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#2a8045", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, flexShrink: 0 }}>✓</div>
          <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: light ? "rgba(0,0,0,.75)" : "rgba(255,255,255,.9)", minWidth: 0 }}>
            {decidedPct !== null ? `${formatAutoregPoints(decidedPct)} appliqué · ${sessionLabel}` : `Maintenu · ${sessionLabel}`}
          </div>
          <button onClick={undo} disabled={undoing} style={{ background: "none", border: "none", color: light ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.5)", fontSize: 11, fontWeight: 700, cursor: undoing ? "default" : "pointer", opacity: undoing ? 0.6 : 1, flexShrink: 0 }}>
            {undoing ? "..." : "Annuler"}
          </button>
        </div>
      )}
    </div>
  );
}
