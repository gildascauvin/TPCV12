import { ImageResponse } from "next/og";
import { getShare } from "./shareMeta";

/* Image OG dynamique par partage — sans ça, WhatsApp n'affiche souvent AUCUNE carte de preview (pas
   juste une carte sans image, littéralement rien à part le lien brut) : constaté en réel par Gildas,
   pas une hypothèse. Convention de fichier Next.js (`opengraph-image.tsx` dans le même dossier que
   `page.tsx`) — génère automatiquement les balises og:image/twitter:image, pas besoin de les ajouter
   à la main dans generateMetadata(). Contenu volontairement simple (texte + accent, pas une
   reproduction pixel-perfect des vrais charts/rings) — un résumé lisible en miniature dans un fil de
   discussion, pas un second rendu de l'app. */

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#d44000";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getShare(id);

  let eyebrow = "PARTAGE";
  let title = "ThePerfClub";
  let description = "";
  let dark = true;

  if (row) {
    const s = row.snapshot as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (row.resource_type) {
      case "wellness":
        eyebrow = "SCORE & CONSEILS";
        title = `${s.authorName} · ${s.zoneLabel}`;
        description = s.recoveryAdvice ?? "";
        break;
      case "session":
        dark = false;
        eyebrow = s.done ? "SÉANCE TERMINÉE" : "SÉANCE PRÉVUE";
        title = s.name;
        description = Array.isArray(s.exercises) && s.exercises.length ? `${s.exercises.length} exercice${s.exercises.length > 1 ? "s" : ""}` : "";
        break;
      case "charge":
        eyebrow = "⚡ CHARGE D'ENTRAÎNEMENT";
        title = "Ma charge des 7 derniers jours";
        description = s.insight ?? "";
        break;
      case "recuperation":
        eyebrow = "🌿 RÉCUPÉRATION";
        title = "Ma récupération";
        description = s.insight ?? "";
        break;
      case "coach_athlete":
        eyebrow = "COACH CONTROL";
        title = s.athleteName;
        description = s.decision ?? "";
        break;
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", padding: 64,
          background: dark ? "linear-gradient(135deg,#1a1a1a,#282828)" : "#ffffff",
          color: dark ? "#ffffff" : "#171b1f",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(180deg,#f04a08,#d44000)", display: "flex" }} />
          <div style={{ fontSize: 28, fontWeight: 900, display: "flex" }}>ThePerfClub</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 2, color: ACCENT, display: "flex" }}>{eyebrow}</div>
          <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, display: "flex" }}>{title}</div>
          {description && (
            <div style={{ fontSize: 26, color: dark ? "rgba(255,255,255,.7)" : "#62686e", lineHeight: 1.4, maxWidth: 980, display: "flex" }}>
              {description.length > 140 ? description.slice(0, 140) + "…" : description}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
