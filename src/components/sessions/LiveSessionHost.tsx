"use client";

import { toast } from "@/lib/toast";
import { haptic } from "@/lib/native";
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
import {
  logFor, applyFeel, rewriteLineFor, restSecOf, valueTxt, activeCount, sessionPct, sessionSummary,
  fmtNum, paceTxt, FEEL_LABEL, restorePlan, type Feel, type LineLog, type LiveSets,
} from "@/lib/liveSets";
import { parseLine } from "@/lib/exerciseParser";

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

function replaceNonEmptyLine(notes: string, idx: number, text: string): string {
  let k = -1;
  return notes.split("\n").map(l => { if (l.trim()) { k++; if (k === idx) return text; } return l; }).join("\n");
}

function cellValue(log: LineLog, v: number): string {
  if (log.kind === "pace") return paceTxt(v);
  if (log.kind === "reps") return String(v);
  if (log.kind === "count") return log.work ?? "";
  if (log.kind === "pct") return `${fmtNum(v)}%`;
  return fmtNum(v);
}

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
  const [editorRev, setEditorRev] = useState(0);
  const [feelToast, setFeelToast] = useState<{ text: string; undo: { notes: string; ls: LiveSets | null } } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


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
  const ls: LiveSets = live.live_sets ?? { v: 1, lines: {} };
  const curLine = lines[safeIdx];
  const log = curLine ? logFor(curLine, ls.lines[String(safeIdx)]) : null;
  const nSets = log ? activeCount(log) : 0;
  const tracking = !!log && log.done < nSets;
  const rest = ls.rest ?? null;
  const restElapsed = rest ? Math.max(0, (Date.now() - Date.parse(rest.at)) / 1000) : 0;
  const restLeft = rest && rest.sec != null ? rest.sec - restElapsed : null;


  /* Un tap = une écriture (notes + journal ensemble), mise en file d'attente sans réseau. */
  function commit(patch: { notes?: string; live_sets: LiveSets | null }) {
    if (notesTimer.current) { clearTimeout(notesTimer.current); notesTimer.current = null; }
    const base = live!;
    const next = { ...base, ...patch } as Session;
    setLive(next);
    rememberLive(next);
    const full = { notes: patch.notes ?? base.notes, live_sets: patch.live_sets };
    updateOwnSession(supabase, base, full).then(s => { if (!s) toast("Série non enregistrée. Réessaie dans un instant."); });
  }

  function tapFeel(feel: Feel) {
    if (!log || !curLine || log.done >= nSets) return;
    let out = applyFeel(log, feel, sessionPct(ls));
    let newLine = rewriteLineFor(curLine, out.log);
    const moved = out.log.cut !== log.cut || out.log.vals.some((v, i) => v !== log.vals[i]);
    // Ligne trop libre pour être réécrite sans abîmer le texte : ressenti noté, suite inchangée.
    let frozen = false;
    if (moved && newLine === curLine) {
      out = { log: { ...log, feels: out.log.feels, done: out.log.done, skipped: false }, capped: null, msg: "" };
      newLine = curLine;
      frozen = true;
    }
    const nl: LineLog = { ...out.log, key: newLine };
    const nd = nl.done;
    const pn = activeCount(nl);
    const nextTxt = nd < pn
      ? `série ${nd + 1}${nl.kind === "count" ? "" : ` à ${valueTxt(nl, nl.vals[nd])}`}`
      : safeIdx < lines.length - 1 ? "exercice suivant" : null;
    const newLs: LiveSets = {
      v: 1, lines: { ...ls.lines, [String(safeIdx)]: nl },
      rest: nextTxt ? { at: new Date().toISOString(), sec: restSecOf(curLine), next: nextTxt } : null,
    };
    const notes = live!.notes ?? "";
    const newNotes = newLine === curLine ? notes : replaceNonEmptyLine(notes, safeIdx, newLine);
    let tail = "";
    if (frozen) tail = " · noté, la ligne reste comme écrite";
    else if (out.capped === "ex") tail = " · plafond de l'exercice atteint, suite inchangée";
    else if (out.capped === "session") tail = " · plafond de la séance atteint, suite inchangée";
    else if (out.msg) tail = ` · ${out.msg}`;
    else if (feel !== "prevu" && nd < pn) tail = ` · suite à ${valueTxt(nl, nl.vals[nd])}`;
    haptic("light");
    commit({ notes: newNotes, live_sets: newLs });
    if (newNotes !== notes) setEditorRev(r => r + 1);
    const t = { text: `Série ${nd} faite · ${FEEL_LABEL[feel]}${tail}`, undo: { notes, ls: live!.live_sets ?? null } };
    setFeelToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setFeelToast(cur => (cur === t ? null : cur)), 4000);
  }

  function undoFeel() {
    if (!feelToast) return;
    const u = feelToast.undo;
    setFeelToast(null);
    commit({ notes: u.notes, live_sets: u.ls });
    setEditorRev(r => r + 1);
  }

  function setRest(r: LiveSets["rest"]) { commit({ live_sets: { ...ls, rest: r } }); }

  function go(j: number) {
    if (j > safeIdx && log && log.done < nSets && !log.skipped) {
      commit({ live_sets: { ...ls, lines: { ...ls.lines, [String(safeIdx)]: { ...log, skipped: true } } } });
    }
    setIdx(j);
  }

  const leftCount = log ? nSets - log.done : 0;
  const unit = log?.kind === "reps" ? "Reps" : log?.kind === "pace" ? "Allure" : log?.kind === "count" ? "Volume" : log?.kind === "pct" ? "Intensité" : "Charge";
  const setCells = log ? (

                      <div style={{ marginTop: 12, marginBottom: 12 }}>
                        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 6 }}>
                          {unit} par série · {Math.min(log.done, nSets)} / {nSets} faite{log.done > 1 ? "s" : ""}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {log.vals.map((v, i) => {
                            if (i >= nSets) {
                              return (
                                <div key={i} aria-label={`Série ${i + 1}, retirée`} style={{ minWidth: 56, minHeight: 58, padding: "6px 8px", borderRadius: 12, boxSizing: "border-box", border: "1.5px dashed rgba(0,0,0,.14)", color: "#9a9ea1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, fontFamily: "var(--font-mono), monospace", textDecoration: "line-through" }}>
                                  <span style={{ fontSize: 10.5, fontWeight: 700 }}>S{i + 1} ✕</span>
                                  <span style={{ fontSize: 14, fontWeight: 800 }}>{cellValue(log, v)}</span>
                                </div>
                              );
                            }
                            const isDone = i < log.done;
                            const skip = !!log.skipped && i >= log.done;
                            const cur = i === log.done && !skip;
                            const o = log.orig[i];
                            const changed = o != null && v !== o;
                            const sign = o == null ? " +" : changed ? ((log.kind === "pace" ? v < o : v > o) ? " ↑" : " ↓") : "";
                            const bg = isDone ? "#1f2428" : changed ? "rgba(212,64,0,.10)" : "#f4f4f2";
                            const color = isDone ? "#fff" : changed ? "#d44000" : "#1f2428";
                            let border = "1.5px solid transparent";
                            if (cur) border = "2px solid #171b1f";
                            if (isDone && changed) border = "2px solid #d44000";
                            if (skip) border = "1.5px dashed rgba(0,0,0,.28)";
                            return (
                              <div key={i} aria-label={`Série ${i + 1}, ${valueTxt(log, v)}${skip ? ", non notée" : isDone ? ", faite" : cur ? ", en cours" : ", à faire"}${changed ? ", ajustée" : ""}`}
                                style={{ minWidth: 56, minHeight: 58, padding: "6px 8px", borderRadius: 12, boxSizing: "border-box", background: bg, color, border, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, fontFamily: "var(--font-mono), monospace" }}>
                                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: isDone ? "rgba(255,255,255,.75)" : changed ? "#d44000" : "#8a8f94" }}>
                                  {skip ? `S${i + 1} –` : `${isDone ? "✓ " : ""}S${i + 1}${sign}`}
                                </span>
                                {changed && <s style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.6 }}>{cellValue(log, o!)}</s>}
                                <span style={{ fontSize: 14, fontWeight: 800 }}>{cellValue(log, v)}</span>
                              </div>
                            );
                          })}
                        </div>
                        {log.skipped && leftCount > 0 && (
                          <div style={{ fontSize: 12.5, color: "#62686e", lineHeight: 1.4, marginTop: 8 }}>
                            {leftCount} série{leftCount > 1 ? "s" : ""} non notée{leftCount > 1 ? "s" : ""} : la suite n&apos;a pas bougé. Un tap ci-dessous pour les noter quand même.
                          </div>
                        )}
                      </div>
                    
  ) : null;

  const cranLabel = !log ? "" : log.net === 0 ? "Au plan" : `${log.net > 0 ? "+" : "−"}${Math.abs(log.net)} cran${Math.abs(log.net) > 1 ? "s" : ""}${Math.abs(log.net) >= 2 ? " (max)" : ""}`;

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
    if (notesTimer.current) clearTimeout(notesTimer.current);
    const saved = await updateOwnSession(supabase, live!, { done: true, ...data, notes: live!.notes, paused_at: null });
    // Échec réel (31/10) : message, fenêtre gardée, pas d'écran de résultat (avant : retour muet puis résultat affiché).
    if (!saved) { toast("Séance non enregistrée. Réessaie dans un instant."); return false; }
    haptic("success");
    notifyOnboardingProgressSoon();
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
    // Les ajustements série par série sont retirés ; les retouches à la main restent.
    const notes = restorePlan(live!.notes ?? "", live!.live_sets);
    const saved = await updateOwnSession(supabase, live!, { started_at: null, paused_at: null, paused_ms: 0, notes, live_sets: null });
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

            {rest ? (
              <div style={{ textAlign: "center", padding: "6px 0 12px" }}>
                <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: 52, letterSpacing: "-0.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums", color: restLeft != null && restLeft <= 0 ? "#fff" : "#ff8a55" }}>
                  {restLeft == null ? mmss(restElapsed) : restLeft > 0 ? mmss(Math.ceil(restLeft)) : `+${mmss(-restLeft)}`}
                </div>
                <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.65)", marginTop: 8, padding: "0 16px" }}>
                  {restLeft == null ? "Repos libre" : restLeft > 0 ? "Repos" : "Repos fini"} · ensuite {rest.next}
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
                  {restLeft != null && restLeft > 0 && (
                    <button onClick={() => setRest({ ...rest, sec: (rest.sec ?? 0) + 30 })} style={{ height: 44, padding: "0 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>+30 s</button>
                  )}
                  <button onClick={() => setRest(null)} style={{ height: 44, padding: "0 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                    {restLeft != null && restLeft <= 0 ? "Fermer" : "Passer le repos"}
                  </button>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.55)", marginTop: 8 }}>
                  Séance {chrono}{paused ? " · en pause" : ""}
                </div>
              </div>
            ) : (
            <div style={{ textAlign: "center", padding: "6px 0 12px" }}>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: 52, letterSpacing: "-0.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{chrono}</div>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: paused ? "#fbbf24" : "rgba(255,255,255,.5)", marginTop: 8 }}>
                {paused ? "En pause" : "Durée de séance"}
              </div>
              <button onClick={togglePause} style={{ marginTop: 6, border: "none", background: "none", color: "rgba(255,255,255,.7)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
                {paused ? "Reprendre le chrono" : "Mettre en pause"}
              </button>
            </div>
            )}

            {lines.length > 1 && (
              <div style={{ display: "flex", gap: 4, padding: "0 16px 12px" }}>
                {lines.map((_, i) => (
                  <button key={i} onClick={() => go(i)} aria-label={`Exercice ${i + 1}`}
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
                      key={`${live.id}-${editorRev}`}
                      focusIndex={safeIdx}
                      value={live.notes ?? ""}
                      onChange={saveNotes}
                      authorRole="athlete"
                      authorName={userName}
                      initialMedia={live.exercise_media}
                      onMediaChange={saveMedia}
                      sessionDate={live.date}
                      focusSlot={setCells}
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

            {feelToast && (
              <div role="status" style={{ margin: "0 16px 6px", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 999, background: "#fff", color: "#171b1f", boxShadow: "0 12px 30px rgba(0,0,0,.35)" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700 }}>{feelToast.text}</span>
                <button onClick={undoFeel} style={{ border: "none", background: "none", padding: "4px 2px", color: "#d44000", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
              </div>
            )}

            {tracking ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 16px calc(14px + env(safe-area-inset-bottom,0px))", borderTop: "1px solid rgba(255,255,255,.08)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Série {log!.done + 1} faite ? C&apos;était…</div>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,.6)", whiteSpace: "nowrap" }}>{cranLabel}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.35fr) minmax(0,1fr)", gap: 8 }}>
                  {([["facile", "↑"], ["prevu", "="], ["dur", "↓"]] as [Feel, string][]).map(([f, icon]) => (
                    <button key={f} onClick={() => tapFeel(f)}
                      style={{ height: 64, borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, cursor: "pointer", color: "#fff", fontFamily: "inherit",
                        ...(f === "prevu" ? { border: "none", background: "linear-gradient(180deg,#f04a08,#d44000)", boxShadow: "0 8px 20px rgba(212,64,0,.3)" } : { border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.08)" }) }}>
                      <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1, fontWeight: 800 }}>{icon}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 800 }}>{FEEL_LABEL[f]}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button onClick={() => go(Math.max(0, safeIdx - 1))} aria-label="Exercice précédent"
                    style={{ border: "none", background: "none", padding: "8px 0", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: "rgba(255,255,255,.75)", fontFamily: "inherit", visibility: safeIdx === 0 ? "hidden" : "visible" }}>‹ Précédent</button>
                  {safeIdx < lines.length - 1 ? (
                    <button onClick={() => go(safeIdx + 1)} style={{ border: "none", background: "none", padding: "8px 0", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: "rgba(255,255,255,.75)", fontFamily: "inherit" }}>Passer à l&apos;exercice suivant ›</button>
                  ) : (
                    <button onClick={() => setCompleting(true)} style={{ border: "none", background: "none", padding: "8px 0", fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: "rgba(255,255,255,.75)", fontFamily: "inherit" }}>Terminer la séance ›</button>
                  )}
                </div>
              </div>
            ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 16px calc(18px + env(safe-area-inset-bottom,0px))" }}>
              {/* Le geste fréquent est "exercice suivant" : c'est lui le bouton principal ; Terminer ne le
                  devient qu'au dernier exercice (sinon via ■ Arrêter en haut). */}
              <button onClick={() => go(Math.max(0, safeIdx - 1))} disabled={safeIdx === 0} aria-label="Exercice précédent" style={arrowBtn(safeIdx === 0)}>‹</button>
              {safeIdx < lines.length - 1 ? (
                <button onClick={() => go(Math.min(lines.length - 1, safeIdx + 1))} style={{ flex: 1, height: 50, borderRadius: 16, border: "none", cursor: "pointer", color: "#fff", fontSize: 15, fontWeight: 800, background: "linear-gradient(180deg,#f04a08,#d44000)", boxShadow: "0 8px 20px rgba(212,64,0,.3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 14px" }}>
                  Exercice suivant →
                </button>
              ) : (
                <button onClick={() => setCompleting(true)} style={{ flex: 1, height: 50, borderRadius: 16, border: "none", cursor: "pointer", color: "#fff", fontSize: 15, fontWeight: 800, background: "linear-gradient(180deg,#f04a08,#d44000)", boxShadow: "0 8px 20px rgba(212,64,0,.3)" }}>
                  Terminer la séance
                </button>
              )}
            </div>
            )}
          </div>
        </div>
      )}

      {open && stopAsk && (
        <div onClick={() => setStopAsk(null)} style={{ position: "fixed", inset: 0, zIndex: 2147483060, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#fff", color: "#171b1f", borderRadius: "24px 24px 0 0", padding: "22px 18px calc(22px + env(safe-area-inset-bottom,0px))" }}>
            {stopAsk === "choice" ? (
              <>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Arrêter la séance</div>
                <div style={{ fontSize: 13, color: "#62686e", marginBottom: 16 }}>Si tu annules, les séries ajustées reviennent comme prévu. Tes autres modifications d&apos;exercices restent.</div>
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
                <div style={{ fontSize: 13, color: "#62686e", marginBottom: 16 }}>Le chrono est effacé, la séance redevient « Prévu » et les séries ajustées reviennent comme prévu. Rien n&apos;est compté dans ta charge.</div>
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
        <CompleteModal session={live} onSave={finish} onClose={() => setCompleting(false)}
          summary={sessionSummary(lines, live.live_sets, l => parseLine(l).name)} />
      )}
    </>
  );
}
