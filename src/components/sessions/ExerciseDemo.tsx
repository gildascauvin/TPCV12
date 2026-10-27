"use client";

/* Démos d'exercices (2026-10-22, POC poc_demos_exercices/prod.html) :
   - DemoThumb : vignette à la place du picto dans ExerciseLineView (une démo, deux en cascade pour
     un complexe, ou une image d'illustration). Un tap ouvre le lecteur, jamais la carte autour.
   - DemoBlock : séance en direct, la démo pleine largeur sous l'exercice (une tuile par mouvement).
   - DemoSheetHost : le lecteur. Mobile = bottom sheet, ordinateur = fenêtre centrée. Un complexe
     montre toutes ses vidéos d'un coup (pas de lecture enchaînée). Dans l'éditeur (editable) :
     Changer de démo / Mettre ma vidéo / Masquer, sous chaque vidéo. */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useExitAnimation } from "@/hooks/useExitAnimation";
import { alternativesFor, ytFrame, ytThumb, type LineMedia, type DemoItem } from "@/lib/exerciseDemos";
import type { DemoSheetDetail } from "@/lib/demoSheetEvent";
import { DEMO_SHEET_EVENT, LINE_MEDIA_EVENT, demoKeyOf, imageKeyOf, openDemoSheet, resolveLineMedia, setDemoPref, useDemoPrefs } from "@/lib/demoPrefs";

function stop(e: React.SyntheticEvent) { e.stopPropagation(); e.preventDefault(); }

const PlayDot = ({ s }: { s: number }) => (
  <span style={{ position: "absolute", right: 2, bottom: 2, width: s, height: s, borderRadius: "50%", background: "rgba(255,255,255,.95)", display: "grid", placeItems: "center" }}>
    <span style={{ borderLeft: `${s * 0.36}px solid #171b1f`, borderTop: `${s * 0.25}px solid transparent`, borderBottom: `${s * 0.25}px solid transparent`, marginLeft: s * 0.1 }} />
  </span>
);

export function DemoThumb({ media, text, size, editable }: { media: LineMedia; text: string; size: number; editable: boolean }) {
  const open = (e: React.SyntheticEvent) => {
    stop(e);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openDemoSheet(text, editable, r.top + window.scrollY);
  };
  const common: React.CSSProperties = { border: 0, padding: 0, cursor: "pointer", background: "#000", overflow: "hidden", flexShrink: 0, display: "block" };
  if (media.kind === "image") {
    return (
      <button type="button" onClick={open} onPointerDown={e => e.stopPropagation()} aria-label={media.label} title={media.label}
        style={{ ...common, width: size, height: size, borderRadius: size / 4, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media.src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </button>
    );
  }
  if (media.items.length > 1) {
    const s = Math.round(size * 0.76), off = size - s;
    return (
      <span style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "block" }}>
        {media.items.slice(0, 2).map((it, i) => (
          <button key={i} type="button" onClick={open} onPointerDown={e => e.stopPropagation()} aria-label="Voir les démos"
            style={{ ...common, position: "absolute", top: i * off, left: i * off, width: s, height: s, borderRadius: s / 4, boxShadow: i ? "0 0 0 2px #fff" : undefined }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ytThumb(it.yt)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.15)", display: "block" }} />
            {i === 1 && <PlayDot s={Math.max(11, s * 0.36)} />}
          </button>
        ))}
      </span>
    );
  }
  const it = media.items[0];
  return (
    <button type="button" onClick={open} onPointerDown={e => e.stopPropagation()} aria-label={`Voir la démo : ${it.label}`} title={it.label}
      style={{ ...common, position: "relative", width: size, height: size, borderRadius: size / 4 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ytThumb(it.yt)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.15)", display: "block" }} />
      <PlayDot s={Math.max(12, size * 0.35)} />
    </button>
  );
}

/** Séance en direct : la démo pleine largeur sous l'exercice. */
export function DemoBlock({ text }: { text: string }) {
  useDemoPrefs();
  const media = resolveLineMedia(text);
  if (!media) return null;
  if (media.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={media.src} alt="" style={{ marginTop: 14, width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 16, display: "block" }} />
    );
  }
  const duo = media.items.length > 1;
  return (
    <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: duo ? "repeat(2,minmax(0,1fr))" : "1fr", gap: 8 }}>
      {media.items.map((it, i) => (
        <button key={i} type="button" onClick={e => { stop(e); openDemoSheet(text, false); }}
          style={{ border: 0, padding: 0, background: "none", cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit" }}>
          <span style={{ position: "relative", display: "block", width: "100%", aspectRatio: "16/9", borderRadius: duo ? 12 : 16, overflow: "hidden", background: "#000" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ytFrame(it.yt)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <span style={{ width: duo ? 36 : 52, height: duo ? 36 : 52, borderRadius: "50%", background: "rgba(255,255,255,.95)", display: "grid", placeItems: "center" }}>
                <span style={{ borderLeft: `${duo ? 11 : 15}px solid #171b1f`, borderTop: `${duo ? 6.5 : 9}px solid transparent`, borderBottom: `${duo ? 6.5 : 9}px solid transparent`, marginLeft: duo ? 3 : 4 }} />
              </span>
            </span>
          </span>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 6, marginTop: 6, fontSize: 12, color: "#8a8f94" }}>
            <b style={{ color: "#171b1f", fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{duo ? it.label : "Voir la démo"}</b>
            <span style={{ whiteSpace: "nowrap" }}>Catalyst Athletics</span>
          </span>
        </button>
      ))}
    </div>
  );
}

const pill: React.CSSProperties = { border: "1px solid rgba(0,0,0,.1)", background: "#fff", borderRadius: 999, padding: "7px 11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: "#171b1f", fontFamily: "inherit" };

function VideoBlock({ it, index, count, autoplay, editable, onDone, lineText }: { it: DemoItem; index: number; count: number; autoplay: boolean; editable: boolean; onDone: () => void; lineText: string }) {
  const [swap, setSwap] = useState(false);
  const key = demoKeyOf(it.defaultId ?? it.entryId);
  const alts = alternativesFor({ ...it, entryId: it.defaultId ?? it.entryId });
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6, fontSize: 13 }}>
        <b style={{ fontWeight: 800 }}>{count > 1 ? `${index + 1}. ` : ""}{it.label}</b>
        <span style={{ fontSize: 12, color: "#8a8f94", whiteSpace: "nowrap" }}>Catalyst Athletics</span>
      </div>
      <iframe
        title={it.label}
        src={`https://www.youtube-nocookie.com/embed/${it.yt}?playsinline=1&rel=0${autoplay ? "&autoplay=1&mute=1" : ""}`}
        allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
        style={{ display: "block", width: "100%", aspectRatio: "16/9", border: 0, borderRadius: 14, background: "#000" }}
      />
      {editable && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {alts.length > 1 && (
              <button type="button" onClick={() => setSwap(v => !v)} style={{ ...pill, borderColor: swap ? "#d44000" : pill.borderColor as string, color: swap ? "#d44000" : "#171b1f" }}>↻ Changer de démo</button>
            )}
            <button type="button" style={pill} onClick={() => { onDone(); window.dispatchEvent(new CustomEvent(LINE_MEDIA_EVENT, { detail: { text: lineText } })); }}>📷 Mettre ma vidéo</button>
            <button type="button" style={{ ...pill, borderColor: "transparent", color: "#8a8f94" }} onClick={() => { setDemoPref(key, { entry_id: null, hidden: true }); onDone(); }}>Masquer</button>
          </div>
          {swap && (
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {alts.map(a => {
                const on = a.entryId === it.entryId;
                return (
                  <button key={a.entryId} type="button"
                    onClick={() => { setDemoPref(key, a.entryId === (it.defaultId ?? it.entryId) ? null : { entry_id: a.entryId, hidden: false }); setSwap(false); }}
                    style={{ display: "flex", gap: 10, alignItems: "center", border: `1.5px solid ${on ? "#d44000" : "rgba(0,0,0,.08)"}`, background: "#fff", borderRadius: 12, padding: 6, cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 700, color: "#171b1f", fontFamily: "inherit" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ytFrame(a.yt)} alt="" style={{ width: 72, aspectRatio: "16/9", objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                    <span style={{ minWidth: 0 }}>{a.label}<span style={{ display: "block", fontWeight: 500, fontSize: 11.5, color: "#8a8f94" }}>{a.title}</span></span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* `initial` : le tap qui a déclenché le chargement (DemoSheetLauncher), arrivé avant ce montage. */
export function DemoSheetHost({ initial = null }: { initial?: DemoSheetDetail | null }) {
  const [state, setState] = useState<DemoSheetDetail | null>(initial);
  const [mounted, setMounted] = useState(false);
  const { isMd } = useBreakpoint();
  useDemoPrefs();
  // Fermeture animée (fond, Fermer, Échap) ; « Masquer » / choix d'une vidéo ferment sans animation.
  const { close: dismiss, exitClass } = useExitAnimation(() => setState(null));
  useEffect(() => {
    setMounted(true);
    const fn = (e: Event) => setState((e as CustomEvent).detail);
    window.addEventListener(DEMO_SHEET_EVENT, fn);
    return () => window.removeEventListener(DEMO_SHEET_EVENT, fn);
  }, []);
  useEffect(() => {
    if (!state) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [state, dismiss]);
  if (!mounted || !state) return null;
  const media = resolveLineMedia(state.text);
  const close = () => setState(null);
  if (!media) return null;

  const body = media.kind === "image" ? (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={media.src} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 14, display: "block" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 13 }}>
        <b>{media.label}</b>
        {state.editable && <button type="button" style={{ ...pill, borderColor: "transparent", color: "#8a8f94" }} onClick={() => { setDemoPref(imageKeyOf(media.key), { entry_id: null, hidden: true }); close(); }}>Masquer</button>}
      </div>
    </div>
  ) : (
    <div style={{ display: "grid", gap: 18 }}>
      {media.items.map((it, i) => (
        <VideoBlock key={`${it.entryId}-${i}`} it={it} index={i} count={media.items.length} autoplay={i === 0} editable={state.editable} onDone={close} lineText={state.text} />
      ))}
    </div>
  );

  // En iframe (page /p/ intégrée à WordPress), l'iframe fait toute la hauteur du programme : on
  // ouvre la fenêtre à hauteur du tap au lieu du bas ou du centre de l'iframe.
  const inFrame = typeof window !== "undefined" && window.self !== window.top && state.anchorY != null;
  const sheet = !isMd && !inFrame;
  return createPortal(
    <div className={exitClass} onClick={dismiss} style={{ position: inFrame ? "absolute" : "fixed", top: 0, left: 0, right: 0, bottom: inFrame ? undefined : 0, minHeight: inFrame ? document.documentElement.scrollHeight : undefined, zIndex: 2147483300, background: "rgba(0,0,0,.55)", display: "flex", alignItems: inFrame ? "flex-start" : isMd ? "center" : "flex-end", justifyContent: "center", padding: inFrame ? `${Math.max(8, (state.anchorY ?? 0) - 120)}px 12px 0` : isMd ? 24 : 0 }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: sheet ? "100%" : 640, maxHeight: inFrame ? undefined : isMd ? "86vh" : "88dvh", background: "#fff", color: "#171b1f",
          borderRadius: sheet ? "24px 24px 0 0" : 24, display: "flex", flexDirection: "column",
          animation: sheet ? "sheetInUp .22s ease" : "modalIn .2s ease", boxShadow: "0 30px 80px rgba(0,0,0,.35)",
        }}>
        {sheet && <div style={{ width: 38, height: 4, borderRadius: 999, background: "#d9dcdf", margin: "10px auto 0", flexShrink: 0 }} />}
        <div style={{ overflowY: "auto", padding: sheet ? "14px 14px 8px" : "22px 22px 12px" }}>{body}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `10px ${isMd ? 22 : 14}px calc(${isMd ? 16 : 18}px + env(safe-area-inset-bottom,0px))`, flexShrink: 0, fontSize: 12.5, color: "#62686e" }}>
          <span>{media.kind === "demo" && media.items.length > 1 ? `${media.items.length} mouvements` : ""}</span>
          <button type="button" onClick={dismiss} style={{ border: 0, background: "#f1f1f1", borderRadius: 999, padding: "9px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Fermer</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
