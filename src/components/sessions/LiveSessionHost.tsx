"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Session } from "@/types";
import type { ExerciseAttachments } from "@/types";
import {
  OPEN_LIVE_SESSION, LIVE_SESSION_CHANGED, fetchLiveSession, liveElapsedMs, formatChrono,
  togglePauseLiveSession, notifyLiveChanged,
} from "@/lib/liveSession";
import { notifyOnboardingProgressSoon } from "@/lib/onboardingProgress";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { DARK_CARD_BG } from "@/lib/theme";
import { isOffline, rememberLive, updateOwnSession } from "@/lib/offlineSessions";

const ExerciseBlockEditor = dynamic(() => import("@/components/sessions/ExerciseBlockEditor"));
const CompleteModal = dynamic(() => import("@/components/sessions/CompleteModal"));

/* Séance en direct (2026-10-02, POC seance-live) — monté une fois dans le layout (app), côté sportif.
   - Barre "En cours" au-dessus de la navigation sur toutes les pages, tant qu'une séance tourne.
   - Écran plein : chrono, un exercice à la fois en grand (ExerciseBlockEditor en mode focus : mêmes
     tokens, médias, commentaires, tests), Terminer avec la durée du chrono pré-remplie.
   Démarrer/Reprendre viennent des cartes séance via openLiveSession() (lib/liveSession). */
export default function LiveSessionHost({ userId, userName }: { userId: string; userName: string }) {
  const supabase = useRef(createClient()).current;
  const router = useRouter();
  const pathname = usePathname();
  const { isMd } = useBreakpoint();
  const [live, setLive] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [stopAsk, setStopAsk] = useState<null | "choice" | "confirmCancel">(null);
  const [, setTick] = useState(0);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const s = await fetchLiveSession(supabase, userId);
    setLive(s);
    if (!s) setOpen(false);
    return s;
  }, [supabase, userId]);

  useEffect(() => { refresh(); }, [refresh, pathname]);
  useEffect(() => {
    const onChanged = () => { refresh(); };
    const onOpen = async () => { const s = await refresh(); if (s) { setIdx(0); setOpen(true); } };
    window.addEventListener(LIVE_SESSION_CHANGED, onChanged);
    window.addEventListener(OPEN_LIVE_SESSION, onOpen);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener(LIVE_SESSION_CHANGED, onChanged);
      window.removeEventListener(OPEN_LIVE_SESSION, onOpen);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  // Chrono affiché : recalculé chaque seconde depuis la base (jamais un compteur local qui dérive).
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [live]);

  // Écran allumé pendant la séance (refusé sans bruit si le navigateur ne le permet pas).
  useEffect(() => {
    if (!open) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then(l => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [open]);

  if (!live) return null;

  const lines = (live.notes ?? "").split("\n").filter(l => l.trim());
  const safeIdx = Math.min(idx, Math.max(0, lines.length - 1));
  const chrono = formatChrono(liveElapsedMs(live));
  const paused = !!live.paused_at;

  function saveNotes(text: string) {
    setLive(prev => prev ? { ...prev, notes: text } : prev);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    const id = live!.id;
    const base = live!;
    notesTimer.current = setTimeout(async () => {
      // Hors ligne : mis en attente, envoyé au retour du réseau (updateOwnSession).
      const s = await updateOwnSession(supabase, { ...base, id }, { notes: text });
      if (s) rememberLive(s);
    }, 600);
  }
  async function saveMedia(media: Record<string, ExerciseAttachments>) {
    setLive(prev => prev ? { ...prev, exercise_media: media } : prev);
    const { error } = await supabase.from("sessions").update({ exercise_media: media }).eq("id", live!.id);
    if (error) console.error("[live] médias", error);
  }
  async function togglePause() {
    const s = await togglePauseLiveSession(supabase, live!);
    if (s) setLive(s);
  }
  async function finish(data: { rpe: number; duration: number }) {
    notifyOnboardingProgressSoon();
    if (notesTimer.current) clearTimeout(notesTimer.current);
    const saved = await updateOwnSession(supabase, live!, { done: true, ...data, notes: live!.notes, paused_at: null });
    if (!saved) return;
    rememberLive(null);
    setCompleting(false);
    setOpen(false);
    setLive(null);
    notifyLiveChanged();
    if (!isOffline()) router.refresh();
  }

  /* Annuler la séance en cours : le chrono est effacé, la séance redevient "Prévu", rien n'est compté.
     Les exercices modifiés pendant la séance restent tels quels. */
  async function cancelLive() {
    if (notesTimer.current) clearTimeout(notesTimer.current);
    const saved = await updateOwnSession(supabase, live!, { started_at: null, paused_at: null, paused_ms: 0, notes: live!.notes });
    if (!saved) return;
    rememberLive(null);
    setStopAsk(null);
    setOpen(false);
    setLive(null);
    notifyLiveChanged();
    if (!isOffline()) router.refresh();
  }

  const arrowBtn = (disabled: boolean): React.CSSProperties => ({
    width: 50, height: 50, borderRadius: 16, border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.08)",
    color: "#fff", fontSize: 20, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.3 : 1, flexShrink: 0,
  });

  return (
    <>
      {!open && (
        <button
          onClick={() => { setIdx(0); setOpen(true); }}
          style={{
            position: "fixed", left: "50%", transform: "translateX(-50%)", zIndex: 2147482990,
            bottom: "calc(124px + env(safe-area-inset-bottom,0px))", width: isMd ? "min(640px,calc(100vw - 28px))" : "min(440px,calc(100vw - 24px))",
            display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderRadius: 999, border: "none", cursor: "pointer",
            background: "#fff", color: "#171b1f", boxShadow: "0 12px 30px rgba(0,0,0,.35)", textAlign: "left", fontFamily: "inherit",
          }}
        >
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: paused ? "#f59e0b" : "#d44000", flexShrink: 0, animation: paused ? undefined : "livePulse 1.4s infinite" }} />
          <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{live.name}</span>
          <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: 13.5, color: "#d44000", fontVariantNumeric: "tabular-nums" }}>{chrono}</span>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: "#d44000", whiteSpace: "nowrap" }}>Reprendre ›</span>
        </button>
      )}

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2147483050, background: DARK_CARD_BG, color: "#fff", display: "flex", flexDirection: "column" }}>
          <div style={{ width: "100%", maxWidth: 640, margin: "0 auto", flex: 1, display: "flex", flexDirection: "column", minHeight: 0, paddingTop: "env(safe-area-inset-top,0px)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 6px" }}>
              <button onClick={() => setOpen(false)} aria-label="Réduire la séance" style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.1)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              <div style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{live.name}</div>
              <button onClick={() => setStopAsk("choice")} style={{ border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)", color: "#fff", borderRadius: 999, padding: "8px 13px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                ■ Arrêter
              </button>
            </div>

            <div style={{ textAlign: "center", padding: "6px 0 12px" }}>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: 52, letterSpacing: "-0.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{chrono}</div>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: paused ? "#fbbf24" : "rgba(255,255,255,.5)", marginTop: 8 }}>
                {paused ? "En pause" : "Durée de séance"}
              </div>
              <button onClick={togglePause} style={{ marginTop: 6, border: "none", background: "none", color: "rgba(255,255,255,.7)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
                {paused ? "Reprendre le chrono" : "Mettre en pause"}
              </button>
            </div>

            {lines.length > 1 && (
              <div style={{ display: "flex", gap: 4, padding: "0 16px 12px" }}>
                {lines.map((_, i) => (
                  <button key={i} onClick={() => setIdx(i)} aria-label={`Exercice ${i + 1}`}
                    style={{ flex: 1, height: 5, borderRadius: 999, border: "none", padding: 0, cursor: "pointer", background: i === safeIdx ? "#ff8a55" : i < safeIdx ? "#2f9e44" : "rgba(255,255,255,.16)" }} />
                ))}
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 12px" }}>
              <div style={{ background: "#fff", color: "#171b1f", borderRadius: 24, padding: 18 }}>
                {lines.length > 0 ? (
                  <>
                    <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 6 }}>
                      Exercice {safeIdx + 1} / {lines.length}
                    </div>
                    <ExerciseBlockEditor
                      key={live.id}
                      focusIndex={safeIdx}
                      value={live.notes ?? ""}
                      onChange={saveNotes}
                      authorRole="athlete"
                      authorName={userName}
                      initialMedia={live.exercise_media}
                      onMediaChange={saveMedia}
                      sessionDate={live.date}
                    />
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: "#62686e", marginBottom: 10 }}>Pas encore d&apos;exercice : ajoute-les ici, ils s&apos;enregistrent dans la séance.</div>
                    <ExerciseBlockEditor
                      key={`${live.id}-empty`}
                      value=""
                      onChange={saveNotes}
                      authorRole="athlete"
                      authorName={userName}
                      initialMedia={live.exercise_media}
                      onMediaChange={saveMedia}
                      sessionDate={live.date}
                    />
                  </>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 16px calc(18px + env(safe-area-inset-bottom,0px))" }}>
              {/* Le geste fréquent est "exercice suivant" : c'est lui le bouton principal ; Terminer ne le
                  devient qu'au dernier exercice (sinon via ■ Arrêter en haut). */}
              <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={safeIdx === 0} aria-label="Exercice précédent" style={arrowBtn(safeIdx === 0)}>‹</button>
              {safeIdx < lines.length - 1 ? (
                <button onClick={() => setIdx(i => Math.min(lines.length - 1, i + 1))} style={{ flex: 1, height: 50, borderRadius: 16, border: "none", cursor: "pointer", color: "#fff", fontSize: 15, fontWeight: 800, background: "linear-gradient(180deg,#f04a08,#d44000)", boxShadow: "0 8px 20px rgba(212,64,0,.3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 14px" }}>
                  Exercice suivant →
                </button>
              ) : (
                <button onClick={() => setCompleting(true)} style={{ flex: 1, height: 50, borderRadius: 16, border: "none", cursor: "pointer", color: "#fff", fontSize: 15, fontWeight: 800, background: "linear-gradient(180deg,#f04a08,#d44000)", boxShadow: "0 8px 20px rgba(212,64,0,.3)" }}>
                  Terminer la séance
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {open && stopAsk && (
        <div onClick={() => setStopAsk(null)} style={{ position: "fixed", inset: 0, zIndex: 2147483060, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#fff", color: "#171b1f", borderRadius: "24px 24px 0 0", padding: "22px 18px calc(22px + env(safe-area-inset-bottom,0px))" }}>
            {stopAsk === "choice" ? (
              <>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Arrêter la séance</div>
                <div style={{ fontSize: 13, color: "#62686e", marginBottom: 16 }}>Tes modifications d&apos;exercices sont gardées dans les deux cas.</div>
                <button onClick={() => { setStopAsk(null); setCompleting(true); }} style={{ width: "100%", height: 50, borderRadius: 16, border: "none", cursor: "pointer", color: "#fff", fontSize: 15, fontWeight: 800, background: "linear-gradient(180deg,#f04a08,#d44000)", marginBottom: 8 }}>
                  Terminer et enregistrer
                </button>
                <button onClick={() => setStopAsk("confirmCancel")} style={{ width: "100%", height: 48, borderRadius: 16, border: "1px solid rgba(0,0,0,.12)", cursor: "pointer", background: "#fff", color: "#b42318", fontSize: 14, fontWeight: 800, marginBottom: 6 }}>
                  Annuler la séance en cours
                </button>
                <button onClick={() => setStopAsk(null)} style={{ width: "100%", height: 40, border: "none", background: "none", color: "#62686e", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Continuer la séance</button>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Annuler la séance en cours ?</div>
                <div style={{ fontSize: 13, color: "#62686e", marginBottom: 16 }}>Le chrono est effacé et la séance redevient « Prévu ». Rien n&apos;est compté dans ta charge.</div>
                <button onClick={cancelLive} style={{ width: "100%", height: 50, borderRadius: 16, border: "none", cursor: "pointer", color: "#fff", fontSize: 15, fontWeight: 800, background: "#b42318", marginBottom: 8 }}>
                  Oui, annuler la séance
                </button>
                <button onClick={() => setStopAsk("choice")} style={{ width: "100%", height: 44, borderRadius: 16, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#171b1f", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Retour</button>
              </>
            )}
          </div>
        </div>
      )}

      {completing && (
        <CompleteModal session={live} onSave={finish} onClose={() => setCompleting(false)} />
      )}
    </>
  );
}
