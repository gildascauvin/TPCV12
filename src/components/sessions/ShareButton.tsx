"use client";

import { useRef, useState } from "react";
import { createShare, type ShareResourceType } from "@/lib/share";

/* Icône de partage générique, réutilisée sur tous les types partageables (Wellness, Séance, Charge,
   Récupération, Coach Control) — même geste partout : clic → petit menu avec 2 options explicites
   (Copier le lien / WhatsApp), plutôt qu'un déclenchement automatique de la Web Share API — sur
   desktop (pas de navigator.share) ça ne montrait jamais rien de visible, juste une copie silencieuse.

   Le lien est créé (createShare) dès l'OUVERTURE du menu, pas au clic sur une option — bug mobile
   réel trouvé par Gildas : `await createShare()` PUIS `window.open(wa.me...)` casse la chaîne de
   geste utilisateur sur mobile (Safari/Chrome mobile bloquent silencieusement un window.open()
   déclenché après un await, contrairement à desktop, plus permissif). Même piège que celui déjà
   évité dans InviteModal.tsx (le lien y est connu de façon synchrone, jamais ce problème). Fix : le
   lien est résolu pendant que le menu est déjà ouvert, et "WhatsApp" devient un vrai `<a href>`
   (navigation native, jamais bloquée) une fois l'URL prête — plus de window.open() du tout ici. */
interface ShareButtonProps {
  resourceType: ShareResourceType;
  buildSnapshot: () => Record<string, unknown>;
  title: string;
  text?: string;
  variant?: "light" | "dark";
  size?: number;
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
  const btnRef = useRef<HTMLButtonElement | null>(null);

  async function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpen(true);
    if (url || resolveError) return; // déjà résolu (ou déjà échoué) — pas de recréation à chaque réouverture
    try {
      setUrl(await createShare(resourceType, buildSnapshot()));
    } catch {
      setResolveError(true);
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
        onClick={openMenu}
        aria-label="Partager"
        title="Partager"
        style={{
          width: size, height: size, borderRadius: Math.round(size * 0.32), flexShrink: 0, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
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
