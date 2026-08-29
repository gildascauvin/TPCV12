"use client";

import type { DayAlert } from "@/lib/alerts";

/* Encart alerte "jour prioritaire" — sombre avec halo + pastille pulsants, extrait de DayColumn.tsx
   pour être réutilisé à l'identique dans les vues qui n'utilisent pas DayColumn (CoachPlanningClient.tsx). */

/* Contexte-adaptatif, pas de palette universelle (cohérence sémantique — même mapping teinte→
   sévérité — plutôt que cohérence pixel-à-pixel entre un fond blanc et un fond déjà sombre).
   - "light" (utilisée sur Planning, carte "Aujourd'hui" blanche, aperçu programme onboarding) :
     palette pastel + pulsation de BORDURE nette (jamais de halo diffus flou — se lit mal sur
     blanc, contrairement au fond sombre). Variant par défaut.
   - "darkColor" (utilisée sur Coach Control, /today, cartes déjà sombres) : sombre teinté par
     sévérité réelle (🚨 rouge / ⚠️ orange / 🚀 vert — voir suggestionSeverityColor() dans
     autoregulation.ts, seule source de cette palette), halo diffus (prop `pulse`, voir plus bas). */
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

/* Titre court en gras ("⚠️ Alléger recommandé") sur sa propre ligne, détail (autoregAdvice) en
   dessous. `alert.text` encode les 2 lignes séparées par "\n" ; un texte sans "\n" (repli loadRule,
   pas de suggestion) reste affiché tel quel, une seule ligne.
   Taille de police PAR variante, jamais une seule taille pour les deux :
   - "light" (Planning, carte blanche) : titre 12/900 aligné sur rule.title, détail 11 aligné sur
     rule.text (DayColumn.tsx) — déjà la convention réelle des boîtes de cette carte.
   - "darkColor"/"dark" (Coach Control, /today) : 13 pour les 2 lignes — la taille déjà utilisée
     pour ce texte avant le passage en 2 lignes (AutoregButtons.advice / AlertBox par défaut). */
function AlertText({ text, size }: { text: string; size?: number }) {
  const idx = text.indexOf("\n");
  if (idx === -1) return <>{text}</>;
  const headline = text.slice(0, idx);
  const detail = text.slice(idx + 1);
  const headlineSize = size ?? 12;
  const detailSize = size ?? 11;
  return (
    <>
      <div style={{ fontSize: headlineSize, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: detail ? 5 : 0 }}>{headline}</div>
      {detail && <div style={{ fontSize: detailSize, fontWeight: size ? 600 : 500, lineHeight: 1.45 }}>{detail}</div>}
    </>
  );
}

export default function AlertBox({ alert, actions, variant = "light", pulse = true }: { alert: DayAlert; actions?: React.ReactNode; variant?: "dark" | "light" | "darkColor";
  /* pulse=false : encart statique, sans halo/pastille propres — pour un contexte où le pulse vit déjà
     sur le contour de la carte hôte (ex. /today, wellness card) : "un seul signal de mouvement par
     carte", même règle que CoachAthleteCard.tsx (l'encart interne n'a jamais sa propre animation). */
  pulse?: boolean }) {
  if (variant === "light") {
    const { bg, border, text } = lightColors(alert.glow);
    return (
      <div style={{
        position: "relative", overflow: "hidden", margin: "0 0 12px", padding: "11px 13px", borderRadius: 16,
        background: bg, border: `1.5px solid ${border}`,
        fontSize: 11, lineHeight: 1.45, color: text, fontWeight: 600,
        animation: "perf-border-pulse-light 1.8s ease-in-out infinite",
      }}>
        <style>{`
          @keyframes perf-border-pulse-light {
            0%, 100% { border-color: ${border}; }
            50% { border-color: ${alert.glow}; }
          }
          @keyframes perf-pulse-light-dot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.45; transform: scale(1.35); }
          }
        `}</style>
        <div style={{
          position: "absolute", top: 11, right: 11,
          width: 7, height: 7, borderRadius: "50%", background: alert.glow,
          animation: "perf-pulse-light-dot 1.8s ease-in-out infinite",
        }} />
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
        animation: pulse ? "perf-border-pulse-color 1.8s ease-in-out infinite" : undefined,
      }}>
        {pulse && (
          <style>{`
            @keyframes perf-pulse-color {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.55; transform: scale(1.35); }
            }
            @keyframes perf-border-pulse-color {
              0%, 100% { border-color: ${border}; box-shadow: 0 10px 24px rgba(0,0,0,.28); }
              50% { border-color: ${alert.glow}; box-shadow: 0 0 16px 3px ${alert.glow}, 0 10px 24px rgba(0,0,0,.28); }
            }
          `}</style>
        )}
        {pulse && (
          <div style={{
            position: "absolute", top: 12, right: 12,
            width: 8, height: 8, borderRadius: "50%", background: alert.glow,
            animation: "perf-pulse-color 1.8s ease-in-out infinite",
          }} />
        )}
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
      animation: "perf-border-pulse 1.8s ease-in-out infinite",
    }}>
      <style>{`
        @keyframes perf-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.35); }
        }
        @keyframes perf-border-pulse {
          0%, 100% { border-color: ${alert.border}; box-shadow: 0 10px 24px rgba(0,0,0,.18); }
          50% { border-color: ${alert.glow}; box-shadow: 0 0 16px 3px ${alert.glow}, 0 10px 24px rgba(0,0,0,.18); }
        }
      `}</style>
      <div style={{
        position: "absolute", top: 12, right: 12,
        width: 8, height: 8, borderRadius: "50%", background: alert.glow,
        animation: "perf-pulse 1.8s ease-in-out infinite",
      }} />
      <div style={{ paddingRight: 16 }}>{alert.text}</div>
      {actions && <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>{actions}</div>}
    </div>
  );
}
