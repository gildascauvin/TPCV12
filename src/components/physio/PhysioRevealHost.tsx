"use client";

import { useEffect, useState } from "react";
import { RADIUS } from "@/lib/theme";
import { loadPhysioData, PHYSIO_REVEAL, PHYSIO_REPLAY, type PhysioData, type PhysioRevealDetail, type PhysioReplayDetail } from "@/lib/physioData";
import { HEART_CALIBRATION, HEART_FAMILY_LABEL, heartResultFor, physioVerdictAt, type HeartResult, type PhysioVerdict } from "@/lib/physioCompare";
import posthog from "posthog-js";
import { deviceInputsFor, type HealthRow } from "@/lib/deviceWellness";
import { checkinResult, recoveryGauge, type CheckinResult } from "@/lib/checkinInsight";
import { sessionResult, type SessionResult } from "@/lib/sessionInsight";
import { loadCheckinContext, loadSessionContext } from "@/lib/resultContext";
import AggregateGauge from "@/components/conseils/AggregateGauge";
import { DARK_CARD_BG } from "@/lib/theme";
import { createClient } from "@/lib/supabase/client";

/* Écran de résultat (2026-10-22) : après CHAQUE check-in et CHAQUE séance notée, pour tous, montre ou
   pas. Check-in : score, zone, un insight (checkinInsight.ts) et les 5 premiers matins ; séance :
   ressentie vs prévu, la décision du matin, sa place dans la semaine (sessionInsight.ts). La
   comparaison au cœur / à la nuit (ci-dessous, déjà en prod) s'ajoute quand elle existe.

   Fin de formulaire "Ressenti vs physiologie" (2026-10-11). Le tiroir qui vient d'enregistrer
   (Terminer la séance, check-in) se ferme ; cet écran prend le relais avec la comparaison, la note
   étant déjà figée en base. Monté une fois dans le layout de l'app, côté sportif. */

type Shown =
  | { kind: "session"; detail: Extract<PhysioRevealDetail, { kind: "session" }>; result: HeartResult | null; summary?: SessionResult | null }
  | { kind: "wellness"; verdict: PhysioVerdict | null; night: string | null; checkin?: CheckinResult | null };

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
    return { kind: "session", detail: { kind: "session", sessionId: key, date: s.date, rpe: s.rpe, duration: s.duration ?? 0 }, result, summary };
  }
  const ctx = await loadCheckinContext(userId, key).catch(() => null);
  const checkins = data?.checkins.filter(c => c.bedtime != null) ?? [];
  const c = checkins.find(x => x.date === key);
  const verdict = c && data ? physioVerdictAt(key, c, checkins, data.health) : null;
  const checkin = ctx?.today ? checkinResult(ctx.today, ctx.history, ctx.sessions, ctx.tomorrowDifficulty, ctx.form) : null;
  if (!verdict && !checkin) return null;
  return { kind: "wellness", verdict, night: data && verdict ? nightSentence(key, data.health) : null, checkin };
}

/* userId absent (onboarding, compte créé en cours de parcours) : résolu à l'ouverture. */
export default function PhysioRevealHost({ userId: userIdProp }: { userId?: string }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [nav, setNav] = useState<Nav | null>(null);

  useEffect(() => {
    const onReveal = async (e: Event) => {
      const detail = (e as CustomEvent<PhysioRevealDetail>).detail;
      const userId = userIdProp ?? (await createClient().auth.getUser()).data.user?.id;
      if (!userId) return;
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
        setShown({ kind: "session", detail, result, summary });
        posthog.capture("session_result_shown", { rows: summary?.rows.length ?? 0, heart: result ? (result.kind === "ok" ? result.verdict : "calibrating") : null });
        if (result) posthog.capture("physio_reveal_shown", { kind: "session", result: result.kind === "ok" ? result.verdict : "calibrating" });
      } else {
        const [data, ctx] = await Promise.all([
          loadPhysioData(userId, true).catch(() => null),
          loadCheckinContext(userId, detail.date).catch(() => null),
        ]);
        const verdict = data ? physioVerdictAt(detail.date, detail, data.checkins, data.health) : null;
        const checkin = ctx?.today ? checkinResult(ctx.today, ctx.history, ctx.sessions, ctx.tomorrowDifficulty, ctx.form) : null;
        if (!verdict && !checkin) return;
        setNav(null);
        setShown({ kind: "wellness", verdict, night: data && verdict ? nightSentence(detail.date, data.health) : null, checkin });
        posthog.capture("checkin_result_shown", { day: checkin?.day ?? null, relative: checkin?.relative ?? null, physio: verdict?.kind ?? null });
        if (verdict) posthog.capture("physio_reveal_shown", { kind: "wellness", result: verdict.kind });
      }
    };
    const onReplay = async (e: Event) => {
      const detail = (e as CustomEvent<PhysioReplayDetail>).detail;
      const userId = userIdProp ?? (await createClient().auth.getUser()).data.user?.id;
      if (!userId) return;
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

  if (!shown) return null;
  const close = () => { setShown(null); setNav(null); };
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
    } else navTitle = `${dateFr(key)} · check-in`;
  }

  let title = "", mean = "", gauge: React.ReactNode = null, extra: string | null = null;
  const hasPhysio = shown.kind === "session" ? !!shown.result : !!shown.verdict;
  if (shown.kind === "session" && shown.result) {
    const r = shown.result;
    if (r.kind === "calibrating") {
      const left = HEART_CALIBRATION - r.have, fam = HEART_FAMILY_LABEL[r.family];
      title = "On apprend encore ton profil";
      mean = `Encore ${left} séance${left > 1 ? "s" : ""}${fam ? ` ${fam}` : ""} avec ta fréquence cardiaque et on pourra comparer ton ressenti à ce qu'elle mesure.`;
    } else {
      if (r.verdict === "harder") { title = "Ta séance t'a paru plus dure que ce qu'a mesuré ta fréquence cardiaque"; mean = "Quand ça se répète, c'est souvent de la fatigue qui s'installe : surveille ta récupération ces prochains jours."; }
      else if (r.verdict === "easier") { title = "Ta fréquence cardiaque a mesuré une séance plus dure que ton ressenti"; mean = "Signe de forme, ou effort sous-estimé. La charge retenue reste ton ressenti."; }
      else { title = "Ton ressenti et ta fréquence cardiaque sont d'accord"; mean = "Séance encaissée comme d'habitude, rien à signaler."; }
      gauge = (
        <TwoMarkGauge
          eyebrow={shown.summary ? "Ressenti vs fréquence cardiaque" : "Difficulté de la séance"}
          track="linear-gradient(90deg,#bfeec8,#ffe0a0 45%,#ffb5a7)"
          a={{ pos: r.rpe * 10, label: `Ressenti · ${diffWord(r.rpe)}`, color: diffColor(r.rpe) }}
          b={{ pos: r.predicted * 10, label: `Mesuré · ${diffWord(r.predicted)}`, color: "#171b1f" }}
          ticks={["Légère", "Modérée", "Dure", "Très dure"]}
        />
      );
    }
  } else if (shown.kind === "wellness" && shown.verdict) {
    const v = shown.verdict;
    if (v.kind === "less") { title = "Tes mesures de la nuit sont moins bonnes que ton ressenti"; mean = "Vas-y progressivement aujourd'hui : ton ressenti est bon, mais ta nuit dit le contraire."; }
    else if (v.kind === "more") { title = "Tes mesures de la nuit sont meilleures que ton ressenti"; mean = "La fatigue ne se voit pas dans ta nuit : le stress ou la motivation, plutôt que les jambes ?"; }
    else { title = "Tes mesures de la nuit confirment ton ressenti"; mean = "Tes deux signaux vont dans le même sens : tu peux te fier à ce que tu ressens."; }
    gauge = (
      <TwoMarkGauge
        eyebrow={shown.checkin ? "Ressenti vs nuit mesurée" : "Ta récupération ce matin"}
        track="linear-gradient(90deg,#cde2fb,#6da7ec 50%,#184f95)"
        normBand
        a={{ pos: zPos(v.zFeel), label: `Ressenti · ${zShort(v.zFeel)}`, color: "#2a78d6" }}
        b={{ pos: zPos(v.zPhysio), label: `Mesuré · ${zShort(v.zPhysio)}`, color: "#171b1f" }}
        ticks={["Moins bien", "Ta norme", "Mieux"]}
      />
    );
    extra = shown.night;
  }

  /* Check-in (2026-10-23, Gildas : « beaucoup trop d'info ») : score, une phrase, le conseil, et la
     nuit mesurée en une ligne. Le détail ressenti vs mesuré reste sur la carte Récupération. */
  const compact = (shown.kind === "wellness" && !!shown.checkin) || (shown.kind === "session" && !!shown.summary);
  // Séance : le cœur en une ligne, seulement s'il apporte quelque chose (calibrage = rien).
  // Sous la jauge à 2 points, une phrase seulement quand ressenti et mesure ne disent pas la même chose.
  const compactNote = shown.kind === "session"
    ? (shown.result?.kind === "ok" && shown.result.verdict !== "agree" ? mean : null)
    : (shown.verdict && shown.verdict.kind !== "agree" ? mean : null);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2147483100, padding: 18 }}
      onClick={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div style={{ background: "#fff", color: "#171b1f", border: "1px solid rgba(0,0,0,.10)", boxShadow: "0 42px 120px rgba(0,0,0,.34)", borderRadius: RADIUS.card, padding: 26, width: "100%", maxWidth: 400, maxHeight: "calc(100dvh - 36px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, animation: "modalIn 0.18s cubic-bezier(0.2,0,0,1)" }}>
        {nav && nav.keys.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <NavArrow dir="prev" disabled={nav.idx === 0} onClick={() => go(-1)} label={nav.kind === "session" ? "Séance précédente" : "Matin précédent"} />
            <div style={{ textAlign: "center", minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{navTitle}</div>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 600, letterSpacing: ".08em", color: "#6b7177", marginTop: 3, textTransform: "uppercase" }}>
                {nav.kind === "session" ? `Séance ${nav.idx + 1} sur ${nav.keys.length} comparées` : `Matin ${nav.idx + 1} sur ${nav.keys.length}`}
              </div>
            </div>
            <NavArrow dir="next" disabled={nav.idx === nav.keys.length - 1} onClick={() => go(1)} label={nav.kind === "session" ? "Séance suivante" : "Matin suivant"} />
          </div>
        )}
        {compact && shown.kind === "wellness" && shown.checkin && (
          <CheckinBlock r={shown.checkin} />
        )}
        {shown.kind === "session" && shown.summary && <SessionBlock r={shown.summary} />}
        {hasPhysio && !compact && (
          <div>
            {shown.kind === "session" && shown.summary && (
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 6 }}>
                Ressenti vs fréquence cardiaque
              </div>
            )}
            <div style={{ fontFamily: "var(--font-display)", fontSize: shown.kind === "session" && shown.summary ? 18 : 23, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.12, textWrap: "balance" }}>{title}</div>
            <div style={{ fontSize: 14, color: "#3d4247", marginTop: 8, lineHeight: 1.45 }}>{mean}</div>
          </div>
        )}
        {gauge && (
          <div style={{ background: "#f7f8f9", borderRadius: RADIUS.block, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {gauge}
            {(compact ? compactNote : extra) && <div style={{ fontSize: 13, color: "#62686e", lineHeight: 1.45 }}>{compact ? compactNote : extra}</div>}
          </div>
        )}
        {hasPhysio && !compact && (
          <div style={{ fontSize: 11.5, color: "#8a8f94", textAlign: "center" }}>
            {shown.kind === "session" ? "Ta note est enregistrée : la comparaison ne la modifie pas." : "Tes réponses sont enregistrées : la comparaison ne les modifie pas."}
          </div>
        )}
        {canEdit ? (
          /* Relecture ouverte par un geste de modification : le formulaire d'origine est à un tap. */
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button
              onClick={() => { const fn = nav?.onEdit; close(); fn?.(); }}
              style={{ height: 46, borderRadius: RADIUS.control, border: "1px solid rgba(0,0,0,.12)", background: "#fff", color: "#171b1f", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
            >
              {shown.kind === "session" ? "Modifier ma note" : "Modifier mes réponses"}
            </button>
            <button
              onClick={close}
              style={{ height: 46, borderRadius: RADIUS.control, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)" }}
            >
              Fermer
            </button>
          </div>
        ) : (
          <button
            onClick={close}
            style={{ height: 46, borderRadius: RADIUS.control, border: "1px solid rgba(212,64,0,.20)", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 10px 24px rgba(212,64,0,.22)" }}
          >
            Fermer
          </button>
        )}
      </div>
    </div>
  );
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const diffWord = (d: number) => (d >= 7.5 ? "Très dure" : d >= 4.5 ? "Dure" : d >= 2.5 ? "Modérée" : "Légère"); // mots de Foster, voir qualitativeDifficulty
const diffColor = (d: number) => (d >= 7.5 ? "#d44000" : d >= 4.5 ? "#e07a00" : "#2f9e44");
// Écart à la norme (en écarts-types) : mêmes seuils que les textes de physioCompare (±0,5).
const zShort = (z: number) => (z <= -0.5 ? "sous ta norme" : z >= 0.5 ? "au-dessus" : "dans ta norme");
const zPos = (z: number) => 50 + clamp(z, -2, 2) * 22;

/* « Tu as dormi 58 min de moins que d'habitude et ta fréquence cardiaque au repos est 4 bpm au-dessus de ta norme. »
   Norme du sommeil = moyenne des nuits mesurées des 28 jours précédents (au moins 5). */
function nightSentence(date: string, health: HealthRow[]): string | null {
  const today = health.find(h => h.date === date);
  const parts: string[] = [];
  const sleep = today?.sleep_minutes;
  if (sleep != null) {
    const prior = health.filter(h => h.date < date && h.sleep_minutes != null).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 28).map(h => Number(h.sleep_minutes));
    if (prior.length >= 5) {
      const ds = Math.round(Number(sleep) - prior.reduce((a, b) => a + b, 0) / prior.length);
      parts.push(Math.abs(ds) < 15 ? "Tu as dormi comme d'habitude" : `Tu as dormi ${Math.abs(ds)} min de ${ds > 0 ? "plus" : "moins"} que d'habitude`);
    }
  }
  const d = deviceInputsFor(date, health);
  if (d.device_resting_hr != null && d.device_rhr_baseline != null) {
    const dr = Math.round(Number(d.device_resting_hr) - Number(d.device_rhr_baseline));
    const fc = Math.abs(dr) < 2 ? "ta fréquence cardiaque au repos est dans ta norme" : `ta fréquence cardiaque au repos est ${Math.abs(dr)} bpm ${dr > 0 ? "au-dessus" : "en dessous"} de ta norme`;
    parts.push(parts.length ? fc : fc.charAt(0).toUpperCase() + fc.slice(1));
  }
  return parts.length ? `${parts.join(" et ")}.` : null;
}

type Mark = { pos: number; label: string; color: string };

/* Une échelle, deux repères (POC A9XZaSXeHW9WW5amXDzEHv) : l'écart entre Ressenti et Mesuré est le message. */
function TwoMarkGauge({ eyebrow, track, a, b, ticks, normBand }: { eyebrow: string; track: string; a: Mark; b: Mark; ticks: string[]; normBand?: boolean }) {
  const pa = clamp(a.pos, 4, 96), pb = clamp(b.pos, 4, 96);
  const pin = (m: Mark, p: number, top: boolean): React.CSSProperties => ({
    position: "absolute", left: `${p}%`, [top ? "top" : "bottom"]: 0,
    // Près d'un bord, l'étiquette s'aligne sur le repère au lieu de déborder de la carte.
    transform: p < 25 ? "translateX(-12px)" : p > 75 ? "translateX(calc(-100% + 12px))" : "translateX(-50%)",
    fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", padding: "3px 8px", borderRadius: RADIUS.pill, color: "#fff", background: m.color,
  });
  const dot = (m: Mark, p: number): React.CSSProperties => ({
    position: "absolute", top: "50%", left: `${p}%`, width: 14, height: 14, borderRadius: "50%", transform: "translate(-50%,-50%)",
    background: m.color, border: "2.5px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.25)",
  });
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8a8f94" }}>{eyebrow}</div>
      <div style={{ position: "relative", padding: "26px 0", margin: "0 6px" }}>
        <span style={pin(a, pa, true)}>{a.label}</span>
        <div style={{ position: "relative", height: 10, borderRadius: RADIUS.pill, background: track }}>
          {normBand && <span style={{ position: "absolute", left: "39%", width: "22%", top: -4, bottom: -4, borderRadius: 6, background: "rgba(255,255,255,.25)", border: "1px dashed rgba(255,255,255,.7)" }} />}
          <span style={{ position: "absolute", top: "50%", height: 4, transform: "translateY(-50%)", left: `${Math.min(pa, pb)}%`, width: `${Math.abs(pa - pb)}%`, background: "repeating-linear-gradient(90deg,#171b1f 0 4px,transparent 4px 7px)" }} />
          <span style={dot(a, pa)} />
          <span style={dot(b, pb)} />
        </div>
        <span style={pin(b, pb, false)}>{b.label}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "#8a8f94" }}>
        {ticks.map(t => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}

function NavArrow({ dir, disabled, onClick, label }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick} disabled={disabled} aria-label={label}
      style={{ width: 44, height: 44, flex: "none", borderRadius: RADIUS.control, border: "1px solid rgba(0,0,0,.10)", background: "#f7f8f9", color: "#171b1f", cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
      </svg>
    </button>
  );
}

/* Résultat du check-in : le score en gros au centre (la jauge ouverte de l'onglet Récupération),
   l'insight, puis les 5 premiers matins en ronds cochés. */
function CheckinBlock({ r }: { r: CheckinResult }) {
  const g = recoveryGauge(r.score);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: DARK_CARD_BG, borderRadius: RADIUS.block, padding: "18px 12px 14px", display: "flex", flexDirection: "column", alignItems: "center", color: "#fff" }}>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)", marginBottom: 6 }}>Ta récupération ce matin</div>
        <AggregateGauge pos={g.pos} band={g.band} bands={g.bands} size={220} />
      </div>
      <div style={{ background: "#f7f8f9", color: "#2b3035", borderRadius: RADIUS.block, padding: "12px 14px", lineHeight: 1.4, fontSize: 14 }}>
        <div>{r.insight}</div>
        {r.advice && <div style={{ marginTop: 6 }}>{r.advice}</div>}
      </div>
      {r.day != null && <NormStreak day={r.day} />}
    </div>
  );
}

function NormStreak({ day }: { day: number }) {
  const text = day >= 5 ? "Ta norme est prête : dès demain, ton score se compare à toi-même."
    : day === 1 ? "Pour l'instant, un repère général. Dès ton 5e matin, on te compare à toi-même."
    : `Encore ${5 - day} matin${5 - day > 1 ? "s" : ""} et ton score se calera sur toi.`;
  return (
    <div style={{ background: "#f7f8f9", borderRadius: RADIUS.block, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8a8f94" }}>
        <span>Matin {Math.min(day, 5)} sur 5</span><span>ta norme</span>
      </div>
      <div style={{ fontSize: 13.5, color: "#3d4247", marginTop: 6, lineHeight: 1.45 }}>{text}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        {[1, 2, 3, 4, 5].map(i => {
          const done = i <= day, today = i === day;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{
                width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14,
                background: done ? "#2a78d6" : "transparent", color: done ? "#fff" : "#a3a8ad",
                border: done ? "none" : "2px dashed rgba(0,0,0,.18)", boxShadow: today ? "0 0 0 3px rgba(42,120,214,.25)" : undefined,
              }}>{done ? "✓" : i}</span>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9, fontWeight: 700, color: today ? "#171b1f" : "#a3a8ad" }}>{today ? "AUJ." : `J${i}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Résultat de séance : ressentie vs prévu, puis au plus 2 lignes (décision du matin, semaine). */
export function SessionBlock({ r }: { r: SessionResult }) {
  const rows = r.rows;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8a8f94" }}>Séance enregistrée</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.12, marginTop: 4 }}>{r.title}</div>
        {r.sub && <div style={{ fontSize: 14, color: "#62686e", marginTop: 6 }}>{r.sub}</div>}
      </div>
      {rows.length > 0 && (
        <div style={{ background: "#f7f8f9", borderRadius: RADIUS.block, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map(row => (
            <div key={row.text} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.4, color: "#2b3035" }}>
              <span style={{ width: 18, flexShrink: 0, textAlign: "center", fontWeight: 800 }}>{row.icon}</span>
              <span>{row.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
