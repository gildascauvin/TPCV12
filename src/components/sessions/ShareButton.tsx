"use client";

import { useRef, useState } from "react";
import { createShare, type ShareResourceType } from "@/lib/share";

/* Icône de partage générique, réutilisée sur tous les types partageables (Wellness, Séance, Charge,
   Récupération, Coach Control).

   2026-08-16 — retour explicite de Gildas après avoir testé le menu personnalisé à 3 options sur
   son téléphone : "les 3 options servent à rien, il faut juste que le clic sur le picto déclenche
   les options de partage" (comparé à la vraie share sheet iOS, avec tous ses contacts
   WhatsApp/Messages/Mail/AirDrop). Un menu maison qui ne fait que réimplémenter un sous-ensemble de
   ce que l'OS propose déjà nativement n'a aucune valeur ajoutée sur un appareil qui supporte
   `navigator.share()` avec une share sheet riche.

   2026-09-13 — fix : la détection "desktop = pas de `navigator.share`" ne tenait déjà plus. Testé
   en réel par Gildas sur macOS (Safari/Chrome) : `navigator.share()` existe bien, mais la share
   sheet macOS qu'il ouvre ne liste ni WhatsApp ni "Copier" — contrairement à iOS, macOS n'a pas
   d'écosystème d'extensions de partage tiers aussi développé, et l'app web n'a aucun contrôle sur
   le contenu de cette popup une fois qu'elle délègue à l'OS (même limite déjà documentée plus bas
   pour l'image jointe sur WhatsApp iOS). Bascule donc sur l'OS réel (iOS/Android) plutôt que sur la
   seule présence de l'API pour décider qui a droit au partage natif :
   - **Mobile (iOS/Android)** : le clic déclenche directement la vraie share sheet OS, sans menu
     intermédiaire — image jointe si le navigateur sait partager des fichiers
     (`navigator.canShare({files})`), sinon titre/texte/lien seuls. Toujours plus riche que notre
     mini-menu sur ces OS (AirDrop, Mail, Messages, Copier... tous fiables).
   - **Desktop (macOS/Windows/Linux, y compris quand `navigator.share` existe techniquement)** :
     repli sur le petit menu Copier le lien/WhatsApp — seule façon de garantir ces deux destinations
     précises, qu'une share sheet OS desktop ne propose pas de façon fiable.

   Lien toujours transmis (retour explicite : "on a dit image + lien à la base") — passé dans le
   vrai champ `url` de ShareData (pas seulement concaténé dans `text`), l'usage le plus correct de
   l'API. Si une app cible spécifique (WhatsApp iOS notamment) n'affiche pas la légende/le lien à
   côté d'une image jointe, c'est une limite de l'extension de partage de cette app, hors de notre
   contrôle — pas quelque chose qu'on peut forcer depuis le web.

   Le lien est créé (createShare) et mis en cache dès le premier clic (jamais recréé au clic
   suivant) — même principe qu'avant, pour ne pas dupliquer les lignes `shares` en base à chaque
   réouverture. */
interface ShareButtonProps {
  /** Chemin normal (Wellness/Séance/Charge/Récupération/Coach Control) : passe par la table
      `shares` (snapshot figé au clic). Absent si `getShareUrl` est fourni à la place. */
  resourceType?: ShareResourceType;
  buildSnapshot?: () => Record<string, unknown>;
  /** 2026-09-13 — alternative pour partager une URL déjà connue (ex. /p/[id], programme d'un
      sportif) sans passer par la table `shares` : résout et retourne l'URL directement. Réutilise
      tout le reste du composant (détection mobile/desktop, menu Copier/WhatsApp, partage natif)
      sans dupliquer cette logique pour un 2e cas d'usage. */
  getShareUrl?: () => Promise<string>;
  title: string;
  text?: string;
  variant?: "light" | "dark";
  size?: number;
  /** 2026-09-13 — variante bouton pleine largeur libellé (encadré dark de PricingPriming.tsx,
      "Inviter mon coach →"), à la place du rond icône seule. Même logique de partage derrière,
      juste une autre présentation du déclencheur. */
  buttonLabel?: string;
  /** 2026-09-16 — variante lien texte inline (PricingPriming.tsx : "Gratuit avec un coach →
      Inviter mon coach", sur une seule ligne — retour explicite de Gildas, "plutôt qu'un bouton un
      lien"). Même logique de partage, juste du texte souligné au lieu d'un bouton plein. Prioritaire
      sur `buttonLabel` si les deux sont fournis (ne devrait pas arriver). */
  linkLabel?: string;
}

function shareApiAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.share;
}

/* iOS/Android uniquement — un desktop dont le navigateur expose `navigator.share()` (Safari/Chrome
   sur macOS notamment) reste routé vers le menu maison, sa share sheet OS n'étant pas assez riche
   (voir commentaire de tête). */
function isMobileOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod|android/i.test(navigator.userAgent);
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

export default function ShareButton({ resourceType, buildSnapshot, getShareUrl, title, text, variant = "light", size = 28, buttonLabel, linkLabel }: ShareButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [sharing, setSharing] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  async function resolveUrl(): Promise<string> {
    if (url) return url;
    const resolved = getShareUrl
      ? await getShareUrl()
      : await createShare(resourceType!, buildSnapshot!());
    setUrl(resolved);
    return resolved;
  }

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();

    if (!isMobileOS() || !shareApiAvailable()) {
      // Desktop (ou navigateur sans navigator.share) — seul cas où le menu maison
      // (Copier le lien/WhatsApp) garantit ces deux destinations précises.
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

  const labelDisplay = copyStatus === "copied" ? "✓ Copié !" : copyStatus === "error" ? "Erreur, réessaie" : (buttonLabel ?? linkLabel);

  return (
    <>
      {linkLabel ? (
        <button
          ref={btnRef}
          onClick={handleClick}
          disabled={sharing}
          style={{
            background: "none", border: "none", padding: 0, cursor: sharing ? "default" : "pointer",
            fontSize: 13, fontWeight: 800, textDecoration: "underline",
            color: dark ? "#ff8a55" : "#d44000", opacity: sharing ? 0.6 : 1,
          }}
        >
          {sharing ? "…" : labelDisplay}
        </button>
      ) : buttonLabel ? (
        <button
          ref={btnRef}
          onClick={handleClick}
          disabled={sharing}
          style={{
            width: "100%", height: 42, borderRadius: 12, border: "1px solid rgba(255,255,255,.22)",
            background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 13, fontWeight: 800,
            cursor: sharing ? "default" : "pointer", opacity: sharing ? 0.6 : 1,
          }}
        >
          {sharing ? "…" : labelDisplay}
        </button>
      ) : (
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
      )}

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
