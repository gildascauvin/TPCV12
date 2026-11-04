"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useExitAnimation } from "@/hooks/useExitAnimation";
import { loadPhysioData, PHYSIO_REVEAL, PHYSIO_REPLAY, type PhysioData, type PhysioRevealDetail, type PhysioReplayDetail } from "@/lib/physioData";
import { heartResultFor, matchWorkout, physioVerdictAt, type HeartResult, type PhysioVerdict, type PhysioWorkout } from "@/lib/physioCompare";
import posthog from "posthog-js";
import type { HealthRow } from "@/lib/deviceWellness";
import { checkinResult, type CheckinResult, type CheckinRow } from "@/lib/checkinInsight";
import { sessionResult, type SessionResult, type ResultSession, type WeekSession } from "@/lib/sessionInsight";
import type { StripCell, Lift } from "@/lib/bilan";
import { loadCheckinContext, loadSessionContext, type TodaySession } from "@/lib/resultContext";
import MiniBilan, { miniCard } from "@/components/physio/MiniBilan";
import { sessionSlides, wellnessSlides } from "@/components/physio/miniSlides";
import { createClient } from "@/lib/supabase/client";

/* Écran de résultat (2026-10-22) : après CHAQUE point forme et CHAQUE séance notée, pour tous, montre ou
   pas. Point forme : score, zone, un insight (checkinInsight.ts) et les 5 premiers matins ; séance :
   ressentie vs prévu, la décision du matin, sa place dans la semaine (sessionInsight.ts). La
   comparaison au cœur / à la nuit (ci-dessous, déjà en prod) s'ajoute quand elle existe.

   Fin de formulaire "Ressenti vs physiologie" (2026-10-11). Le tiroir qui vient d'enregistrer
   (Terminer la séance, point forme) se ferme ; cet écran prend le relais avec la comparaison, la note
   étant déjà figée en base. Monté une fois dans le layout de l'app, côté sportif. */

type Shown =
  | { kind: "session"; detail: Extract<PhysioRevealDetail, { kind: "session" }>; result: HeartResult | null; summary?: SessionResult | null; session?: ResultSession | null; week?: WeekSession[]; accounts?: Accounts | null; recal?: RecalNotice | null; workout?: PhysioWorkout | null; before?: WeekSession[] }
  | { kind: "wellness"; date: string; verdict: PhysioVerdict | null; checkin?: CheckinResult | null; row?: CheckinRow | null; history?: CheckinRow[]; todaySession?: TodaySession | null; restDay?: boolean; health?: HealthRow[] };

/* Comptes de l'écran post-séance (2026-10-24) : les 14 derniers conseils jugés, même règle que le bilan. */
export type Accounts = { right: number; judged: number; strip: StripCell[]; lift: Lift };
/* Le rapport jours d'alerte / autres jours (bilan.ts liftOf), en mots. null = pas assez de données. */
export const fr1 = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/* Recalage automatique annoncé dans l'écran post-séance (2026-10-24). */
export type RecalNotice = { dir: "low" | "high"; liftBefore?: number; liftAfter?: number; state: "applied" | "undone" | "saving" };
export async function checkRecalAfter(sessionId: string): Promise<RecalNotice | null> {
  const r = await fetch("/api/autoreg/recal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
  if (!r.ok) throw new Error(`recalage ${r.status}`);
  const j = await r.json() as { applied: { dir: "low" | "high"; liftBefore?: number; liftAfter?: number } | null };
  return j.applied ? { dir: j.applied.dir, liftBefore: j.applied.liftBefore, liftAfter: j.applied.liftAfter, state: "applied" } : null;
}

/* Relecture (2026-10-17) : liste des séances comparées (ou des matins comparés) et position. */
type Nav = { kind: "session" | "wellness"; keys: string[]; idx: number; data: PhysioData | null; editKey: string; onEdit?: () => void; userId: string };

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const DAYS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
const dateFr = (iso: string) => { const d = new Date(iso + "T12:00:00"); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };

function replayKeys(kind: Nav["kind"], data: PhysioData): string[] {
  if (kind === "session") {
    return data.sessions.filter(s => data.heart[s.id]?.kind === "ok").sort((a, b) => a.date.localeCompare(b.date)).map(s => s.id);
  }
  const checkins = data.checkins.filter(c => c.bedtime != null);
  return checkins.filter(c => physioVerdictAt(c.date, c, checkins, data.health)).map(c => c.date).sort();
}


/* Relecture (2026-10-22) : le même écran que juste après la saisie (résultat + comparaison physio si
   elle existe), pour n'importe quelle séance notée ou n'importe quel matin, montre ou pas. */
async function buildShown(kind: Nav["kind"], key: string, data: PhysioData | null, userId: string): Promise<Shown | null> {
  if (kind === "session") {
    const ctx = await loadSessionContext(userId, key).catch(() => null);
    const s = ctx?.session;
    const heart = data?.heart[key];
    const result = heart && heart.kind === "ok" ? heart : null;
    const summary = s ? sessionResult(s, ctx!.week) : null;
    if (!s || (!result && !summary)) return null;
    const workout = data ? matchWorkout({ date: s.date, duration: s.duration }, data.workouts) : null;
    return { kind: "session", detail: { kind: "session", sessionId: key, date: s.date, rpe: s.rpe, duration: s.duration ?? 0 }, result, summary, session: s, week: ctx!.week, before: ctx!.before, workout };
  }
  const ctx = await loadCheckinContext(userId, key).catch(() => null);
  const checkins = data?.checkins.filter(c => c.bedtime != null) ?? [];
  const c = checkins.find(x => x.date === key);
  const verdict = c && data ? physioVerdictAt(key, c, checkins, data.health, "athlete", ctx?.restDay ?? false) : null;
  const checkin = ctx?.today ? checkinResult(ctx.today, ctx.history, ctx.sessions, ctx.tomorrowDifficulty, ctx.form, ctx.restDay) : null;
  if (!verdict && !checkin) return null;
  return { kind: "wellness", date: key, verdict, checkin, row: ctx?.today ?? null, history: ctx?.history ?? [], todaySession: ctx?.todaySession ?? null, restDay: ctx?.restDay ?? false, health: data?.health ?? [] };
}

/* userId absent (onboarding, compte créé en cours de parcours) : résolu à l'ouverture. */
export default function PhysioRevealHost({ userId: userIdProp }: { userId?: string }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [nav, setNav] = useState<Nav | null>(null);
  const [sport, setSport] = useState<string | null>(null);
  const router = useRouter();

  /* Sport du sportif : la photo des slides séance (même image que son onboarding et son bilan). */
  const sportFor = useRef<string | null>(null);
  const loadSport = (userId: string) => {
    if (sportFor.current === userId) return;
    sportFor.current = userId;
    createClient().from("profiles").select("sport").eq("user_id", userId).maybeSingle()
      .then(({ data, error }) => { if (error) console.error("[mini bilan] sport", error.message); setSport((data as { sport?: string | null } | null)?.sport ?? null); });
  };

  useEffect(() => {
    const onReveal = async (e: Event) => {
      const detail = (e as CustomEvent<PhysioRevealDetail>).detail;
      const userId = userIdProp ?? (await createClient().auth.getUser()).data.user?.id;
      if (!userId) return;
      loadSport(userId);
      if (detail.kind === "session") {
        const [data, ctx] = await Promise.all([
          loadPhysioData(userId, true).catch(() => null),
          loadSessionContext(userId, detail.sessionId).catch(() => null),
        ]);
        const history = data?.sessions.filter(s => s.id !== detail.sessionId) ?? [];
        const result = data ? heartResultFor({ date: detail.date, duration: detail.duration, rpe: detail.rpe }, history, data.workouts) : null;
        const summary = ctx?.session ? sessionResult(ctx.session, ctx.week) : null;
        if (!result && !summary) return;
        setNav(null);
        const workout = data ? matchWorkout({ date: detail.date, duration: detail.duration }, data.workouts) : null;
        setShown({ kind: "session", detail, result, summary, session: ctx?.session ?? null, week: ctx?.week ?? [], before: ctx?.before ?? [], workout });
        posthog.capture("session_result_shown", { rows: summary?.rows.length ?? 0, heart: result ? (result.kind === "ok" ? result.verdict : "calibrating") : null });
        if (result) posthog.capture("physio_reveal_shown", { kind: "session", result: result.kind === "ok" ? result.verdict : "calibrating" });
      } else {
        const [data, ctx] = await Promise.all([
          loadPhysioData(userId, true).catch(() => null),
          loadCheckinContext(userId, detail.date).catch(() => null),
        ]);
        const verdict = data ? physioVerdictAt(detail.date, detail, data.checkins, data.health, "athlete", ctx?.restDay ?? false) : null;
        const checkin = ctx?.today ? checkinResult(ctx.today, ctx.history, ctx.sessions, ctx.tomorrowDifficulty, ctx.form, ctx.restDay) : null;
        if (!verdict && !checkin) return;
        setNav(null);
        setShown({ kind: "wellness", date: detail.date, verdict, checkin, row: ctx?.today ?? null, history: ctx?.history ?? [], todaySession: ctx?.todaySession ?? null, restDay: ctx?.restDay ?? false, health: data?.health ?? [] });
        posthog.capture("checkin_result_shown", { day: checkin?.day ?? null, relative: checkin?.relative ?? null, physio: verdict?.kind ?? null });
        if (verdict) posthog.capture("physio_reveal_shown", { kind: "wellness", result: verdict.kind });
      }
    };
    const onReplay = async (e: Event) => {
      const detail = (e as CustomEvent<PhysioReplayDetail>).detail;
      const userId = userIdProp ?? (await createClient().auth.getUser()).data.user?.id;
      if (!userId) return;
      loadSport(userId);
      const data = await loadPhysioData(userId).catch(() => null);
      const key = detail.kind === "session" ? detail.sessionId : detail.date;
      // Flèches entre les éléments comparés à la physio quand celui-ci en fait partie, sinon écran seul.
      const physioKeys = data ? replayKeys(detail.kind, data) : [];
      const keys = physioKeys.includes(key) ? physioKeys : [key];
      const next: Nav = { kind: detail.kind, keys, idx: keys.indexOf(key), data, editKey: key, onEdit: detail.onEdit, userId };
      const s = await buildShown(detail.kind, key, data, userId);
      if (!s) { detail.onEdit?.(); return; }
      setNav(next); setShown(s);
      posthog.capture("physio_replay_opened", { kind: detail.kind });
    };
    window.addEventListener(PHYSIO_REVEAL, onReveal);
    window.addEventListener(PHYSIO_REPLAY, onReplay);
    return () => { window.removeEventListener(PHYSIO_REVEAL, onReveal); window.removeEventListener(PHYSIO_REPLAY, onReplay); };
  }, [userIdProp]);

  /* Comptes chargés après l'affichage (l'écran n'attend pas) : seulement s'il y a un verdict. */
  const accountsKey = shown?.kind === "session" && shown.summary?.outcome && shown.accounts === undefined ? shown.session?.id ?? null : null;
  useEffect(() => {
    if (!accountsKey) return;
    let alive = true;
    (async () => {
      const uid = userIdProp ?? (await createClient().auth.getUser()).data.user?.id;
      if (!uid) return;
      // Recalage d'abord (il change les seuils), puis les comptes.
      const rc = await checkRecalAfter(accountsKey).catch(e => { console.error("[résultat séance] recalage", e); return null; });
      if (rc) posthog.capture("autoreg_recalibrated", { dir: rc.dir, source: "auto", lift_before: rc.liftBefore, lift_after: rc.liftAfter });
      // Les comptes ne s'affichent plus après la séance (slide « ThePerfClub apprend » retirée le 2026-11-04).
      if (alive) setShown(cur => cur && cur.kind === "session" && cur.session?.id === accountsKey ? { ...cur, accounts: null, recal: rc } : cur);
    })();
    return () => { alive = false; };
  }, [accountsKey, userIdProp]);
  // Fermeture animée (fond, Fermer) ; « Modifier » enchaîne sans animation.
  const { close: dismiss, exitClass } = useExitAnimation(() => { setShown(null); setNav(null); });

  if (!shown) return null;
  const close = () => { setShown(null); setNav(null); };
  const undoRecal = async () => {
    if (shown.kind !== "session" || !shown.recal) return;
    const id = shown.session?.id;
    setShown(cur => cur && cur.kind === "session" && cur.recal ? { ...cur, recal: { ...cur.recal, state: "saving" } } : cur);
    const r = await fetch("/api/autoreg/recal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undo: true }) }).catch(() => null);
    if (!r?.ok) { console.error("[résultat séance] annulation recalage", r?.status); setShown(cur => cur && cur.kind === "session" && cur.recal ? { ...cur, recal: { ...cur.recal, state: "applied" } } : cur); return; }
    posthog.capture("autoreg_recalibration_undone", { dir: shown.recal.dir });
    setShown(cur => cur && cur.kind === "session" && cur.session?.id === id && cur.recal ? { ...cur, recal: { ...cur.recal, state: "undone" } } : cur);
  };
  /* « J'ai allégé sans le noter » : le réalisé corrigé en base, le verdict et les comptes recalculés. */
  const correct = async (followed: boolean | null) => {
    if (shown.kind !== "session" || !shown.session) return;
    const ss = shown.session;
    const r = await fetch("/api/sessions/followed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: ss.id, followed }) }).catch(() => null);
    if (!r?.ok) { console.error("[résultat séance] correction", r?.status); return; }
    const next = { ...ss, autoreg_followed: followed };
    posthog.capture("autoreg_followed_corrected", { followed, side: "athlete" });
    setShown(cur => cur && cur.kind === "session" && cur.session?.id === ss.id ? { ...cur, session: next, summary: sessionResult(next, cur.week ?? []) } : cur);
  };
  const go = async (delta: number) => {
    if (!nav) return;
    const idx = nav.idx + delta;
    if (idx < 0 || idx >= nav.keys.length) return;
    const next = { ...nav, idx };
    const s = await buildShown(nav.kind, nav.keys[idx], nav.data, nav.userId);
    if (s) { setNav(next); setShown(s); }
  };
  const canEdit = !!nav?.onEdit && nav.keys[nav.idx] === nav.editKey;
  let navTitle: string | null = null;
  if (nav) {
    const key = nav.keys[nav.idx];
    if (nav.kind === "session") {
      const s = nav.data?.sessions.find(x => x.id === key);
      navTitle = s ? `${dateFr(s.date)}${s.name ? ` · ${s.name}` : ""}` : null;
    } else navTitle = `${dateFr(key)} · point forme`;
  }

  /* Mini bilan plein écran (2026-11-04) : les textes du calcul (mean) restent, la mise en forme change. */
  let mean = "";
  if (shown.kind === "session" && shown.result?.kind === "ok") {
    const v = shown.result.verdict;
    mean = v === "harder" ? "Quand ça se répète, c'est souvent de la fatigue qui s'installe : surveille ta récupération ces prochains jours."
      : v === "easier" ? "Signe de forme, ou effort sous-estimé. La charge retenue reste ton ressenti."
      : "Séance encaissée comme d'habitude, rien à signaler.";
  } else if (shown.kind === "wellness" && shown.verdict) {
    const v = shown.verdict;
    mean = v.kind === "less" ? "Vas-y progressivement aujourd'hui : ton ressenti est bon, mais ta nuit dit le contraire."
      : v.kind === "more" ? v.reason ?? "" : "Tes deux signaux vont dans le même sens : tu peux te fier à ce que tu ressens.";
  }
  const date = shown.kind === "session" ? shown.detail.date : shown.date;
  const alt = Math.floor(Date.parse(date + "T12:00:00Z") / 86400000) % 2 === 1;
  const slides = shown.kind === "wellness"
    ? wellnessSlides({ date: shown.date, checkin: shown.checkin ?? null, verdict: shown.verdict, mean, row: shown.row ?? null, history: shown.history ?? [], todaySession: shown.todaySession ?? null, restDay: shown.restDay ?? false, health: shown.health ?? [] }, sport)
    : sessionSlides({
        session: shown.session ?? null, summary: shown.summary ?? null, result: shown.result, mean, week: shown.week ?? [], before: shown.before ?? [], workout: shown.workout ?? null,
        extras: shown.summary ? <SessionExtras r={shown.summary} onCorrect={correct} /> : null,
        recal: shown.recal ? <RecalNote recal={shown.recal} onUndo={undoRecal} /> : null,
      }, sport);
  if (!slides.length) return null;
  const toToday = shown.kind === "wellness" && slides[slides.length - 1].key === "seance";
  const editBtn = canEdit ? (
    <button onClick={() => { const fn = nav?.onEdit; close(); fn?.(); }}
      style={{ height: 46, borderRadius: 14, border: "1px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
      {shown.kind === "session" ? "Modifier ma note" : "Modifier mes réponses"}
    </button>
  ) : null;
  return (
    <MiniBilan
      slides={slides} title={shown.kind === "session" ? "FIN DE SÉANCE" : "POINT FORME"} alt={alt}
      onClose={dismiss} exitClass={exitClass} actions={editBtn}
      nav={nav && nav.keys.length > 1 ? {
        label: navTitle ?? "", sub: nav.kind === "session" ? `Séance ${nav.idx + 1} sur ${nav.keys.length} comparées` : `Matin ${nav.idx + 1} sur ${nav.keys.length}`,
        prev: nav.idx > 0 ? () => go(-1) : null, next: nav.idx < nav.keys.length - 1 ? () => go(1) : null,
      } : null}
      lastLabel={toToday ? "Voir ma séance" : "Fermer"}
      onLast={toToday ? () => { close(); if (window.location.pathname !== "/today") router.push("/today"); } : undefined}
      onSlide={(key, index) => posthog.capture("mini_bilan_slide_viewed", { kind: shown.kind, slide: key, index, slides: slides.length })}
    />
  );
}

/* Fin de séance, en sombre : ce que le texte a changé et le lien de correction du réalisé (aussi côté coach, CoachResultHost). */
export function SessionExtras({ r, onCorrect }: { r: SessionResult; onCorrect?: (followed: boolean | null) => void }) {
  const changes = r.changes ?? [];
  if (!r.rows.length && !changes.length && !r.correct) return null;
  return (
    <div style={{ ...miniCard, gap: 10 }}>
      {r.rows.map(row => (
        <div key={row.text} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.4, color: "rgba(255,255,255,.85)" }}>
          <span style={{ width: 18, flexShrink: 0, textAlign: "center", fontWeight: 800 }}>{row.icon}</span><span>{row.text}</span>
        </div>
      ))}
      {changes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: "var(--font-mono), monospace", fontSize: 11.5, lineHeight: 1.45, color: "rgba(255,255,255,.75)", paddingLeft: 28 }}>
          {changes.map((c, i) => <div key={i}>{c.before && <span style={{ textDecoration: "line-through", color: "rgba(255,255,255,.45)" }}>{c.before}</span>}{c.before && c.after ? " → " : ""}{c.after && <span style={{ color: "#ffb08a", fontWeight: 700 }}>{c.after}</span>}</div>)}
        </div>
      )}
      {r.correct && onCorrect && (
        <button type="button" onClick={() => onCorrect(r.correct!.followed)} style={{ alignSelf: "flex-start", marginLeft: 28, background: "none", border: 0, padding: 0, fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "#ffb08a", textDecoration: "underline", cursor: "pointer" }}>{r.correct.label}</button>
      )}
    </div>
  );
}

/* `subject` côté coach : « Seuil de Léa recalé », sans « Annuler » (le sportif garde l'annulation). */
export function RecalNote({ recal, onUndo, subject }: { recal: RecalNotice; onUndo?: () => void; subject?: string }) {
  return (
    <div style={{ ...miniCard, gap: 6, border: "1px solid rgba(159,240,173,.35)" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#9ff0ad" }}>{recal.state === "undone" ? "Recalage annulé" : subject ? `Seuil de ${subject} recalé` : "Seuil recalé"}</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.4, color: "rgba(255,255,255,.8)" }}>{recal.state === "undone"
        ? "Les seuils d'avant sont rétablis. Ce recalage ne sera pas reproposé."
        : `${recal.dir === "low" ? "Les alertes d'allègement seront plus rares, réservées aux signaux nets." : "Pousser sera proposé moins souvent."}${recal.liftBefore != null && recal.liftAfter != null ? ` Sur l'historique, les jours de conseil donnaient raison ${fr1(recal.liftBefore)} fois plus souvent que les autres jours ; ${fr1(recal.liftAfter)} fois avec ce réglage.` : ""}`}</div>
      {recal.state !== "undone" && onUndo && (
        <button type="button" onClick={onUndo} disabled={recal.state === "saving"} style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "#ffb08a", textDecoration: "underline", cursor: "pointer" }}>{recal.state === "saving" ? "…" : "Annuler"}</button>
      )}
    </div>
  );
}

