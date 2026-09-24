"use client";

import type { DayAlert } from "@/lib/alerts";
import PulseDot from "@/components/calendar/PulseDot";

/* Encart alerte "jour prioritaire" — extrait de DayColumn.tsx pour être réutilisé à l'identique
   dans les vues qui n'utilisent pas DayColumn (CoachPlanningClient.tsx).
   Statique (2026-09, retour de Gildas — les halos pulsants étaient "trop puissants autour des
   cards") : plus aucune animation de bordure/glow — c'était auparavant contrôlé par un prop
   `pulse`, retiré. Seul PulseDot reste comme signal de mouvement, posé ICI (sur l'AlertBox
   elle-même, jamais sur le contour de la grosse carte hôte) et INCONDITIONNEL (toujours affiché,
   la carte décision étant toujours visible et n'ayant plus d'état "calme" fréquent en pratique). */

/* Contexte-adaptatif, pas de palette universelle (cohérence sémantique — même mapping teinte→
   sévérité — plutôt que cohérence pixel-à-pixel entre un fond blanc et un fond déjà sombre).
   - "light" (utilisée sur Planning, carte "Aujourd'hui" blanche, aperçu programme onboarding) :
     palette pastel. Variant par défaut.
   - "darkColor" (utilisée sur Coach Control, /today, cartes déjà sombres) : sombre teinté par
     sévérité réelle (🚨 rouge / ⚠️ orange / 🚀 vert — voir suggestionSeverityColor() dans
     autoregulation.ts, seule source de cette palette). */
const LIGHT_PALETTE: Record<string, { bg: string; border: string; text: string }> = {
  "#d44000": { bg: "#fff3ef", border: "rgba(212,64,0,.14)", text: "#8a2d00" }, // alléger / récupération basse
  "#dc2626": { bg: "#fef2f2", border: "rgba(220,38,38,.16)", text: "#b91c1c" }, // 🚨 alléger sévère (suggestionSeverityColor)
  "#2f9e44": { bg: "#eafaf0", border: "rgba(22,101,52,.14)", text: "#166534" }, // surcharge / fenêtre de performance
  "#f28a00": { bg: "#fff3df", border: "rgba(138,90,0,.14)", text: "#8a5a00" }, // récupération basse (palier modéré)
};
function lightColors(glow: string) {
  return LIGHT_PALETTE[glow] ?? { bg: "#f5f5f5", border: "rgba(0,0,0,.06)", text: "#555b60" };
}

const DARK_COLOR_PALETTE: Record<string, { bg: string; border: string }> = {
  "#dc2626": { bg: "linear-gradient(145deg,#3d0f0c,#521410)", border: "rgba(220,38,38,.5)" }, // 🚨 critique
  "#f28a00": { bg: "linear-gradient(145deg,#2e1608,#42200c)", border: "rgba(242,138,0,.5)" }, // ⚠️ modéré
  "#d44000": { bg: "linear-gradient(145deg,#33140a,#4a1c0c)", border: "rgba(212,64,0,.5)" }, // alléger générique (alerts.ts, hors autoregulation.ts)
  "#2f9e44": { bg: "linear-gradient(145deg,#0f2417,#163a22)", border: "rgba(47,158,68,.5)" }, // 🚀 surcharge
};
function darkColors(glow: string) {
  return DARK_COLOR_PALETTE[glow] ?? { bg: "linear-gradient(145deg,#1a1a1a,#282828)", border: "rgba(255,255,255,.2)" };
}

/* Titre en gras sur sa propre ligne — verbe si une suggestion réellement actionnable existe
   ("Alléger recommandé", voir decisionCard.ts/autoregHeadline(), 2026-09 2e itération), "Plan
   cohérent" sinon (jamais un verbe pour un état non-actionnable — c'est ce cas précis, pas
   "titre=verbe en général", qui posait problème à l'origine : "Récupérer" pour une tendance
   positive sonnait comme une consigne). Détail(s) en dessous, `alert.text` encode les lignes
   séparées par "\n" ; un texte sans "\n" (repli loadRule, pas de suggestion) reste affiché tel
   quel, une seule ligne.
   Les lignes de détail partagent la MÊME couleur/opacité (2026-09) : plus de distinction i>0,
   comportement identique quel que soit le nombre de lignes.
   Taille de police PAR variante, jamais une seule taille pour les deux, titres agrandis (2026-09) :
   - "light" (Planning, carte blanche) : titre 14/900, détail 11.
   - "darkColor"/"dark" (Coach Control, /today) : titre 15, détail 13 (taille déjà utilisée avant
     l'agrandissement du titre). */
function AlertText({ text, size }: { text: string; size?: number }) {
  const lines = text.split("\n");
  const headline = lines[0];
  const rest = lines.slice(1);
  const headlineSize = size ? size + 2 : 14;
  const detailSize = size ?? 11;
  return (
    <>
      <div style={{ fontSize: headlineSize, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: rest.length ? 5 : 0 }}>{headline}</div>
      {rest.map((line, i) => (
        <div key={i} style={{ fontSize: detailSize, fontWeight: size ? 600 : 500, lineHeight: 1.45, marginTop: i > 0 ? 3 : 0 }}>{line}</div>
      ))}
    </>
  );
}

export default function AlertBox({ alert, actions, variant = "light" }: { alert: DayAlert; actions?: React.ReactNode; variant?: "dark" | "light" | "darkColor" }) {
  if (variant === "light") {
    const { bg, border, text } = lightColors(alert.glow);
    return (
      <div style={{
        position: "relative", overflow: "hidden", margin: "0 0 12px", padding: "11px 13px", borderRadius: 16,
        background: bg, border: `1.5px solid ${border}`,
        fontSize: 11, lineHeight: 1.45, color: text, fontWeight: 600,
      }}>
        <PulseDot color={alert.glow} top={11} right={11} size={7} />
        <div style={{ paddingRight: 14 }}><AlertText text={alert.text} /></div>
        {actions && <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>{actions}</div>}
      </div>
    );
  }

  if (variant === "darkColor") {
    const { bg, border } = darkColors(alert.glow);
    return (
      <div style={{
        position: "relative", overflow: "hidden", margin: "0 0 12px", padding: "12px 16px", borderRadius: 18,
        background: bg, border: `1.5px solid ${border}`,
        fontSize: 13, lineHeight: 1.4, color: "#fff", fontWeight: 600,
        boxShadow: "0 10px 24px rgba(0,0,0,.28)",
      }}>
        <PulseDot color={alert.glow} />
        <div style={{ paddingRight: 16 }}><AlertText text={alert.text} size={13} /></div>
        {actions && <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>{actions}</div>}
      </div>
    );
  }

  return (
    <div style={{
      position: "relative", overflow: "hidden", margin: "0 0 12px", padding: "12px 16px", borderRadius: 18,
      background: "linear-gradient(145deg,#1a1a1a,#282828)", border: `1.5px solid ${alert.border}`,
      fontSize: 13, lineHeight: 1.4, color: "#fff", fontWeight: 600,
      boxShadow: "0 10px 24px rgba(0,0,0,.18)",
    }}>
      <PulseDot color={alert.glow} />
      <div style={{ paddingRight: 16 }}>{alert.text}</div>
      {actions && <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>{actions}</div>}
    </div>
  );
}
