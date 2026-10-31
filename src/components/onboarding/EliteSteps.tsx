"use client";

import { PLAY_STORE_URL } from "@/lib/storeLinks";
import { healthAppName, isAndroidApp } from "@/lib/native";
import { useState } from "react";
import { syntheticBaselineFor } from "@/lib/sandboxFixtures";
import ProgramBanner from "@/components/programs/ProgramBanner";
import { SessionTemplateCard } from "@/components/programs/SessionTemplateCard";
import { computeAutoregSuggestion, zoneRange, suggestionSeverityColor, autoregHeadline, autoregAdvice, applyAutoregDifficulty, formatAutoregPoints } from "@/lib/autoregulation";
import AutoregButtons from "@/components/sessions/AutoregButtons";
import AlertBox from "@/components/calendar/AlertBox";
import DecisionGauge from "@/components/sessions/DecisionGauge";
import WellnessRing from "@/components/wellness/WellnessRing";
import { relativeZoneLabel } from "@/lib/wellnessBaseline";
import { WELLNESS_RAMP } from "@/lib/wellness";
import { DARK_CARD_BG } from "@/lib/theme";
import { parseAndApply } from "@/lib/loadAdjust";
import type { Program, ProgramTemplate, SessionTemplate } from "@/types";

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
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#8a8f94", marginBottom: 6 }}>{dayLabel(s.date, today)}</div>
          <SessionTemplateCard session={{ name: s.name, notes: s.notes, target_difficulty: s.target_difficulty ?? 5, load: 2, type: "volume" } as unknown as SessionTemplate} cardStyle={{ cursor: "default" }} />
        </div>
      ))}
    </div>
  );
}

/* decide (POC 2026-10-28) : plus de curseur « Simule ta forme ». Sa séance du jour passe en tête avec la
   jauge de décision de /today (AutoregButtons en anneau, la primitive), calée sur son vrai check-in ; il
   décide lui-même. La suite de la semaine dessous, recalculée sur la même forme. subject : côté coach,
   la séance de son sportif (« Sa forme », « sa semaine »). */
export function WeekStepBody({ sessions, program, checkinScore, acclimatation, today, decide = false, subject }: {
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
        const tpl = { name: s.name, notes: shown.notes, target_difficulty: shown.target_difficulty, load: 2, type: "volume" } as unknown as SessionTemplate;
        return (
          <div style={{ marginBottom: 22 }}>
            {/* Plus de ligne « Aujourd'hui · Ta forme ce matin » : le texte sous l'anneau la dit déjà. */}
            {/* La jauge toujours là, comme /today : avec une reco (Alléger / Surcharger), sinon en mode
                libre (forme dans la zone, ou point forme passé) où il peut quand même la bouger. */}
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
                <AutoregButtons demo notes={shown.notes} sessionId={`ob-week-${s.id}`} advice="" sessionLabel={s.name}
                  dir={sug?.dir} reco={sug?.reco}
                  plannedDifficulty={shown.target_difficulty} onPreviewChange={setPreview} shape="ring" ringFluid ringGlow={color ?? undefined} actionsSlot={slot}
                  severityColor={color ?? undefined} isActive
                  onApply={async pct => {
                    // Même réécriture que /today (TodayClient, onApply).
                    setApplied(pct);
                    setCur({ notes: s.notes ? s.notes.split("\n").map(l => parseAndApply(l, pct)).join("\n") : s.notes, target_difficulty: applyAutoregDifficulty(planned, pct) });
                    return { notes: s.notes ?? "", target_difficulty: planned };
                  }}
                  onUndo={async () => { setApplied(null); setCur(null); }}
                  onMaintenir={() => setApplied(0)} />
              </div>
              {/* Comme /today depuis le 2026-10-28 : anneau en grand, titre au centre, plus d'encart. */}
              <AlertBox variant="bare"
                alert={{ border: `${color ?? "#ffffff"}66`, glow: color ?? "#ffffff", text: sug
                  ? `${autoregHeadline(sug.dir)}\n${autoregAdvice(sug.dir, planned, subject)}`
                  : subject ? `Dans sa zone\nLa forme de ${subject} ce matin colle à la séance prévue : garde-la telle quelle.` : "Dans ta zone\nTa forme de ce matin colle à la séance prévue : garde-la telle quelle." }}
                actions={<div ref={setSlot} className="autoreg-slot" />} />
            </div>
            <div style={{ marginTop: 12 }}>
              {/* Comme /today : barré tant qu'il n'a pas validé, puis la séance réécrite telle quelle. */}
              <SessionTemplateCard session={tpl} adjustPct={applied != null ? null : preview || null} cardStyle={{ cursor: "default" }} />
            </div>
          </div>
        );
      })()}
      {!decide && <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(23,27,31,.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: "13px 14px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "rgba(255,255,255,.65)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {checkinScore != null && !moved ? "Ta forme ce matin" : "Simule ta forme"}
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
        const tpl = { name: s.name, notes: s.notes, target_difficulty: planned, load: 2, type: "volume" } as unknown as SessionTemplate;
        const adjusted = sug ? applyAutoregDifficulty(planned, sug.reco) : planned;
        return (
          <div key={s.id} style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.55)", marginBottom: 6 }}>{dayLabel(s.date, today)}</div>
            {sug && color && (
              <div style={{ marginBottom: 8 }}>
                <AlertBox variant="darkColor" alert={{ border: `${color}66`, glow: color, text: `${autoregHeadline(sug.dir)}\n${autoregAdvice(sug.dir, planned, subject)}` }} />
              </div>
            )}
            <SessionTemplateCard session={tpl} cardStyle={{ cursor: "default" }}
              gaugeOverride={sug ? adjusted : undefined}
              gaugeSlot={sug ? (() => {
                const { zoneLow, zoneHigh } = zoneRange(adjusted, sug.dir);
                return <DecisionGauge light readOnly dir={sug.dir} zoneLow={zoneLow} zoneHigh={zoneHigh} value={planned} onChange={() => {}} />;
              })() : undefined}
              badgeOverride={sug && color ? { label: formatAutoregPoints(sug.reco), bg: `${color}22`, color } : undefined}
              adjustPct={sug ? sug.reco : null} />
          </div>
        );
      })}
    </div>
  );
}

/* ── ob_notif : la carte de prod (NotificationPrompt), version écran. ── */
export const NOTIF_HOURS = [6, 7, 8, 9];
/* Série des 5 premiers matins (2026-10-22), fusionnée dans le titre de l'écran notifications :
   5 petits ronds (jour 1 plein, demain cerclé) devant « Jour 1 sur 5 ». Même repère que l'écran de
   fin du point forme in-app (« Jour n sur 5 ») ; ici l'argument des notifications : ne pas casser la série. */
export function StreakTitle({ day = 1 }: { day?: number }) {
  return (
    <>
      <span style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
        {[1, 2, 3, 4, 5].map(d => (
          <span key={d} style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box",
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800,
            background: d <= day ? "#d44000" : "transparent",
            border: d <= day ? "none" : d === day + 1 ? "2px dashed #d44000" : "2px solid rgba(0,0,0,.16)" }}>{d <= day ? "✓" : ""}</span>
        ))}
      </span>
      <span style={{ color: "#d44000" }}>Jour {day} sur 5</span> : reviens demain pour le jour {day + 1}.
    </>
  );
}

export function NotifStepBody({ hour, setHour, sessionName, coachName, error, coach, streak, athleteName }: {
  hour: number; setHour: (h: number) => void; sessionName: string | null; coachName: string | null; error?: string | null;
  /** Le sportif vient de faire son 1er point forme : les notifs servent à continuer sa série. */
  streak?: boolean;
  /** Coach : alerte récup fragile + résumé du matin (notifs de prod depuis iOS 1.1). */
  coach?: boolean;
  /** Coach : le sportif qu'il vient d'imaginer, à la place de Karim (le sportif de la démo d'avant l'inscription). */
  athleteName?: string;
}) {
  const clock = `${String(hour).padStart(2, "0")}:00`;
  const who = athleteName?.trim() || "Karim";
  const pushes = coach ? [
    { title: `${who} : récup fragile, séance dure prévue`, body: "ThePerfClub recommande d'alléger. Tu valides ?", when: "maintenant" },
    { title: "2 sportifs à regarder ce matin", body: `${who === "Karim" ? "Karim H." : who} · Léa G.`, when: clock },
  ] : streak ? [
    { title: "Jour 2 sur 5 · Comment tu te sens ?", body: "10 secondes pour continuer ta série et ajuster ta séance.", when: "demain" },
    { title: "Jour 3 sur 5 · Ta norme se précise", body: sessionName ? `${sessionName} : fais ton point forme pour l'ajuster.` : "Fais ton point forme pour ajuster ta séance.", when: "après-demain" },
  ] : [
    { title: "Ta 1re séance ajustée t'attend", body: "Fais ton point forme : ta séance s'ajuste en conséquence.", when: "demain" },
    { title: sessionName ?? "Comment tu te sens ce matin ?", body: "10 secondes pour l'ajuster à ta forme.", when: "après-demain" },
  ];
  return (
    <div>
      {coachName && <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.5, margin: "0 0 16px" }}>{coachName} voit comment tu vas dès ton point forme.</p>}
      {/* L'heure d'abord : c'est le seul choix de l'écran, il doit être visible sans défiler. */}
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>{coach ? "Le résumé du matin, à quelle heure ?" : streak ? "À quelle heure on te le rappelle ?" : "À quelle heure ?"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {NOTIF_HOURS.map(h => (
          <button key={h} type="button" onClick={() => setHour(h)}
            style={{ padding: "10px 16px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, color: hour === h ? "#d44000" : "#171b1f",
              border: hour === h ? "2px solid #d44000" : `1px solid ${LINE}`, background: hour === h ? "rgba(212,64,0,.06)" : "#fff" }}>
            {h} h
          </button>
        ))}
      </div>
      <div style={{ borderRadius: 24, padding: "18px 14px 14px", background: DARK_CARD_BG, marginBottom: 18 }}>
        <div style={{ textAlign: "center", color: "#fff", fontSize: 44, fontWeight: 300, letterSpacing: "-.02em", marginBottom: 10, fontVariantNumeric: "tabular-nums" }}>{clock}</div>
        {pushes.map(p => (
          <div key={p.title} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 16, background: "rgba(255,255,255,.12)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", marginTop: 8 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: "#d44000", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14 }}>⚡</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "#fff", fontSize: 13.5, fontWeight: 700 }}>
                <span style={{ minWidth: 0 }}>{p.title}</span>
                <span style={{ color: "rgba(255,255,255,.5)", fontWeight: 500, fontSize: 12, flexShrink: 0 }}>{p.when}</span>
              </span>
              <span style={{ display: "block", color: "rgba(255,255,255,.75)", fontSize: 13, lineHeight: 1.4, marginTop: 2 }}>{p.body}</span>
            </span>
          </div>
        ))}
      </div>
      {error && <p style={{ fontSize: 13, color: "#b42318", marginTop: 12 }}>{error}</p>}
    </div>
  );
}

/* ── ob_notif sur le web hors Android (iPhone dans Safari, ordinateur) : pas de notification du
   navigateur (impossible dans Safari hors app, et le point forme se vit sur le téléphone). On pousse
   l'app iPhone, avec sa montre : l'app lit Apple Santé. Android dans le navigateur : l'app Android
   (Health Connect) dès qu'elle est sur Google Play (2026-10-28). ── */
export function AppPushStepBody({ desktop, android = false, hour, setHour, sessionName, coach, streak, athleteName }: {
  desktop: boolean; android?: boolean; hour: number; setHour: (h: number) => void; sessionName: string | null; coach?: boolean; streak?: boolean; athleteName?: string;
}) {
  return (
    <div>
      {desktop && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 16, border: `1px solid ${LINE}`, background: "#fff", marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PLAY_STORE_URL ? "/app-qr.svg" : "/app-store-qr.svg"} alt="QR code pour télécharger l'app" width={92} height={92} style={{ flexShrink: 0, borderRadius: 8 }} />
          <span style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.45 }}>Scanne avec ton {PLAY_STORE_URL ? "téléphone" : "iPhone"} et connecte-toi avec le même compte : {coach ? "ton Coach Control" : "ton plan"} t&apos;attend.</span>
        </div>
      )}
      {/* Import de la montre (2026-10-23) : la vraie promesse de l'app pour un sportif équipé. */}
      {!coach && (
        <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.45, margin: "0 0 16px" }}>
          ⌚ Tu as une montre ? L&apos;app relit tes 30 derniers jours dans {android ? "Health Connect" : "Apple Santé"} : tes analyses sont prêtes dès l&apos;installation.
        </p>
      )}
      <NotifStepBody hour={hour} setHour={setHour} sessionName={sessionName} coachName={null} coach={coach} streak={streak} athleteName={athleteName} />
    </div>
  );
}
