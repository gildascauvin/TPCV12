"use client";

import { useState } from "react";
import DecisionRing from "@/components/sessions/DecisionRing";
import ProgramBanner from "@/components/programs/ProgramBanner";
import { SessionTemplateCard } from "@/components/programs/SessionTemplateCard";
import { computeAutoregSuggestion, zoneRange } from "@/lib/autoregulation";
import { adjustDifficulty } from "@/lib/loadAdjust";
import { wellnessColor } from "@/lib/wellness";
import { DARK_CARD_BG } from "@/lib/theme";
import type { Program, ProgramTemplate, SessionTemplate } from "@/types";

/* Écrans du parcours post-signup Elite (2026-10-17, POC https://claude.ai/artifact/HopwXw7gFnAdRLpB496JvE).
   Contenu seulement : le cadre (QuestionShell), l'état et les écritures vivent dans OnboardingFlow. */

const MUTED = "#6b7177";
const LINE = "rgba(0,0,0,.10)";

/* ── ob_when : la question qui fait revivre un matin précis. Enregistrée dans profiles.frustration. ── */
export type ObWhen = "force" | "feeling" | "saute" | "jamais";
export const WHEN_OPTIONS: { value: ObWhen; label: string }[] = [
  { value: "force", label: "Je la fais quand même, comme prévu" },
  { value: "feeling", label: "J'allège au feeling" },
  { value: "saute", label: "Je la saute" },
  { value: "jamais", label: "Ça ne m'arrive pas" },
];

/* ── ob_mirror : une étude par réponse (fiches Labo des réels, vérifiées sur PubMed). ── */
const SCIENCE: Record<ObWhen, { title: string; n: string; text: string; source: string; quote: string }> = {
  force: {
    title: "Forcer fatigué ne te donne pas la séance prévue.",
    n: "−8,6 %",
    text: "d'effort produit à l'entraînement les matins où tu te sens moins bien, même en voulant faire la séance prévue.",
    source: "Gallo et al. · Journal of Sports Sciences, 2016",
    quote: "Tu paies la fatigue sans le bénéfice. Mieux vaut alléger exprès que subir.",
  },
  feeling: {
    title: "Ton instinct a raison. Il lui manque une règle.",
    n: "85 %",
    text: "des cas où ton ressenti et les mesures (cardio, prise de sang) ne disent pas la même chose, c'est ton ressenti qui suit le mieux ta fatigue. Bilan de 56 études.",
    source: "Saw, Main & Gastin · British Journal of Sports Medicine, 2016",
    quote: "Avec une règle simple : +9,5 kg au développé couché en 6 semaines en avançant selon la forme du jour, zéro en programme fixe (Mann et al., 2010).",
  },
  saute: {
    title: "Entre la séance dure et rien, il y a la séance ajustée.",
    n: "+7,3 %",
    text: "sur un contre-la-montre de 40 minutes pour les cyclistes qui ajustaient leur séance chaque jour, face à une périodisation classique.",
    source: "Javaloyes et al. · Int J Sports Physiol Perform, 2019",
    quote: "Une séance allégée garde le fil. Une séance sautée le casse.",
  },
  jamais: {
    title: "Tu te sens prêt. Ta force, elle, bouge chaque jour.",
    n: "4,2 %",
    text: "d'écart en moyenne sur ta charge max d'un jour à l'autre, et jusqu'à 12 %. Sur un squat à 100 kg, ça fait 4 kg.",
    source: "Grgic et al. · Sports Medicine Open, 2020",
    quote: "Les bons jours, ton programme te fait aussi faire moins que ce que tu pourrais.",
  },
};
export function mirrorTitle(when: ObWhen | null): string {
  return SCIENCE[when ?? "force"].title;
}
export function MirrorBody({ when }: { when: ObWhen | null }) {
  const x = SCIENCE[when ?? "force"];
  return (
    <div>
      <div style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 16, padding: "16px 16px 14px", marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(255,255,255,.5)", marginBottom: 8 }}>Ce que dit la science</div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-.03em", color: "#ff8a55", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{x.n}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.45, color: "rgba(255,255,255,.82)", margin: "6px 0 10px" }}>{x.text}</div>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,.45)" }}>{x.source}</div>
      </div>
      <p style={{ fontSize: 15, lineHeight: 1.5, color: "rgba(255,255,255,.75)", margin: 0, paddingLeft: 12, borderLeft: "3px solid #d44000" }}>{x.quote}</p>
    </div>
  );
}

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
        <b style={{ color: "#171b1f" }}>Via Apple Santé</b> · Apple Watch · Garmin · Whoop · Oura · Polar · Coros · Suunto
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

/* ── ob_week : le déclic. Le même programme, trois matins différents (vraie règle de reco). ── */
export interface WeekSession { id: string; date: string; name: string; notes: string | null; target_difficulty: number | null }
type Morning = "cuit" | "today" | "forme";
const MORNING_SCORE: Record<Exclude<Morning, "today">, number> = { cuit: 28, forme: 92 };

function dayLabel(date: string, today: string): string {
  if (date === today) return "Aujourd'hui";
  const d = new Date(`${date}T12:00:00`);
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function WeekStepBody({ sessions, program, checkinScore, acclimatation, today }: {
  sessions: WeekSession[];
  program: { name: string; sport: string; template: ProgramTemplate } | null;
  checkinScore: number | null;
  acclimatation: boolean;
  today: string;
}) {
  const [morning, setMorning] = useState<Morning>(checkinScore != null ? "today" : "cuit");
  const score = morning === "today" ? (checkinScore ?? 60) : MORNING_SCORE[morning];
  const shown = sessions.filter(s => (s.target_difficulty ?? 0) > 0).slice(0, 3);
  const first = shown[0];
  const tabs: { key: Morning; label: string }[] = [
    { key: "cuit", label: "Cuit" },
    ...(checkinScore != null ? [{ key: "today" as Morning, label: "Aujourd'hui" }] : []),
    { key: "forme", label: "En forme" },
  ];

  const adjust = (planned: number) => {
    const sug = computeAutoregSuggestion(score, planned);
    const pct = sug?.reco ?? 0;
    const value = adjustDifficulty(planned, pct);
    const zone = sug ? zoneRange(value, sug.dir) : zoneRange(planned, "low");
    return { sug, pct, value, zone, points: value - planned };
  };
  /* L'anneau montre la 1re séance que ce matin-là fait vraiment bouger (une séance légère ne
     s'allège pas même cuit, une séance dure ne se surcharge pas même en forme) ; sinon la 1re. */
  const pool = sessions.filter(s => (s.target_difficulty ?? 0) > 0);
  const focus = pool.find(s => adjust(s.target_difficulty ?? 5).points !== 0) ?? first;
  const a0 = focus ? adjust(focus.target_difficulty ?? 5) : null;

  return (
    <div>
      {program && (
        <div style={{ margin: "0 -20px 16px" }}>
          <ProgramBanner
            program={{ id: "", name: program.name, sport: program.sport, weeks_count: program.template.weeks.length, template: program.template } as unknown as Program}
            currentWeek={acclimatation ? -1 : 0} acclimatation={acclimatation} dark
          />
        </div>
      )}
      <div style={{ display: "flex", gap: 6, padding: 4, borderRadius: 999, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setMorning(t.key)}
            style={{ flex: 1, padding: "10px 8px", borderRadius: 999, border: 0, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 14,
              background: morning === t.key ? "#fff" : "transparent", color: morning === t.key ? "#171b1f" : "rgba(255,255,255,.7)" }}>
            {t.label}
          </button>
        ))}
      </div>
      {focus && a0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 24, background: DARK_CARD_BG, border: "1px solid rgba(255,255,255,.10)", marginBottom: 16 }}>
          <div style={{ flexShrink: 0 }}>
            <DecisionRing zoneLow={a0.zone.zoneLow} zoneHigh={a0.zone.zoneHigh} recoDir={a0.sug?.dir} value={a0.value}
              plannedMarker={focus.target_difficulty} readOnly onChange={() => {}} size={132} hideHint />
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,.8)" }}>
            <b style={{ display: "block", fontSize: 16, color: wellnessColor(score), marginBottom: 4 }}>Forme {score}/100</b>
            {dayLabel(focus.date, today)} : {focus.name}, RPE prévu {focus.target_difficulty}.<br />
            {a0.points < 0 ? `On allège de ${-a0.points} point${a0.points < -1 ? "s" : ""}.`
              : a0.points > 0 ? `On surcharge de ${a0.points} point${a0.points > 1 ? "s" : ""}.`
              : morning === "forme" ? "Le plan tient : en forme, seules les séances légères se surchargent."
              : morning === "cuit" ? "Le plan tient : cette séance est déjà légère."
              : "Le plan tient tel quel."}
          </div>
        </div>
      )}
      {shown.map(s => {
        const a = adjust(s.target_difficulty ?? 5);
        const tpl = { name: s.name, notes: s.notes, target_difficulty: s.target_difficulty ?? 5, load: 2, type: "volume" } as unknown as SessionTemplate;
        return (
          <div key={s.id} style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.55)", marginBottom: 6 }}>{dayLabel(s.date, today)}</div>
            <SessionTemplateCard session={tpl} adjustPct={a.pct || null} gaugeOverride={a.value} cardStyle={{ cursor: "default" }} />
          </div>
        );
      })}
    </div>
  );
}

/* ── ob_notif : la carte de prod (NotificationPrompt), version écran. ── */
export const NOTIF_HOURS = [6, 7, 8, 9];
export function NotifStepBody({ hour, setHour, sessionName, coachName, error }: {
  hour: number; setHour: (h: number) => void; sessionName: string | null; coachName: string | null; error?: string | null;
}) {
  const clock = `${String(hour).padStart(2, "0")}:00`;
  const pushes = [
    { title: "Ta 1re séance ajustée t'attend", body: "Fais ton check-in : ta séance s'adapte à ta forme du jour.", when: "demain" },
    { title: sessionName ? `Aujourd'hui : ${sessionName}` : "Comment tu te sens ce matin ?", body: "10 secondes pour l'ajuster à ta forme.", when: "après-demain" },
  ];
  return (
    <div>
      {coachName && <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.5, margin: "0 0 16px" }}>{coachName} voit ta forme dès ton check-in.</p>}
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
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>À quelle heure ?</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {NOTIF_HOURS.map(h => (
          <button key={h} type="button" onClick={() => setHour(h)}
            style={{ padding: "10px 16px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, color: hour === h ? "#d44000" : "#171b1f",
              border: hour === h ? "2px solid #d44000" : `1px solid ${LINE}`, background: hour === h ? "rgba(212,64,0,.06)" : "#fff" }}>
            {h} h
          </button>
        ))}
      </div>
      {error && <p style={{ fontSize: 13, color: "#b42318", marginTop: 12 }}>{error}</p>}
    </div>
  );
}
