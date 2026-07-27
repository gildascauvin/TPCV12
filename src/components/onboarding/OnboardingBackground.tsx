"use client";

import { useBreakpoint } from "@/hooks/useBreakpoint";

/* Fond plein-page de l'onboarding — pas de carte flottante, pas de faux aperçu d'app flouté.
   dark = steps value/concept/célébration, light = steps de questions/formulaire.
   maxWidth responsive (2026-07-27) : la colonne restait figée à 560px quel que soit le
   viewport, laissant beaucoup d'espace vide de chaque côté sur desktop/tablette sans jamais
   "utiliser" cette largeur — pas de logique responsive du tout dans ce fichier avant ce
   chantier. Élargie progressivement au lieu de zoomer uniformément tout le funnel (le mobile,
   où sont la plupart des vrais utilisateurs, est déjà bien calibré et n'a pas besoin d'y toucher). */
export default function OnboardingBackground({ variant, children }: { variant: "dark" | "light"; children: React.ReactNode }) {
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
      <div style={{ minHeight: "100%", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth, padding: "36px 20px 120px", transition: "max-width .2s ease" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
