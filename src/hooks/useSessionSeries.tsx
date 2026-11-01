"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { seriesApi, seriesRowLabel, dayNameOf, shortDate, defaultRepeatUntil, type SeriesInfo } from "@/lib/seriesClient";
import { hasSessionChange, editSummary, type SessionState } from "@/lib/sessionSeries";
import { moveExerciseLine } from "@/lib/exerciseMediaReindex";
import { SeriesChoiceModal, RepeatModal, SeriesRow } from "@/components/sessions/SeriesModals";
import { toast } from "@/lib/toast";
import type { ChargeAdjust } from "@/lib/chargeAdjust";

/* Séries de séances côté Planning (2026-11-01, façon Google Agenda), communes au Planning sportif,
   au Planning coach, à l'Accueil et à Coach Control : ligne « ↻ » du tiroir, « Répéter chaque
   semaine » (aussi juste après la création), question « Cette séance / Celle-ci et les suivantes »
   après une modification, un glisser de séance ou d'exercice, une suppression.
   Les appels passent par /api/sessions/series ; `toRow` convertit une ligne de la base en séance
   de l'écran (CoachViewSession côté coach). */

export interface SeriesSessionLike {
  id: string; date: string; name: string; notes: string | null; target_difficulty: number | null; done: boolean;
  series_id?: string | null; exercise_media?: Record<string, unknown> | null;
}

type Api = ReturnType<typeof seriesApi>;
/* Sportif et conversion figés au moment de la question : sur Coach Control le tiroir (donc le
   sportif affiché) est déjà fermé quand on confirme. */
type Ctx<T> = { api: Api; toRow: (raw: Record<string, unknown>) => T };
type Prompt<T> = { kind: "edit" | "move" | "delete"; session: T; dates: string[]; before?: SessionState; after?: SessionState; fromDate?: string; toDate?: string; ctx: Ctx<T> };

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const stateOf = (s: SeriesSessionLike): SessionState => ({ name: s.name, notes: s.notes, target_difficulty: s.target_difficulty });

export function useSessionSeries<T extends SeriesSessionLike>({ athleteId, editing, sessions, setSessions, toRow, deleteOne, gate, onChanged, offline = false }: {
  athleteId?: string;
  /** Séance ouverte dans le tiroir (null si fermé ou en création). */
  editing: T | null;
  sessions: T[];
  setSessions: Dispatch<SetStateAction<T[]>>;
  toRow: (raw: Record<string, unknown>) => T;
  /** Suppression « cette séance seulement » (absent : pas de suppression depuis cet écran). */
  deleteOne?: (s: T) => Promise<void> | void;
  gate: (fn: () => Promise<void>) => unknown;
  onChanged?: () => void;
  /** Hors connexion (Accueil) : ni ligne ↻ ni question, les séries passent par le serveur. */
  offline?: boolean;
}) {
  const api = useMemo(() => seriesApi(athleteId), [athleteId]);
  const latest = useRef(sessions);
  latest.current = sessions;
  const [snap, setSnap] = useState<SessionState | null>(null);
  const [info, setInfo] = useState<SeriesInfo | null>(null);
  const [repeatFor, setRepeatForState] = useState<{ s: T; ctx: Ctx<T> } | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  // Dernière répétition faite depuis ce tiroir : reprise pour les copies vers d'autres sportifs (coach).
  const lastRepeat = useRef<{ sessionId: string; until: string; step: ChargeAdjust } | null>(null);
  const [prompt, setPrompt] = useState<Prompt<T> | null>(null);

  const ctxNow = useCallback((): Ctx<T> => ({ api, toRow }), [api, toRow]);
  const setRepeatFor = (s: T) => setRepeatForState({ s, ctx: ctxNow() });
  const editingId = editing?.id;
  useEffect(() => {
    if (!editing) { setSnap(null); setInfo(null); return; }
    setSnap(stateOf(editing));
    setInfo(null);
    if (editing.series_id) api.info(editing.id).then(setInfo).catch((e: unknown) => console.error("[série] info", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, api]);

  const ask = useCallback(async (kind: "edit" | "move", session: T, extra: Omit<Prompt<T>, "kind" | "session" | "dates" | "ctx">) => {
    if (!session.series_id || session.done || offline) return;
    const ctx = ctxNow();
    try {
      const i = await ctx.api.info(session.id, kind === "move" ? extra.fromDate : undefined);
      if (i.following > 0) setPrompt({ kind, session, dates: i.dates, ...extra, ctx });
    } catch (e) { console.error("[série] info", e); }
  }, [ctxNow, offline]);

  const replaceRows = useCallback((rows: Record<string, unknown>[], conv: Ctx<T>["toRow"]) => {
    const byId = new Map(rows.map(r => { const v = conv(r); return [v.id, v] as const; }));
    setSessions(prev => prev.map(s => byId.get(s.id) ?? s));
  }, [setSessions]);

  /* Fermeture du tiroir d'une séance existante : propose de reporter la modification. Le tiroir se
     ferme sans attendre la fin de sa dernière sauvegarde : on compare donc aussi quand la séance
     arrive à jour dans l'écran (jusqu'à 5 s après la fermeture). */
  const [pendingClose, setPendingClose] = useState<{ id: string; before: SessionState; until: number } | null>(null);
  const closeEdit = useCallback((sessionId: string) => {
    if (snap) setPendingClose({ id: sessionId, before: snap, until: Date.now() + 5000 });
  }, [snap]);
  useEffect(() => {
    if (!pendingClose) return;
    const cur = sessions.find(s => s.id === pendingClose.id);
    if (cur && hasSessionChange(pendingClose.before, stateOf(cur))) {
      setPendingClose(null);
      void ask("edit", cur, { before: pendingClose.before, after: stateOf(cur) });
      return;
    }
    const t = window.setTimeout(() => setPendingClose(p => (p && p.until <= Date.now() ? null : p)), Math.max(0, pendingClose.until - Date.now()));
    return () => window.clearTimeout(t);
  }, [pendingClose, sessions, ask]);

  /** Suppression depuis le tiroir : true si la question « et les suivantes » a pris le relais. */
  const tryDelete = useCallback((s: T): boolean => {
    if (offline || !s.series_id || !info || info.following === 0) return false;
    setPrompt({ kind: "delete", session: s, dates: info.dates, ctx: ctxNow() });
    return true;
  }, [info, ctxNow]);

  const wrapMove = useCallback((move: (s: T, newDate: string) => Promise<void> | void) => async (s: T, newDate: string) => {
    await move(s, newDate);
    void ask("move", { ...s, date: newDate }, { fromDate: s.date, toDate: newDate });
  }, [ask]);

  const wrapExerciseMove = useCallback((move: (fromId: string, fromIdx: number, toId: string, toIdx: number | null) => Promise<void> | void) =>
    async (fromId: string, fromIdx: number, toId: string, toIdx: number | null) => {
      const src = latest.current.find(s => s.id === fromId);
      await move(fromId, fromIdx, toId, toIdx);
      if (!src || fromId !== toId || !src.series_id) return;
      const r = moveExerciseLine({ fromNotes: src.notes, fromMedia: src.exercise_media as never, fromIdx, toNotes: src.notes, toMedia: src.exercise_media as never, toIdx, sameSession: true });
      if (!r) return;
      const before = stateOf(src);
      void ask("edit", src, { before, after: { ...before, notes: r.source.notes } });
    }, [ask]);

  const editRow = (s: T): ReactNode => offline ? null : <SeriesRow label={seriesRowLabel(s.date, info)} onRepeat={() => setRepeatFor(s)} />;
  const createRow = (): ReactNode => createdId && !offline
    ? <SeriesRow label={null} onRepeat={() => { const c = latest.current.find(x => x.id === createdId); if (c) setRepeatFor(c); }} />
    : null;
  /** À appeler avec le retour de l'enregistrement d'une séance en création. */
  const noteCreated = (r: unknown) => { if (r && typeof r === "object" && "id" in r && typeof (r as { id: unknown }).id === "string") setCreatedId((r as { id: string }).id); };
  const resetCreated = () => { setCreatedId(null); lastRepeat.current = null; };

  /** Coach : la séance du tiroir a été répétée puis dupliquée vers d'autres sportifs → leurs copies
   *  sont répétées pareil (même fin, même progression). */
  const repeatAlso = useCallback(async (sourceId: string, items: { id: string; athleteId: string }[], conv: (raw: Record<string, unknown>, athleteId: string) => T) => {
    const r = lastRepeat.current;
    if (!r || r.sessionId !== sourceId || !items.length) return;
    try {
      const all = await Promise.all(items.map(async it => (await seriesApi(it.athleteId).repeat<Record<string, unknown>>(it.id, r.until, r.step)).created.map(row => conv(row, it.athleteId))));
      setSessions(prev => [...prev, ...all.flat()]);
    } catch (e) { console.error("[série] répéter les copies", e); toast("Copies non répétées chez les autres sportifs."); }
  }, [setSessions]);

  const modals = (
    <>
      {repeatFor && (
        <RepeatModal
          sessionName={repeatFor.s.name}
          dayLabel={dayNameOf(repeatFor.s.date)}
          untilDate={defaultRepeatUntil(repeatFor.s.date)}
          onCancel={() => setRepeatForState(null)}
          onConfirm={(until, step) => gate(async () => {
            const { s: src, ctx } = repeatFor;
            setRepeatForState(null);
            try {
              const { created, seriesId } = await ctx.api.repeat<Record<string, unknown>>(src.id, until, step);
              lastRepeat.current = { sessionId: src.id, until, step };
              setSessions(prev => [...prev.map(s => s.id === src.id ? { ...s, series_id: seriesId } : s), ...created.map(ctx.toRow)]);
              // Le tiroir repart de l'état répété : pas de question en double à la fermeture.
              const cur = latest.current.find(s => s.id === src.id) ?? src;
              setSnap(stateOf(cur));
              setInfo(await ctx.api.info(src.id));
              toast(created.length ? `${plural(created.length, "séance ajoutée", "séances ajoutées")} jusqu'au ${shortDate(until)}` : "Aucune semaine à ajouter avant cette date");
              onChanged?.();
            } catch (e) { console.error("[série] répéter", e); toast("Séances non répétées. Réessaie dans un instant."); }
          })}
        />
      )}
      {prompt && (() => {
        const p = prompt;
        const title = p.kind === "edit" ? `Modifier « ${p.session.name} » du ${dayNameOf(p.session.date)}`
          : p.kind === "move" ? `Déplacer « ${p.session.name} » au ${dayNameOf(p.toDate ?? p.session.date)}`
          : `Supprimer « ${p.session.name} »`;
        return (
          <SeriesChoiceModal
            title={title}
            summary={p.kind === "edit" && p.before && p.after ? editSummary(p.before, p.after) : undefined}
            untilOptions={p.kind === "edit" ? p.dates.map(d => ({ value: d, label: shortDate(d) })) : undefined}
            defaultAll={p.kind !== "delete"}
            confirmLabel={p.kind === "delete" ? "Supprimer" : "OK"}
            onCancel={p.kind === "delete" ? () => setPrompt(null) : undefined}
            onConfirm={(all, until) => gate(async () => {
              setPrompt(null);
              try {
                if (p.kind === "delete") {
                  if (!all) { await deleteOne?.(p.session); return; }
                  const { deletedIds } = await p.ctx.api.remove(p.session.id);
                  setSessions(prev => prev.filter(s => !deletedIds.includes(s.id)));
                  toast(plural(deletedIds.length, "séance supprimée", "séances supprimées"));
                } else if (all && p.kind === "edit" && p.before && p.after) {
                  const { updated } = await p.ctx.api.edit<Record<string, unknown>>(p.session.id, p.before, p.after, until);
                  replaceRows(updated, p.ctx.toRow);
                  toast(`${plural(updated.length, "séance suivante mise", "séances suivantes mises")} à jour`);
                } else if (all && p.kind === "move" && p.fromDate && p.toDate) {
                  const { updated } = await p.ctx.api.move<Record<string, unknown>>(p.session.id, p.fromDate, p.toDate);
                  replaceRows(updated, p.ctx.toRow);
                  // Annuler ramène les suivantes (la séance glissée a son propre « Annuler »).
                  const { fromDate, toDate } = p;
                  toast(plural(updated.length, "séance suivante déplacée", "séances suivantes déplacées"), {
                    action: { label: "Annuler", onClick: () => { void p.ctx.api.move<Record<string, unknown>>(p.session.id, toDate, fromDate).then(r => { replaceRows(r.updated, p.ctx.toRow); onChanged?.(); }).catch(e => console.error("[série] annuler", e)); } },
                  });
                } else return;
                onChanged?.();
              } catch (e) { console.error("[série]", e); toast("Séances suivantes non mises à jour. Réessaie dans un instant."); }
            })}
          />
        );
      })()}
    </>
  );

  return { editRow, createRow, noteCreated, resetCreated, closeEdit, tryDelete, wrapMove, wrapExerciseMove, repeatAlso, modals, createdId };
}
