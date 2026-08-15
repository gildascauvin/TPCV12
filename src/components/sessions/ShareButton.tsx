"use client";

import { useRef, useState } from "react";
import { createShare, type ShareResourceType } from "@/lib/share";

/* Icône de partage générique, réutilisée sur tous les types partageables (Wellness, Séance, Charge,
   Récupération, Coach Control) — même geste partout : clic → petit menu avec 2 options explicites
   (Copier le lien / WhatsApp), plutôt qu'un déclenchement automatique de la Web Share API — sur
   desktop (pas de navigator.share) ça ne montrait jamais rien de visible, juste une copie silencieuse.
   `buildSnapshot` n'est appelé qu'au clic sur une option (jamais en avance), pour toujours capturer
   l'état affiché à cet instant. Menu en position:fixed + coordonnées via getBoundingClientRect() —
   plusieurs cartes hôtes ont overflow:hidden (CoachCard...), un dropdown en position:absolute y
   serait tronqué (même pattern que ActionMenu dans ExerciseBlockEditor.tsx). */
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
  const [status, setStatus] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const btnRef = useRef<HTMLButtonElement | null>(null);

  async function resolveUrl(): Promise<string> {
    return createShare(resourceType, buildSnapshot());
  }

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpen(false);
    setStatus("loading");
    try {
      const url = await resolveUrl();
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("error");
    } finally {
      setTimeout(() => setStatus("idle"), 1800);
    }
  }

  async function handleWhatsapp(e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpen(false);
    setStatus("loading");
    try {
      const url = await resolveUrl();
      const message = [title, text].filter(Boolean).join(" · ") + " " + url;
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      setStatus("idle");
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 1800);
    }
  }

  const dark = variant === "dark";
  const label = status === "copied" ? "✓" : status === "error" ? "!" : status === "loading" ? "…" : null;
  const rect = btnRef.current?.getBoundingClientRect();

  return (
    <>
      <button
        ref={btnRef}
        onClick={e => { e.stopPropagation(); if (status === "loading") return; setMenuOpen(v => !v); }}
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
            <button
              onClick={handleCopy}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "10px 13px", border: "none", background: "#fff", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 700, color: "#171b1f" }}
            >
              📋 Copier le lien
            </button>
            <button
              onClick={handleWhatsapp}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "10px 13px", border: "none", borderTop: "1px solid #f0f0f0", background: "#fff", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 700, color: "#171b1f" }}
            >
              💬 WhatsApp
            </button>
          </div>
        </>
      )}
    </>
  );
}
