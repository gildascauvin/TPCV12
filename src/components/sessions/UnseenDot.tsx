import type { ExerciseAttachments } from "@/types";

/* Point de notification sur une ligne d'exercice (planning, aujourd'hui, Coach Control) — visible
   tant que le contenu (vidéo/photo/commentaire) le plus récent a été ajouté par l'autre rôle et
   n'a pas encore été vu (viewedAt = session.viewed_by_[role]_at, mis à jour à l'ouverture de la
   modale d'édition). Purement visuel, jamais un bouton — aucun conflit avec le clic de la carte. */
export function hasUnseenAttachment(
  attachments: ExerciseAttachments | null | undefined,
  viewerRole: "coach" | "athlete",
  viewedAt: string | null | undefined
): boolean {
  if (!attachments?.updatedAt || !attachments.updatedBy) return false;
  if (attachments.updatedBy === viewerRole) return false;
  if (!viewedAt) return true;
  return attachments.updatedAt > viewedAt;
}

export default function UnseenDot() {
  return (
    <span
      aria-hidden
      style={{
        position: "relative", display: "inline-flex", flexShrink: 0,
        marginLeft: 5, verticalAlign: "middle", color: "#d44000",
      }}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4H4l1.6-3.8a8.4 8.4 0 1 1 15.4-4.6z" />
      </svg>
      <span
        style={{
          position: "absolute", top: -2, right: -2,
          width: 7, height: 7, borderRadius: "50%",
          background: "#d44000", boxShadow: "0 0 0 2px #fff",
        }}
      />
    </span>
  );
}
