"use client";

import { useState } from "react";
import { decisionRingState } from "@/components/sessions/DecisionRing";
import CoachRadar, { type RadarPoint } from "@/components/coach/CoachRadar";
import { syntheticBaselineFor } from "@/lib/sandboxFixtures";
import ProgramBanner from "@/components/programs/ProgramBanner";
import { SessionTemplateCard } from "@/components/programs/SessionTemplateCard";
import { computeAutoregSuggestion, zoneRange, suggestionSeverityColor, autoregHeadline, autoregAdvice, applyAutoregDifficulty, formatAutoregPoints } from "@/lib/autoregulation";
import AutoregButtons from "@/components/sessions/AutoregButtons";
import AlertBox from "@/components/calendar/AlertBox";
import DecisionGauge from "@/components/sessions/DecisionGauge";
import WellnessRing from "@/components/wellness/WellnessRing";
import { relativeZoneLabel } from "@/lib/wellnessBaseline";
import { adjustDifficulty } from "@/lib/loadAdjust";
import { WELLNESS_RAMP } from "@/lib/wellness";
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

/* ── Coach (2026-10-19) : même cadrage, vécu côté coach. Réponse enregistrée dans profiles.frustration
   préfixée "coach_" pour ne jamais se confondre avec celles d'un sportif. ── */
export type ObWhenCoach = "avant" | "pendant" | "apres" | "jamais";
export const WHEN_OPTIONS_COACH: { value: ObWhenCoach; label: string }[] = [
  { value: "avant", label: "Avant, il me prévient" },
  { value: "pendant", label: "Pendant la séance" },
  { value: "apres", label: "Après, en voyant ses résultats" },
  { value: "jamais", label: "Souvent, je ne le sais pas" },
];
type CoachScienceKey = "c_avant" | "c_vu" | "c_jamais";
const SCIENCE_COACH: Record<CoachScienceKey, { title: string; n: string; text: string; source: string; quote: string }> = {
  c_avant: {
    title: "Il te prévient. Mais vit-il la même séance que toi ?",
    n: "27",
    text: "études le montrent : coach et sportif ne jugent pas la même séance de la même façon. Le plus souvent, la séance « facile » ne l'est pas pour le sportif.",
    source: "Inoue et al. · Sports Medicine Open, 2022",
    quote: "Ce qu'il te dit, c'est quand il y pense. Son check-in, c'est chaque matin.",
  },
  c_vu: {
    title: "Tu prévois une séance. Ils en vivent une autre.",
    n: "2 446",
    text: "séances de jeunes footballeurs : les joueurs les ont trouvées plus dures que ce que leur coach avait prévu.",
    source: "Brink et al. · Int J Sports Physiol Perform, 2014",
    quote: "L'écart se voit avant la séance, pas après. À condition de le demander.",
  },
  c_jamais: {
    title: "Leur sommeil et leur stress pèsent autant que ta séance.",
    n: "536",
    text: "joueuses de netball suivies : un mauvais sommeil et une mauvaise récupération allaient de pair avec plus de blessures et de maladies.",
    source: "Horgan et al. · Scand J Med Sci Sports, 2021",
    quote: "Conclusion des auteurs : suivre chaque jour le sommeil et la récupération physique et mentale.",
  },
};
const coachScienceKey = (w: ObWhenCoach | null): CoachScienceKey => w === "avant" ? "c_avant" : w === "jamais" ? "c_jamais" : "c_vu";
export function mirrorTitleCoach(when: ObWhenCoach | null): string {
  return SCIENCE_COACH[coachScienceKey(when)].title;
}

/* ── ob_count : la taille du groupe. Sert au chiffre du constat coach. ── */
export type ObCount = "1-5" | "6-15" | "16-30" | "30+";
export const COUNT_OPTIONS: { value: ObCount; label: string; n: number }[] = [
  { value: "1-5", label: "1 à 5 sportifs", n: 3 },
  { value: "6-15", label: "6 à 15 sportifs", n: 10 },
  { value: "16-30", label: "16 à 30 sportifs", n: 22 },
  { value: "30+", label: "Plus de 30", n: 40 },
];

export function MirrorBody({ when, coach }: { when: ObWhen | ObWhenCoach | null; coach?: { count: ObCount | null; days: number } }) {
  const x = coach ? SCIENCE_COACH[coachScienceKey(when as ObWhenCoach | null)] : SCIENCE[(when as ObWhen | null) ?? "force"];
  const n = coach ? (COUNT_OPTIONS.find(c => c.value === coach.count)?.n ?? 10) : 0;
  return (
    <div>
      {coach && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: "-.05em", lineHeight: .95, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
            {n * coach.days}<span style={{ fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,.55)", letterSpacing: "-.01em", marginLeft: 8 }}>séances par semaine</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 12.5, color: "rgba(255,255,255,.55)", marginTop: 10, lineHeight: 1.6 }}>
            {n} sportifs × {coach.days} séances, prescrites sans savoir comment chacun a dormi
          </div>
        </div>
      )}
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

/* ── ob_week : l'aperçu du programme (2026-10-27, POC https://claude.ai/artifact/LeydVcBfSZF8osutKTvNWu).
   Bannière, simulateur de forme de /p/ (même rampe, même vocabulaire de zone) calé sur son vrai
   check-in, puis ses séances de la semaine en cartes complètes, recalculées au glisser. ── */
export interface WeekSession { id: string; date: string; name: string; notes: string | null; target_difficulty: number | null }
const WELLNESS_TRACK_GRADIENT = `linear-gradient(to right, ${WELLNESS_RAMP.map(x => `${x.hex} ${x.stop * 100}%`).join(", ")})`;

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
  const start = checkinScore ?? 60;
  const [sim, setSim] = useState(start);
  const [moved, setMoved] = useState(false);
  const base = syntheticBaselineFor(sim);
  // Les 7 prochains jours : sa première semaine.
  const end = new Date(`${today}T12:00:00`); end.setDate(end.getDate() + 6);
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const week = sessions.filter(s => (s.target_difficulty ?? 0) > 0 && s.date <= endStr).map(s => {
    const planned = s.target_difficulty ?? 5;
    return { s, planned, sug: computeAutoregSuggestion(sim, planned, base) };
  });
  const impacted = week.filter(w => w.sug);
  const firstName = (d: string) => dayLabel(d, today).split(" ")[0];
  return (
    <div>
      {program && (
        <div style={{ margin: "0 -20px 8px" }}>
          <ProgramBanner
            program={{ id: "", name: program.name, sport: program.sport, weeks_count: program.template.weeks.length, template: program.template } as unknown as Program}
            currentWeek={acclimatation ? -1 : 0} acclimatation={acclimatation} dark
          />
        </div>
      )}
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(23,27,31,.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: "13px 14px", marginBottom: 18 }}>
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
      </div>
      {week.length > 0 && <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)", marginBottom: 8 }}>Ta première semaine</div>}
      {week.map(({ s, planned, sug }) => {
        const color = sug ? suggestionSeverityColor(sug) : null;
        const tpl = { name: s.name, notes: s.notes, target_difficulty: planned, load: 2, type: "volume" } as unknown as SessionTemplate;
        const adjusted = sug ? applyAutoregDifficulty(planned, sug.reco) : planned;
        return (
          <div key={s.id} style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.55)", marginBottom: 6 }}>{dayLabel(s.date, today)}</div>
            {sug && color && (
              <div style={{ marginBottom: 8 }}>
                <AlertBox variant="darkColor" alert={{ border: `${color}66`, glow: color, text: `${autoregHeadline(sug.dir)}\n${autoregAdvice(sug.dir, planned)}` }} />
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
   fin du check-in in-app (« Jour n sur 5 ») ; ici l'argument des notifications : ne pas casser la série. */
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

export function NotifStepBody({ hour, setHour, sessionName, coachName, error, coach, streak }: {
  hour: number; setHour: (h: number) => void; sessionName: string | null; coachName: string | null; error?: string | null;
  /** Le sportif vient de faire son 1er check-in : les notifs servent à continuer sa série. */
  streak?: boolean;
  /** Coach : alerte récup fragile + résumé du matin (notifs de prod depuis iOS 1.1). */
  coach?: boolean;
}) {
  const clock = `${String(hour).padStart(2, "0")}:00`;
  const pushes = coach ? [
    { title: "Thomas : récup fragile, séance dure prévue", body: "ThePerfClub recommande d'alléger. Tu valides ?", when: "maintenant" },
    { title: "2 sportifs à regarder ce matin", body: "Thomas M. · Léa P.", when: clock },
  ] : streak ? [
    { title: "Jour 2 sur 5 · Comment tu te sens ?", body: "10 secondes pour continuer ta série et ajuster ta séance.", when: "demain" },
    { title: "Jour 3 sur 5 · Ta norme se précise", body: sessionName ? `${sessionName} : fais ton check-in pour l'ajuster.` : "Fais ton check-in pour ajuster ta séance.", when: "après-demain" },
  ] : [
    { title: "Ta 1re séance ajustée t'attend", body: "Fais ton check-in : ta séance s'adapte à ta forme du jour.", when: "demain" },
    { title: sessionName ?? "Comment tu te sens ce matin ?", body: "10 secondes pour l'ajuster à ta forme.", when: "après-demain" },
  ];
  return (
    <div>
      {coachName && <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.5, margin: "0 0 16px" }}>{coachName} voit ta forme dès ton check-in.</p>}
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
   navigateur (impossible dans Safari hors app, et le check-in se vit sur le téléphone). On pousse
   l'app iPhone, avec sa montre : l'app lit Apple Santé. ── */
export function AppPushStepBody({ desktop, hour, setHour, sessionName, coach, streak }: {
  desktop: boolean; hour: number; setHour: (h: number) => void; sessionName: string | null; coach?: boolean; streak?: boolean;
}) {
  return (
    <div>
      {desktop && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 16, border: `1px solid ${LINE}`, background: "#fff", marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/app-store-qr.svg" alt="QR code de l'App Store" width={92} height={92} style={{ flexShrink: 0, borderRadius: 8 }} />
          <span style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.45 }}>Scanne avec ton iPhone et connecte-toi avec le même compte : {coach ? "ton Coach Control" : "ton plan"} t&apos;attend.</span>
        </div>
      )}
      {/* Import de la montre (2026-10-23) : la vraie promesse de l'app pour un sportif équipé. */}
      {!coach && (
        <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.45, margin: "0 0 16px" }}>
          ⌚ Tu as une montre ? L&apos;app relit tes 30 derniers jours dans Apple Santé : tes analyses sont pleines dès l&apos;installation.
        </p>
      )}
      <NotifStepBody hour={hour} setHour={setHour} sessionName={sessionName} coachName={null} coach={coach} streak={streak} />
    </div>
  );
}

/* ── ob_control (coach) : le déclic (2026-10-27, POC https://claude.ai/artifact/LeydVcBfSZF8osutKTvNWu).
   Son programme appliqué à 4 sportifs de démo sur le radar du Coach Control ; Thomas vient de faire
   son check-in et c'est au coach de décider, avec le vrai anneau de décision (mode démo : rien
   d'enregistré, pas de « 1re décision »). Les siens remplacent les démos dès leur check-in. ── */
export interface ControlSession { name: string; notes: string | null; target_difficulty: number }
const THOMAS_SCORE = 30;

function controlPoint(id: string, name: string, score: number | null, s: ControlSession, decided?: number | null): RadarPoint {
  const baseline = score == null ? null : syntheticBaselineFor(score);
  const sug = score == null ? null : computeAutoregSuggestion(score, s.target_difficulty, baseline);
  const x = score == null ? null : Math.round(baseline?.relativeScore ?? score);
  return {
    id, name, score: x, diff: decided ?? s.target_difficulty,
    ring: x == null ? null : decisionRingState([{ done: false, target_difficulty: s.target_difficulty }], decided != null ? null : sug, null),
    hideZone: !sug || decided != null,
  };
}

export function ControlStepBody({ hard, easy, onDecided }: { hard: ControlSession; easy: ControlSession; onDecided?: (pct: number) => void }) {
  const [preview, setPreview] = useState<number | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const base = syntheticBaselineFor(THOMAS_SCORE);
  const sug = computeAutoregSuggestion(THOMAS_SCORE, hard.target_difficulty, base);
  const decidedDiff = applied != null ? adjustDifficulty(hard.target_difficulty, applied) : null;
  const points: RadarPoint[] = [
    controlPoint("ines", "Inès R.", 84, easy),
    controlPoint("hugo", "Hugo B.", 80, hard),
    controlPoint("lea", "Léa P.", null, hard),
    controlPoint("thomas", "Thomas M.", THOMAS_SCORE, hard, decidedDiff),
  ];
  const tpl = { name: hard.name, notes: hard.notes, target_difficulty: hard.target_difficulty, load: 2, type: "volume" } as unknown as SessionTemplate;
  const decide = (pct: number) => { setApplied(pct); onDecided?.(pct); };
  return (
    <div>
      <CoachRadar points={points} onSelect={() => {}} />
      {sug && (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <AutoregButtons demo notes={hard.notes} sessionId="ob-control-demo-thomas" advice="" sessionLabel={hard.name} dir={sug.dir} reco={sug.reco}
              plannedDifficulty={hard.target_difficulty} onPreviewChange={setPreview} shape="ring" ringSize={160} actionsSlot={slot}
              severityColor={suggestionSeverityColor(sug)} isActive viewer={{ role: "coach", subjectName: "Thomas" }}
              onApply={async pct => { decide(pct); return { notes: hard.notes ?? "", target_difficulty: hard.target_difficulty }; }}
              onMaintenir={() => decide(0)} />
          </div>
          <AlertBox variant="darkColor" centered
            alert={{ border: `${suggestionSeverityColor(sug)}66`, glow: suggestionSeverityColor(sug), text: `${autoregHeadline(sug.dir)}\n${autoregAdvice(sug.dir, hard.target_difficulty, "Thomas", base)}` }}
            actions={<div ref={setSlot} className="autoreg-slot" />} />
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <SessionTemplateCard session={tpl} adjustPct={(applied ?? preview) || null} cardStyle={{ cursor: "default" }} />
      </div>
    </div>
  );
}
