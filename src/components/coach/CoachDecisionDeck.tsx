"use client";

import { useEffect, useRef, useState } from "react";
import { DARK_CARD_BG } from "@/lib/theme";

/* Revue du jour en swipe (2026-10-05, POC https://claude.ai/artifact/LJKJb4nx5xuvPSFGUcCcP8).
   Plein écran, une vraie carte Coach Control à la fois (rendue par le parent via renderCard).
   Glisser à droite = la reco de la carte (Alléger/Surcharger), à gauche = Maintenir : le geste
   envoie `actionRequest` à la carte, dont la jauge exécute EXACTEMENT ses propres boutons. La
   carte part dès que la décision est enregistrée (isDecided). Une carte sans geste possible
   (pas de reco chiffrée, ou décision verrouillée en gratuit) se lit et se traite normalement,
   avec "Suivant". La file est figée à l'ouverture : une carte décidée quitte "À décider" côté
   page, pas la file en cours. */

export type DeckAction = { kind: "apply" | "maintain"; nonce: number };
export type DeckItem = { id: string; name: string; verb: string | null; color: string };

export default function CoachDecisionDeck({ items, startId, title, isDecided, renderCard, onClose }: {
  items: DeckItem[];
  startId?: string | null;
  title: string;
  isDecided: (id: string) => boolean;
  renderCard: (id: string, action: DeckAction | null) => React.ReactNode;
  onClose: () => void;
}) {
  const [queue, setQueue] = useState<DeckItem[]>(() => {
    const i = startId ? items.findIndex(x => x.id === startId) : -1;
    return i > 0 ? [items[i], ...items.slice(0, i), ...items.slice(i + 1)] : items;
  });
  const total = useRef(items.length);
  const [done, setDone] = useState<DeckItem[]>([]);
  const [action, setAction] = useState<DeckAction | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<-1 | 1 | 0>(0);
  const start = useRef<{ x: number; y: number; locked: boolean } | null>(null);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const top = queue[0] ?? null;
  // Déjà décidé à l'ouverture (carte ouverte depuis "Décidé aujourd'hui") : on ne la fait pas partir.
  const initiallyDecided = useRef(new Set(items.filter(x => isDecided(x.id)).map(x => x.id)));
  const topDecided = top ? isDecided(top.id) && !initiallyDecided.current.has(top.id) : false;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // La décision est enregistrée (bouton de la carte OU geste) : la carte part, puis la suivante.
  useEffect(() => {
    if (!top || !topDecided || leaving) return;
    if (waitTimer.current) clearTimeout(waitTimer.current);
    const dir: 1 | -1 = action?.kind === "maintain" ? -1 : 1;
    const t1 = setTimeout(() => setLeaving(dir), 650);
    const t2 = setTimeout(() => {
      setDone(d => [...d, top]);
      setQueue(q => q.slice(1));
      setLeaving(0); setDx(0); setAction(null);
    }, 950);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topDecided, top?.id]);

  function act(kind: "apply" | "maintain") {
    if (!top || !top.verb || topDecided) return;
    setAction({ kind, nonce: Date.now() });
    // Rien d'enregistré (paywall ouvert, erreur réseau) : la carte revient au centre.
    if (waitTimer.current) clearTimeout(waitTimer.current);
    waitTimer.current = setTimeout(() => setDx(0), 2500);
  }
  function later() {
    if (queue.length < 2) return;
    setQueue(q => [...q.slice(1), q[0]]);
    setDx(0); setAction(null);
  }
  function next() {
    if (!top) return;
    setDone(d => [...d, top]);
    setQueue(q => q.slice(1));
    setDx(0); setAction(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (!top?.verb || topDecided) return;
      if (e.key === "ArrowRight") act("apply");
      if (e.key === "ArrowLeft") act("maintain");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const canSwipe = !!top?.verb && !topDecided;
  function onPointerDown(e: React.PointerEvent) {
    if (!canSwipe || (e.target as HTMLElement).closest("button, input, textarea, svg")) return;
    start.current = { x: e.clientX, y: e.clientY, locked: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = start.current; if (!s) return;
    const ddx = e.clientX - s.x;
    if (!s.locked) {
      if (Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(e.clientY - s.y)) {
        s.locked = true; setDragging(true);
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
      } else return;
    }
    setDx(ddx);
  }
  function onPointerUp() {
    const s = start.current; start.current = null;
    if (!s?.locked) return;
    setDragging(false);
    if (dx > 100) { setDx(140); act("apply"); }
    else if (dx < -100) { setDx(-140); act("maintain"); }
    else setDx(0);
  }

  const shown = done.length + queue.length;
  const transform = leaving ? `translateX(${leaving * 130}%) rotate(${leaving * 14}deg)` : `translateX(${dx}px) rotate(${dx / 22}deg)`;
  const stampOpacity = (sign: 1 | -1) => Math.max(0, Math.min(1, (sign * dx) / 90));

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483100, background: DARK_CARD_BG, display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top,0px) + 14px) 16px calc(env(safe-area-inset-bottom,0px) + 16px)" }}>
      <div style={{ maxWidth: 460, width: "100%", margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "#fff", flex: 1, letterSpacing: "-0.02em" }}>{title}</span>
        {top && total.current > 1 && <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 12, color: "rgba(255,255,255,.55)" }}>{done.length + 1} / {shown}</span>}
        <button type="button" onClick={onClose} aria-label="Fermer" style={{ width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>
      {total.current > 1 && (
        <div style={{ maxWidth: 460, width: "100%", margin: "10px auto 0", display: "flex", gap: 4 }}>
          {Array.from({ length: shown }, (_, i) => (
            <i key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < done.length ? "#3ddc84" : i === done.length ? "#fff" : "rgba(255,255,255,.15)", transition: "background .3s" }} />
          ))}
        </div>
      )}

      {top ? (
        <>
          <div style={{ flex: 1, minHeight: 0, maxWidth: 460, width: "100%", margin: "14px auto 0", position: "relative" }}>
            {queue[1] && (
              <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 14, transform: "scale(.955)", opacity: 0.45, pointerEvents: "none", height: 40, borderRadius: 24, background: "rgba(255,255,255,.08)" }} />
            )}
            <div
              key={top.id}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
              style={{ position: "absolute", inset: 0, overflowY: "auto", overscrollBehavior: "contain", transform, opacity: leaving ? 0 : 1, transition: dragging ? "none" : "transform .35s cubic-bezier(.2,.8,.2,1), opacity .3s", touchAction: "pan-y", cursor: canSwipe ? (dragging ? "grabbing" : "grab") : "default", scrollbarWidth: "none" as const }}
            >
              {renderCard(top.id, action)}
              {canSwipe && (
                <>
                  <span style={{ position: "absolute", top: 56, right: 18, padding: "6px 12px", borderRadius: 10, border: `3px solid ${top.color}`, color: top.color, background: "rgba(0,0,0,.45)", fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", transform: "rotate(8deg)", opacity: stampOpacity(1), pointerEvents: "none" }}>{top.verb}</span>
                  <span style={{ position: "absolute", top: 56, left: 18, padding: "6px 12px", borderRadius: 10, border: "3px solid #e8eef3", color: "#e8eef3", background: "rgba(0,0,0,.45)", fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", transform: "rotate(-8deg)", opacity: stampOpacity(-1), pointerEvents: "none" }}>Maintenir</span>
                </>
              )}
            </div>
          </div>
          <div style={{ maxWidth: 460, width: "100%", margin: "14px auto 0", display: "grid", gridTemplateColumns: canSwipe ? "1fr auto 1fr" : "1fr", gap: 10 }}>
            {canSwipe ? (
              <>
                <button type="button" onClick={() => { setDx(-140); act("maintain"); }} style={deckBtn("rgba(255,255,255,.08)")}>← Maintenir</button>
                <button type="button" onClick={later} disabled={queue.length < 2} style={{ ...deckBtn("rgba(255,255,255,.08)"), color: "rgba(255,255,255,.6)", padding: "14px 14px", opacity: queue.length < 2 ? 0.4 : 1 }}>Plus tard</button>
                <button type="button" onClick={() => { setDx(140); act("apply"); }} style={deckBtn(top.color)}>{top.verb} →</button>
              </>
            ) : (
              <button type="button" onClick={queue.length > 1 ? next : onClose} style={deckBtn("rgba(255,255,255,.08)")}>{queue.length > 1 ? "Suivant →" : "Fermer"}</button>
            )}
          </div>
          {canSwipe && (
            <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.4)", marginTop: 10 }}>
              Glisse à droite pour {top.verb!.toLowerCase()}, à gauche pour maintenir
            </div>
          )}
        </>
      ) : (
        <div style={{ maxWidth: 460, width: "100%", margin: "28px auto 0", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>Revue terminée</div>
          <p style={{ margin: 0, color: "rgba(255,255,255,.6)", fontSize: 14, lineHeight: 1.5 }}>
            Chaque sportif voit déjà sa séance du jour à jour dans son app.
          </p>
          <div style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 24, padding: "4px 0" }}>
            {done.map((d, i) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", borderTop: i ? "1px solid rgba(255,255,255,.08)" : "none", color: "#fff", fontSize: 14, fontWeight: 700 }}>
                {d.name}
                <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: isDecided(d.id) ? "#8fe0b0" : "rgba(255,255,255,.45)" }}>{isDecided(d.id) ? "Décidé" : "Vu"}</span>
              </div>
            ))}
          </div>
          <button type="button" onClick={onClose} style={deckBtn("linear-gradient(180deg,#f04a08,#d44000)")}>Voir le Coach Control</button>
        </div>
      )}
    </div>
  );
}

function deckBtn(bg: string): React.CSSProperties {
  return { borderRadius: 14, padding: "14px 10px", fontSize: 14, fontWeight: 800, cursor: "pointer", border: "1px solid rgba(255,255,255,.14)", background: bg, color: "#fff", fontFamily: "inherit" };
}
