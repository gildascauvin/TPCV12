"use client";

import { PRICING } from "./PaywallModal";

/* Bandeau sticky (2026-08-19, chantier gating save) — au-dessus de l'app (avant CalendarHeader
   dans chaque page cliente), en flux normal (jamais position:fixed) donc ne recouvre rien quand
   on est en haut de page, puis reste visible au scroll via position:sticky. Affiché en permanence
   pour un compte free/expired (jamais pour athlete/coach actifs).

   Réutilisée telle quelle par la sandbox (2026-08-19, visiteurs non connectés) — `onAction`
   pointe vers /register au lieu de setPaywallStep("priming"), et le prop optionnel `roleToggle`
   (absent partout ailleurs dans l'app) ajoute un petit sélecteur Sportif/Coach pour basculer
   entre les 2 URLs de la sandbox sans changer de structure.

   Wording unifie (2026-09-06, POC "Paywall Repense") - remplace l'ancien prop `message` libre
   (chaque page racontait sa propre variante : "rien n'est encore sauvegarde", "l'ajustement des
   seances n'est pas encore sauvegarde"...) par un seul texte partout : "Economiser" + badge
   d'economie annuelle reelle (meme formule que annualSavingsPct dans PricingPriming.tsx, jamais
   une valeur inventee). Decision explicite de Gildas : montrer le prix tot plutot que d'attendre
   la toute fin de l'onboarding, sans inventer d'offre ni de minuteur - c'est la reduction
   annuelle deja reelle, dite plus tot.

   Mode `fixed` (2026-09-06) - le wizard post-signup rend chaque etape dans son propre modal
   plein ecran (position:fixed inset:0, zIndex 2147483100 - ProgramCreatePicker/ProgramLibrary
   Browser/ProgramCriteriaModal/ProgramBuilderModal/WellnessModal/InviteModal/ProgramAssignModal),
   donc un simple `position:sticky` a l'interieur d'un de ces ecrans ne peut jamais couvrir toute
   la largeur de l'ecran sur desktop (drawer docke a droite a 50vw, ou colonne de gauche etroite
   pour le wizardHero) - voir tentative precedente, corrigee ici. `fixed` bascule la bannière en
   `position:fixed` pleine largeur AU-DESSUS de ces modals (zIndex 2147483200, meme convention que
   `DuplicateTemplateModal` deja dans le repo pour "au-dessus de tout le reste"). Chaque modal du
   wizard doit alors laisser `WIZARD_BANNER_H` px de marge en haut (`top` au lieu d'`inset:0`)
   quand `wizardHero` est fourni, pour ne pas passer sous la bannière. */
export const WIZARD_BANNER_H = 44;

interface Props {
  ctaLabel?: string;
  onAction: () => void;
  roleToggle?: { role: "athlete" | "coach"; onToggle: (role: "athlete" | "coach") => void };
  /** Role reel de la page (pas celui de roleToggle, qui ne reflete que le selecteur sandbox) -
      pilote le badge d'economie annuelle (28% sportif / 26% coach avec les prix actuels). */
  role: "athlete" | "coach";
  /** Wizard post-signup uniquement - voir doc ci-dessus. Absent = comportement inchange (sticky,
      dans le flux normal de la page). */
  fixed?: boolean;
}

export default function UnsavedBanner({
  ctaLabel = "Débloquer mon compte →",
  onAction,
  roleToggle,
  role,
  fixed = false,
}: Props) {
  const p = PRICING[role];
  const annualSavingsPct = Math.round(((p.monthly * 12 - p.annual) / (p.monthly * 12)) * 100);

  return (
    <div
      style={{
        position: fixed ? "fixed" : "sticky", top: 0, left: fixed ? 0 : undefined, right: fixed ? 0 : undefined,
        zIndex: fixed ? 2147483200 : 40,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        flexWrap: "wrap",
        background: "#171b1f",
        padding: "9px 16px",
        textAlign: "center",
      }}
    >
      {roleToggle && (
        <div style={{ display: "flex", flexShrink: 0, gap: 2, background: "rgba(255,255,255,.08)", borderRadius: 999, padding: 2 }}>
          {(["athlete", "coach"] as const).map(r => (
            <button
              key={r}
              onClick={() => roleToggle.onToggle(r)}
              style={{
                height: 22, padding: "0 10px", borderRadius: 999, border: "none", cursor: "pointer",
                fontSize: 10.5, fontWeight: 900, letterSpacing: "0.02em",
                background: roleToggle.role === r ? "#fff" : "transparent",
                color: roleToggle.role === r ? "#171b1f" : "rgba(255,255,255,.6)",
              }}
            >
              {r === "athlete" ? "Sportif" : "Coach"}
            </button>
          ))}
        </div>
      )}
      <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.88)", lineHeight: 1.4, whiteSpace: "nowrap" }}>
        🔓 Économiser
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 900, padding: "3px 8px", borderRadius: 999, background: "rgba(47,158,68,.18)", color: "#2f9e44", flexShrink: 0 }}>
        -{annualSavingsPct}%
      </span>
      <button
        onClick={onAction}
        style={{
          flexShrink: 0, height: 26, padding: "0 12px", borderRadius: 999, border: "none",
          background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff",
          fontSize: 11.5, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
