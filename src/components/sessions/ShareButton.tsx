"use client";

import { useRef, useState } from "react";
import { createShare, type ShareResourceType } from "@/lib/share";

/* Icône de partage générique, réutilisée sur tous les types partageables (Wellness, Séance, Charge,
   Récupération, Coach Control).

   2026-08-16, dernière révision — retour explicite de Gildas après avoir testé le menu personnalisé
   à 3 options sur son téléphone : "les 3 options servent à rien, il faut juste que le clic sur le
   picto déclenche les options de partage" (comparé à la vraie share sheet iOS, avec tous ses
   contacts WhatsApp/Messages/Mail/AirDrop). Un menu maison qui ne fait que réimplémenter un
   sous-ensemble de ce que l'OS propose déjà nativement n'a aucune valeur ajoutée sur un appareil qui
   supporte `navigator.share()`. Nouveau comportement :
   - **Si `navigator.share` existe** (quasi tous les navigateurs mobiles) : le clic déclenche
     directement la vraie share sheet OS, sans aucun menu intermédiaire. L'image est jointe si le
     navigateur sait partager des fichiers (`navigator.canShare({files})`, Safari/Chrome mobile) ;
     sinon le partage se fait juste avec titre/texte/lien — toujours mieux que notre mini-menu, la
     share sheet OS reste plus riche (AirDrop, Mail, Messages, Copier...) dans tous les cas.
   - **Sinon (desktop, aucun `navigator.share`)** : repli sur le petit menu Copier le lien/WhatsApp,
     seule situation où il a encore une utilité (rien d'équivalent nativement sur desktop).

   Lien toujours transmis (retour explicite : "on a dit image + lien à la base") — passé dans le
   vrai champ `url` de ShareData (pas seulement concaténé dans `text`), l'usage le plus correct de
   l'API. Si une app cible spécifique (WhatsApp iOS notamment) n'affiche pas la légende/le lien à
   côté d'une image jointe, c'est une limite de l'extension de partage de cette app, hors de notre
   contrôle — pas quelque chose qu'on peut forcer depuis le web.

   Le lien est créé (createShare) et mis en cache dès le premier clic (jamais recréé au clic
   suivant) — même principe qu'avant, pour ne pas dupliquer les lignes `shares` en base à chaque
   réouverture. */
interface ShareButtonProps {
  resourceType: ShareResourceType;
  buildSnapshot: () => Record<string, unknown>;
  title: string;
  text?: string;
  variant?: "light" | "dark";
  size?: number;
}

function shareApiAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.share;
}

function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    const dummy = new File([""], "test.png", { type: "image/png" });
    return navigator.canShare({ files: [dummy] });
  } catch {
    return false;
  }
}

function ShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

export default function ShareButton({ resourceType, buildSnapshot, title, text, variant = "light", size = 28 }: ShareButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [sharing, setSharing] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  async function resolveUrl(): Promise<string> {
    if (url) return url;
    const resolved = await createShare(resourceType, buildSnapshot());
    setUrl(resolved);
    return resolved;
  }

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();

    if (!shareApiAvailable()) {
      // Desktop, pas de share sheet OS — seul cas où le menu maison (Copier le lien/WhatsApp)
      // apporte encore quelque chose.
      setMenuOpen(true);
      if (url || resolveError) return;
      try {
        await resolveUrl();
      } catch {
        setResolveError(true);
      }
      return;
    }

    setSharing(true);
    try {
      const resolvedUrl = await resolveUrl();
      let file: File | undefined;
      if (canShareFiles()) {
        try {
          const res = await fetch(`${resolvedUrl}/opengraph-image`);
          if (res.ok) {
            const blob = await res.blob();
            const candidate = new File([blob], "theperfclub.png", { type: "image/png" });
            if (navigator.canShare({ files: [candidate] })) file = candidate;
          }
        } catch {
          // pas d'image jointe si le fetch échoue — le partage titre/texte/lien reste tenté
        }
      }
      await navigator.share({
        title,
        text: [title, text].filter(Boolean).join(" · "),
        url: resolvedUrl,
        ...(file ? { files: [file] } : {}),
      });
    } catch {
      // AbortError (annulation utilisateur) ou refus plateforme — rien à afficher
    } finally {
      setSharing(false);
    }
  }

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
    setTimeout(() => setCopyStatus("idle"), 1800);
    setMenuOpen(false);
  }

  const dark = variant === "dark";
  const label = copyStatus === "copied" ? "✓" : copyStatus === "error" ? "!" : null;
  const rect = btnRef.current?.getBoundingClientRect();
  const waHref = url ? `https://wa.me/?text=${encodeURIComponent([title, text].filter(Boolean).join(" · ") + " " + url)}` : undefined;
  const rowStyle: React.CSSProperties = { width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "10px 13px", border: "none", background: "#fff", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 700, color: "#171b1f", textDecoration: "none" };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleClick}
        disabled={sharing}
        aria-label="Partager"
        title="Partager"
        style={{
          width: size, height: size, borderRadius: Math.round(size * 0.32), flexShrink: 0, border: "none", cursor: sharing ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", opacity: sharing ? 0.5 : 1,
          background: dark ? "rgba(255,255,255,.1)" : "rgba(212,64,0,.09)",
          color: dark ? "rgba(255,255,255,.85)" : "#d44000",
          fontSize: 12, fontWeight: 900,
        }}
      >
        {label ?? <ShareIcon />}
      </button>

      {menuOpen && rect && (
        <>
          <div onClick={e => { e.stopPropagation(); setMenuOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 2147483150 }} />
          <div style={{
            position: "fixed", top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right),
            width: 190, background: "#fff", border: "1px solid #e8e8e8", borderRadius: 12,
            boxShadow: "0 10px 32px rgba(0,0,0,.18)", zIndex: 2147483200, overflow: "hidden",
          }}>
            {resolveError ? (
              <div style={{ padding: "12px 13px", fontSize: 12, color: "#c81e1e", fontWeight: 600 }}>Échec de la création du lien.</div>
            ) : !url ? (
              <div style={{ padding: "12px 13px", fontSize: 12, color: "#8a8f94", fontWeight: 600 }}>Création du lien…</div>
            ) : (
              <>
                <button onClick={handleCopy} style={rowStyle}>📋 Copier le lien</button>
                <a
                  href={waHref} target="_blank" rel="noopener noreferrer"
                  onClick={e => { e.stopPropagation(); setMenuOpen(false); }}
                  style={{ ...rowStyle, borderTop: "1px solid #f0f0f0" }}
                >
                  💬 WhatsApp
                </a>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
