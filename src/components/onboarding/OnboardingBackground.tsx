"use client";

import { useBreakpoint } from "@/hooks/useBreakpoint";

/* Fond plein-page de l'onboarding — pas de carte flottante, pas de faux aperçu d'app flouté.
   dark = steps value/concept/célébration, light = steps de questions/formulaire.
   maxWidth responsive (2026-07-27) : la colonne restait figée à 560px quel que soit le
   viewport, laissant beaucoup d'espace vide de chaque côté sur desktop/tablette sans jamais
   "utiliser" cette largeur — pas de logique responsive du tout dans ce fichier avant ce
   chantier. Élargie progressivement au lieu de zoomer uniformément tout le funnel (le mobile,
   où sont la plupart des vrais utilisateurs, est déjà bien calibré et n'a pas besoin d'y toucher). */
/* `center` (2026-08-19) : mode dédié aux écrans de transition purement cosmétiques
   (GenerationLoadingScreen, ReconductionTeaserScreen) — contenu court, centré verticalement dans
   le viewport plutôt que plaqué en haut avec le padding 36/120 habituel (pensé pour du contenu
   scrollable). N'affecte aucun autre écran (prop optionnelle, défaut inchangé). */
export default function OnboardingBackground({ variant, center, children }: { variant: "dark" | "light"; center?: boolean; children: React.ReactNode }) {
  const { isMd, isLg } = useBreakpoint();
  const maxWidth = isLg ? 720 : isMd ? 640 : 560;
  return (
    <div style={{
      position: "fixed", inset: 0, overflowY: "auto",
      background: variant === "dark"
        ? "linear-gradient(135deg,#161616 0%,#303030 54%,#111 100%)"
        : "#f1f0ee",
      transition: "background .25s ease",
    }}>
      <div style={{ minHeight: "100%", display: "flex", justifyContent: "center", alignItems: center ? "center" : undefined }}>
        <div style={{ width: "100%", maxWidth, padding: center ? "20px" : "36px 20px 120px", transition: "max-width .2s ease" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
