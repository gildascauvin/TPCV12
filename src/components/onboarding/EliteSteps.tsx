"use client";

import TodaySessionCard from "@/components/sessions/TodaySessionCard";
import DayColumn, { WeekSessionCard } from "@/components/calendar/DayColumn";
import type { SessionRingState } from "@/components/calendar/SessionRing";
import type { DayAlert } from "@/lib/alerts";
import { healthAppName, isAndroidApp } from "@/lib/native";
import { useEffect, useRef, useState } from "react";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import HomeSheet from "@/components/today/HomeSheet";
import { createPortal } from "react-dom";
import { flyToken } from "@/lib/flyToken";
import { syntheticBaselineFor } from "@/lib/sandboxFixtures";
import ProgramBanner from "@/components/programs/ProgramBanner";
import { computeAutoregSuggestion, zoneRange, suggestionSeverityColor, autoregHeadline, autoregAdvice, applyAutoregDifficulty } from "@/lib/autoregulation";
import AutoregButtons from "@/components/sessions/AutoregButtons";
import AlertBox from "@/components/calendar/AlertBox";
import FlipBlock from "@/components/today/FlipBlock";
import WellnessRing from "@/components/wellness/WellnessRing";
import { relativeZoneLabel } from "@/lib/wellnessBaseline";
import { WELLNESS_RAMP } from "@/lib/wellness";
import { parseAndApply } from "@/lib/loadAdjust";
import type { Program, ProgramTemplate, Session } from "@/types";

/* Écrans du parcours post-signup Elite (2026-10-17, POC https://claude.ai/artifact/HopwXw7gFnAdRLpB496JvE).
   Contenu seulement : le cadre (QuestionShell), l'état et les écritures vivent dans OnboardingFlow. */

const MUTED = "#6b7177";
const LINE = "rgba(0,0,0,.10)";

/* ── ob_count : la taille du groupe. ── */
export type ObCount = "1-5" | "6-15" | "16-30" | "30+";
export const COUNT_OPTIONS: { value: ObCount; label: string; n: number }[] = [
  { value: "1-5", label: "1 à 5 sportifs", n: 3 },
  { value: "6-15", label: "6 à 15 sportifs", n: 10 },
  { value: "16-30", label: "16 à 30 sportifs", n: 22 },
  { value: "30+", label: "Plus de 30", n: 40 },
];

/* ── ob_health : Apple Santé, juste avant le check-in. Marques en texte, jamais de logos (refus App
   Store possible) : l'icône Santé n'est permise que dans le badge officiel. ── */
const HEALTH_ROWS = [
  { icon: "🌙", label: "Sommeil", hint: "Durée et régularité, chaque nuit" },
  { icon: "♥", label: "Fréquence cardiaque au repos", hint: "Le signal de fatigue le plus fiable" },
  { icon: "〰", label: "VFC", hint: "Ta récupération nerveuse" },
  { icon: "⌚", label: "Entraînements", hint: "Durée de séance pré-remplie" },
];
export function HealthStepBody({ error }: { error?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 14 }}>
        <b style={{ color: "#171b1f" }}>Via {healthAppName()}</b> · {isAndroidApp() ? "Samsung · Pixel Watch" : "Apple Watch"} · Garmin · Whoop · Oura · Polar · Coros · Suunto
      </div>
      {HEALTH_ROWS.map(r => (
        <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 16, border: `1px solid ${LINE}`, background: "#fff", marginBottom: 8 }}>
          <span style={{ width: 34, height: 34, borderRadius: 999, background: "rgba(212,64,0,.08)", color: "#d44000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{r.icon}</span>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <b style={{ fontSize: 15 }}>{r.label}</b>
            <span style={{ fontSize: 13, color: MUTED }}>{r.hint}</span>
          </span>
        </div>
      ))}
      <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, marginTop: 12 }}>30 jours d&apos;historique relus : analyses dès aujourd&apos;hui. Tes données ne sont jamais revendues ni utilisées pour de la publicité.</p>
      {error && <p style={{ fontSize: 13, color: "#b42318", marginTop: 8 }}>{error}</p>}
    </div>
  );
}

/* ── ob_week : l'aperçu du programme (2026-10-27, POC https://claude.ai/artifact/LeydVcBfSZF8osutKTvNWu).
   Bannière, simulateur de forme de /p/ (même rampe, même vocabulaire de zone) calé sur son vrai
   point forme, puis ses séances de la semaine en cartes complètes, recalculées au glisser. ── */
export interface WeekSession { id: string; date: string; name: string; notes: string | null; target_difficulty: number | null }
const WELLNESS_TRACK_GRADIENT = `linear-gradient(to right, ${WELLNESS_RAMP.map(x => `${x.hex} ${x.stop * 100}%`).join(", ")})`;

function dayLabel(date: string, today: string): string {
  if (date === today) return "Aujourd'hui";
  const d = new Date(`${date}T12:00:00`);
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* Un jour de l'aperçu = une colonne du Planning (06/11, Gildas : mêmes composants que le Planning, la date,
   l'anneau, le titre de séance, les exercices). En-tête DayColumnHeader + carte WeekSessionCard, lecture seule. */
function PlanningDayPreview({ s, today, planned, ring, alert, adjustPct }: {
  s: WeekSession; today: string; planned: number; ring?: SessionRingState | null; alert?: DayAlert; adjustPct?: number | null;
}) {
  const session = { id: s.id, date: s.date, name: s.name, notes: s.notes, duration: null, rpe: null, done: false, target_difficulty: planned };
  return (
    <DayColumn date={new Date(`${s.date}T12:00:00`)} sessions={[session]} todayStr={today} wellness={null} hideAddSession
      ringState={ring} alert={alert}
      onAddSession={() => {}} onComplete={() => {}} onEdit={() => {}} onWellness={() => {}}
      columnStyle={{ color: "#171b1f" }}
      renderSession={c => <WeekSessionCard key={c.id} session={c} hideActions adjustPct={adjustPct ?? null} onComplete={() => {}} onEdit={() => {}} cardStyle={{ cursor: "default" }} />} />
  );
}

/* POC 2026-10-28 : son programme tel qu'il est, avant le check-in. Séances de la 1re semaine, sans aucun
   ajustement : le titre de l'écran dit qu'il ne sait pas encore comment il se sent. */
export function PlannedWeekBody({ sessions, program, today }: {
  sessions: WeekSession[];
  program: { name: string; sport: string; template: ProgramTemplate };
  today: string;
}) {
  // Toute sa première semaine, comme l'aperçu de prod (les 7 prochains jours).
  const end = new Date(`${today}T12:00:00`); end.setDate(end.getDate() + 6);
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const week = sessions.filter(s => s.target_difficulty !== 0 && s.date <= endStr);
  return (
    <div>
      <div style={{ margin: "0 -20px 8px" }}>
        <ProgramBanner program={{ id: "", name: program.name, sport: program.sport, weeks_count: program.template.weeks.length, template: program.template } as unknown as Program} currentWeek={0} acclimatation={false} />
      </div>
      {week.map(s => (
        <div key={s.id} style={{ marginBottom: 12 }}>
          <PlanningDayPreview s={s} today={today} planned={s.target_difficulty ?? 5} />
        </div>
      ))}
    </div>
  );
}

/* decide (POC 2026-10-28) : plus de curseur « Simule ta forme ». Sa séance du jour passe en tête avec la
   jauge de décision de /today (AutoregButtons en anneau, la primitive), calée sur son vrai check-in ; il
   décide lui-même. La suite de la semaine dessous, recalculée sur la même forme. subject : côté coach,
   la séance de son sportif (« Sa forme », « sa semaine »). */
/* Sous l'anneau de ob_week (2026-10-31, chantier douleur) : le soulagement, en image vécue, à la place du
   conseil technique (la jauge et la séance barrée le montrent déjà). */
export function reliefLine(dir: "low" | "high", subject?: string): string {
  if (subject) return dir === "low" ? `Tu protèges ${subject} aujourd'hui, pour pousser les bons jours.` : `Tu pousses ${subject} sans hésiter : sa forme le permet aujourd'hui.`;
  return dir === "low" ? "Tu allèges aujourd'hui sans culpabiliser. Tu pousseras les bons jours." : "Tu pousses sans hésiter : ta forme le permet aujourd'hui.";
}

export function WeekStepBody({ sessions, program, checkinScore, acclimatation, today, decide = false, subject, onDecided }: {
  /* Décision prise (Appliquer ou Maintenir), une fois l'animation finie : la note native s'ouvre par-dessus cet écran (08/11). */
  onDecided?: () => void;
  sessions: WeekSession[];
  program: { name: string; sport: string; template: ProgramTemplate } | null;
  checkinScore: number | null;
  acclimatation: boolean;
  today: string;
  decide?: boolean;
  subject?: string;
}) {
  const start = checkinScore ?? 60;
  const [sim, setSim] = useState(start);
  const [moved, setMoved] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  /* Séance après sa décision, comme /today une fois la séance enregistrée : notes réécrites et nouvelle
     difficulté. La jauge reçoit cette difficulté, c'est donc le curseur qui rejoint la zone. */
  const [cur, setCur] = useState<{ notes: string | null; target_difficulty: number } | null>(null);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  /* Célébration comme /today (2026-11-06) : la séance montre l'avant/après quelques secondes et l'écart
     part du curseur de l'anneau jusqu'à elle. */
  const [flash, setFlash] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  /* Mobile : la séance dans la feuille du bas, comme l'Accueil (06/11, Gildas) ; elle monte à la décision. */
  const { isMd } = useBreakpoint();
  const [sheetH, setSheetH] = useState(0);
  const headRef = useRef<HTMLDivElement>(null);
  const sheetTouched = useRef(false);
  /* Feuille ouverte par défaut autant que possible sans recouvrir l'anneau ni le conseil (06/11, Gildas). */
  useEffect(() => {
    if (isMd) return;
    const fit = () => {
      const el = headRef.current; if (!el || sheetTouched.current) return;
      const bottomBar = 84 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sab")) || 0);
      setSheetH(Math.max(0, Math.round(window.innerHeight - bottomBar - el.getBoundingClientRect().bottom - 12)));
    };
    const t = window.setTimeout(fit, 700);
    const ro = new ResizeObserver(fit); if (headRef.current) ro.observe(headRef.current);
    return () => { window.clearTimeout(t); ro.disconnect(); };
  }, [isMd]);
  const base = syntheticBaselineFor(sim);
  // Les 7 prochains jours : sa première semaine.
  const end = new Date(`${today}T12:00:00`); end.setDate(end.getDate() + 6);
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const week = sessions.filter(s => s.target_difficulty !== 0 && s.date <= endStr).map(s => {
    const planned = s.target_difficulty ?? 5;
    return { s, planned, sug: computeAutoregSuggestion(sim, planned, base) };
  });
  const impacted = week.filter(w => w.sug);
  const head = decide ? week[0] : null;
  /* decide : la séance du jour seule, la suite de la semaine est déjà passée à l'écran du programme. */
  const rest = decide ? [] : week;
  const firstName = (d: string) => dayLabel(d, today).split(" ")[0];
  return (
    <div>
      {program && !decide && (
        <div style={{ margin: "0 -20px 8px" }}>
          <ProgramBanner
            program={{ id: "", name: program.name, sport: program.sport, weeks_count: program.template.weeks.length, template: program.template } as unknown as Program}
            currentWeek={acclimatation ? -1 : 0} acclimatation={acclimatation} dark
          />
        </div>
      )}
      {head && (() => {
        const { s, planned, sug } = head;
        const color = sug ? suggestionSeverityColor(sug) : null;
        const shown = cur ?? { notes: s.notes, target_difficulty: planned };
        const todayCard = (
          <TodaySessionCard hideGauge authorName="Toi" onEdit={() => {}}
            session={{ id: s.id, user_id: "", date: s.date, name: s.name, notes: shown.notes, target_difficulty: shown.target_difficulty, duration: null, rpe: null, done: false, created_at: "" } as unknown as Session}
            previewPct={applied != null ? null : preview || null}
            flashOriginal={flash && applied ? s.notes : null} />
        );
        return (
          <div style={{ marginBottom: 22 }}>
            {/* Plus de ligne « Aujourd'hui · Ta forme ce matin » : le texte sous l'anneau la dit déjà. */}
            {/* La jauge toujours là, comme /today : avec une reco (Alléger / Surcharger), sinon en mode
                libre (forme dans la zone, ou point forme passé) où il peut quand même la bouger. */}
            <div ref={headRef} style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
                <AutoregButtons demo notes={shown.notes} sessionId={`ob-week-${s.id}`} advice="" sessionLabel={s.name}
                  dir={sug?.dir} reco={sug?.reco}
                  plannedDifficulty={shown.target_difficulty} onPreviewChange={setPreview} shape="ring" ringFluid ringGlow={color ?? undefined} actionsSlot={slot}
                  severityColor={color ?? undefined} isActive
                  onApply={async pct => {
                    // Même réécriture que /today (TodayClient, onApply).
                    setApplied(pct);
                    if (pct) {
                      setFlash(true);
                      if (!isMd) setSheetH(Math.round(window.innerHeight * 0.55));
                      /* Un jeton par ligne changée, comme /today. */
                      window.setTimeout(() => {
                        const k = document.querySelector("[data-ring-knob]"), lines = cardRef.current ? Array.from(cardRef.current.querySelectorAll("[data-ex-line='changed']")) : [];
                        if (!k) return;
                        (lines.length ? lines : cardRef.current ? [cardRef.current] : []).forEach((el, n) => window.setTimeout(() => flyToken(k, el, `${pct < 0 ? "−" : "+"}${Math.abs(Math.round(pct))} %`, pct < 0 ? "#d44000" : "#2f9e44"), n * 380));
                      }, 1050); /* au relâchement de l'essaim (retour à l'équilibre, 08/11) */
                      window.setTimeout(() => setFlash(false), 6000);
                    }
                    /* Après l'atterrissage des jetons (relâchement 1,05 s + un jeton par ligne). */
                    window.setTimeout(() => onDecided?.(), pct ? 3200 : 800);
                    setCur({ notes: s.notes ? s.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : s.notes, target_difficulty: applyAutoregDifficulty(planned, pct) });
                    return { notes: s.notes ?? "", target_difficulty: planned };
                  }}
                  onUndo={async () => { setApplied(null); setCur(null); setFlash(false); }}
                  onMaintenir={() => { setApplied(0); window.setTimeout(() => onDecided?.(), 800); }} />
              </div>
              {/* Comme /today depuis le 2026-10-28 : anneau en grand, titre au centre, plus d'encart. */}
              {/* Même carte que /today (06/11) : surface légère, étiquette, boutons sous le conseil. Pas de dos : rien ne pivote. */}
              <FlipBlock
                frontLabel={subject ? `Conseil pour ${subject}` : "Conseil du jour"}
                front={<AlertBox variant="bare"
                  alert={{ border: `${color ?? "#ffffff"}66`, glow: color ?? "#ffffff", text: sug
                    ? `${autoregHeadline(sug.dir)}\n${reliefLine(sug.dir, subject)}`
                    : subject ? `Dans sa zone\nLa forme de ${subject} aujourd'hui colle à la séance prévue : garde-la telle quelle.` : "Dans ta zone\nTa forme du jour colle à la séance prévue : garde-la telle quelle." }} />}
                actions={<div ref={setSlot} className="autoreg-slot" style={{ marginTop: 4 }} />} />
            </div>
            {isMd ? (
            <div ref={cardRef} className={flash ? "tpc-line-flash" : undefined} style={{ marginTop: isMd ? 12 : 0, borderRadius: 18 }}>
              {/* Comme /today : barré tant qu'il n'a pas validé, puis la séance réécrite telle quelle (avant/après
                  visible quelques secondes juste après la décision). */}
              {/* Même carte que /today (06/11, Gildas) : TodaySessionCard sans jauge, la décision est dans l'anneau. */}
              {todayCard}
            </div>
            ) : (
              <>
              {/* Place pour la feuille repliée : le conseil et ses boutons ne passent jamais dessous. */}
              <div aria-hidden style={{ height: 120 }} />
              {typeof document !== "undefined" && createPortal(<HomeSheet height={sheetH} onHeightChange={h => { sheetTouched.current = true; setSheetH(h); }} bottom="calc(84px + env(safe-area-inset-bottom, 0px))" contentKey={flash ? "flash" : "card"}>
                <div style={{ padding: "0 14px 14px" }}>
            <div ref={cardRef} className={flash ? "tpc-line-flash" : undefined} style={{ marginTop: isMd ? 12 : 0, borderRadius: 18 }}>
              {/* Comme /today : barré tant qu'il n'a pas validé, puis la séance réécrite telle quelle (avant/après
                  visible quelques secondes juste après la décision). */}
              {/* Même carte que /today (06/11, Gildas) : TodaySessionCard sans jauge, la décision est dans l'anneau. */}
              {todayCard}
            </div>
                </div>
              </HomeSheet>, document.body)}
              </>
            )}
          </div>
        );
      })()}
      {!decide && <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(23,27,31,.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: "13px 14px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "rgba(255,255,255,.65)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {checkinScore != null && !moved ? "Ta forme du jour" : "Simule ta forme"}
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.45)", marginTop: 2 }}>Glisse pour voir ta semaine bouger</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 15, fontWeight: 700, color: "#fff" }}>{relativeZoneLabel(base)}</div>
            <WellnessRing score={base?.relativeScore ?? sim} size={50} strokeWidth={5} dark />
          </div>
        </div>
        <input type="range" min={0} max={100} value={sim} aria-label="Simule ta forme"
          onChange={e => { setSim(parseInt(e.target.value, 10)); setMoved(true); }} className="tpc-autoreg-slider"
          style={{ width: "100%", height: 7, borderRadius: 8, WebkitAppearance: "none", appearance: "none", background: WELLNESS_TRACK_GRADIENT, outline: "none", cursor: "pointer" }} />
        <style>{`
          .tpc-autoreg-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid #d44000; box-shadow: 0 2px 6px rgba(0,0,0,.3); cursor: grab; }
          .tpc-autoreg-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid #d44000; box-shadow: 0 2px 6px rgba(0,0,0,.3); cursor: grab; }
        `}</style>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.4)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          <span>Fatigué</span><span>Frais</span>
        </div>
        <div style={{ marginTop: 9, fontSize: 12.5, color: "rgba(255,255,255,.9)", lineHeight: 1.45 }}>
          {!impacted.length ? "Aucun écart marqué : la semaine reste comme prévu." : (
            <>{impacted[0].sug!.dir === "low" ? "Alléger" : "Augmenter la charge"} recommandé {impacted.length > 1 ? "sur" : "pour"}{" "}
              {impacted.map((w, i) => <span key={w.s.id}>{i > 0 && ", "}<b>{firstName(w.s.date)}</b></span>)}.</>
          )}
        </div>
      </div>}
      {rest.length > 0 && <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)", marginBottom: 8 }}>{decide ? `La suite de ${subject ? "sa" : "ta"} semaine` : "Ta première semaine"}</div>}
      {rest.map(({ s, planned, sug }) => {
        const color = sug ? suggestionSeverityColor(sug) : null;
        const adjusted = sug ? applyAutoregDifficulty(planned, sug.reco) : planned;
        return (
          <div key={s.id} style={{ marginBottom: 16 }}>
            {/* Jour conseillé : l'anneau prend la zone conseillée, comme le Planning le jour même. */}
            <PlanningDayPreview s={s} today={today} planned={planned}
              ring={sug ? (({ zoneLow, zoneHigh }) => ({ value: planned, zone: { low: zoneLow, high: zoneHigh } }))(zoneRange(adjusted, sug.dir)) : undefined}
              alert={sug && color ? { border: `${color}66`, glow: color, text: `${autoregHeadline(sug.dir)}\n${autoregAdvice(sug.dir, planned, subject)}` } : undefined}
              adjustPct={sug ? sug.reco : null} />
          </div>
        );
      })}
    </div>
  );
}

/* ── ob_notif : la carte de prod (NotificationPrompt), version écran. ── */
export const NOTIF_HOURS = [6, 7, 8, 9];
