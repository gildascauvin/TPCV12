"use client";

import { format } from "date-fns";
import DiffGauge from "@/components/calendar/DiffGauge";
import PlanningRing from "@/components/calendar/PlanningRing";
import AlertBox from "@/components/calendar/AlertBox";
import { loadRule, ruleTagColors, type LoadContext } from "@/lib/loadRule";
import type { DayAlert } from "@/lib/alerts";
/* Seul le score est lu ici — un objet minimal suffit, permet à /coach/planning (qui n'a qu'un
   score déjà résolu par jour, pas une ligne wellness_daily complète) de passer directement sans
   fabriquer un faux WellnessDaily. */
export interface WellnessScoreLike { score: number | null }

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function scoreColor(score: number | null) {
  if (score === null) return "rgba(255,255,255,0.18)";
  return score >= 75 ? "#2f9e44" : score >= 55 ? "#f28a00" : "#d10000";
}
function formLabel(score: number | null) {
  if (score === null) return "Non renseigné";
  if (score >= 82) return "Zone optimale";
  if (score >= 65) return "Zone stable";
  if (score >= 45) return "Zone prudente";
  return "Zone récupération";
}

/* Forme minimale commune à `Session` (sportif) et `CoachViewSession` (coach) — permet à DayColumn/
   WeekSessionCard d'être littéralement le même composant sur /week et /coach/planning, chacun avec
   son propre type concret (générique T), sans dupliquer le rendu. */
export interface SessionLike {
  id: string;
  date: string;
  name: string;
  notes: string | null;
  duration: number | null;
  rpe: number | null;
  done: boolean;
  target_difficulty: number | null;
}

/* ─── Week session card (v59 POC exact layout) — extrait de WeekClient.tsx pour être réutilisé
   à l'identique par /coach/planning et par l'aperçu programme de l'onboarding (WeekPreviewStep.tsx). ─── */
export function WeekSessionCard<T extends SessionLike>({ session, onComplete, onEdit, onDuplicate, dragHandleProps, cardRef, cardStyle, renderExerciseLine }: {
  session: T;
  onComplete: (s: T) => void;
  onEdit: (s: T) => void;
  onDuplicate: (s: T) => void;
  /* Optionnelles — branchées par WeekClient.tsx/CoachPlanningClient.tsx pour le drag & drop entre
     jours (dnd-kit). `undefined` par défaut : zéro impact sur l'aperçu onboarding (WeekPreviewStep.tsx),
     qui ne les passe jamais. */
  dragHandleProps?: Record<string, unknown>;
  cardRef?: (el: HTMLDivElement | null) => void;
  cardStyle?: React.CSSProperties;
  /* Réordonnancement des exercices par drag & drop — remplace le rendu par défaut d'une ligne
     d'exercice quand fourni. */
  renderExerciseLine?: (line: string, index: number) => React.ReactNode;
}) {
  const exercises = session.notes ? session.notes.split("\n").filter(Boolean) : [];
  // Single gauge: rpe if done, target_difficulty if planned
  const gaugeValue = session.done ? (session.rpe ?? null) : (session.target_difficulty ?? null);

  return (
    <div
      ref={cardRef}
      style={{
        border: session.done ? "1px solid rgba(45,125,22,0.16)" : "1px solid rgba(212,64,0,0.16)",
        background: "#fff", borderRadius: 14, padding: "10px 11px",
        cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.045)",
        transition: "transform .2s ease, box-shadow .2s ease",
        ...cardStyle,
      }}
      onClick={() => onEdit(session)}
    >
      {/* 1. Name + badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 5, marginBottom: 8 }}>
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            title="Glisser vers un autre jour"
            style={{ cursor: "grab", touchAction: "none", color: "#c7ccd1", fontSize: 12, flexShrink: 0, marginTop: 2, userSelect: "none" as const, lineHeight: 1 }}
          >⠿</span>
        )}
        <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25, color: "#171b1f", letterSpacing: "-0.025em", wordBreak: "break-word", flex: 1 }}>
          {session.name}
        </div>
        <span style={{
          fontSize: 9, fontWeight: 800, padding: "3px 7px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0,
          background: session.done ? "rgba(47,158,68,.12)" : "rgba(212,64,0,0.10)",
          color: session.done ? "#2f9e44" : "#d44000",
        }}>
          {session.done ? "Terminé" : "Prévu"}
        </span>
      </div>

      {/* 2. Single gauge — no label */}
      {gaugeValue && (
        <div style={{ marginBottom: 8 }}>
          <DiffGauge value={gaugeValue} height={10} />
        </div>
      )}

      {/* 3. Exercise display list (v50 — no numbers) */}
      {exercises.length > 0 && (
        <div style={{ marginBottom: 8, borderRadius: 12, overflow: "hidden", background: "#f7f7f7", border: "1px solid rgba(0,0,0,.07)" }}>
          {exercises.map((ex, i) => renderExerciseLine ? (
            <div key={i}>{renderExerciseLine(ex, i)}</div>
          ) : (
            <div key={i} style={{
              padding: "7px 9px", fontSize: 11.5, lineHeight: 1.4,
              color: "#2c3236", fontWeight: 600,
              borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none",
              background: "#fff", whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {ex}
            </div>
          ))}
        </div>
      )}

      {/* 4. Actions */}
      <div style={{ display: "flex", gap: 5 }} onClick={e => e.stopPropagation()}>
        <button
          data-tour="terminer-btn"
          onClick={() => onComplete(session)}
          style={{
            flex: 1, height: 32, borderRadius: 9, fontSize: 11, fontWeight: 800, cursor: "pointer",
            background: session.done ? "#fff" : "linear-gradient(180deg,#f04a08,#d44000)",
            color: session.done ? "#171b1f" : "#fff",
            border: session.done ? "1px solid rgba(0,0,0,.10)" : "none",
            boxShadow: session.done ? "none" : "0 4px 12px rgba(212,64,0,.20)",
          }}
        >
          {session.done ? "Résultat" : "Terminer"}<span className="tour-lock">🔒</span>
        </button>
        <button
          onClick={() => onDuplicate(session)} title="Dupliquer"
          style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(0,0,0,.09)", background: "#f7f8f9", color: "#8a8f94", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >⎘</button>
      </div>
    </div>
  );
}

/* ─── Day column — extrait de WeekClient.tsx, réutilisé à l'identique par /coach/planning
   (CoachPlanningClient.tsx, générique sur CoachViewSession) et par l'aperçu programme de
   l'onboarding (WeekPreviewStep.tsx, générique sur Session). ─── */
export default function DayColumn<T extends SessionLike>({ date, sessions, wellness, todayStr, ctx, onAddSession, onComplete, onEdit, onDuplicate, onWellness, hideDayNumber, recoveryAdvice, alert, renderSession, columnRef, columnStyle }: {
  date: Date; sessions: T[]; wellness: WellnessScoreLike | null;
  todayStr: string; ctx?: LoadContext; onAddSession: (d: string) => void;
  onComplete: (s: T) => void; onEdit: (s: T) => void;
  onDuplicate: (s: T) => void; onWellness: () => void;
  /* Props optionnelles réservées à l'aperçu programme de l'onboarding (WeekPreviewStep.tsx) —
     `false`/`undefined` par défaut, donc zéro impact sur /week et /coach/planning. */
  hideDayNumber?: boolean;
  recoveryAdvice?: string;
  /* Remplace tout l'encart (prioritaire sur recoveryAdvice) — réservé à la carte "aujourd'hui",
     reprend le style/logique réels de l'alerte wellness de TodayClient.tsx (sportif) ou de
     decisionText() de CoachAthleteCard.tsx (coach). */
  alert?: DayAlert;
  /* Optionnelles — branchées par WeekClient.tsx/CoachPlanningClient.tsx pour le drag & drop entre
     jours, `undefined` par défaut ailleurs (onboarding) : zéro changement de comportement. */
  renderSession?: (session: T) => React.ReactNode;
  columnRef?: (el: HTMLDivElement | null) => void;
  columnStyle?: React.CSSProperties;
}) {
  const dstr = format(date, "yyyy-MM-dd");
  const isToday = dstr === todayStr;
  const score = wellness?.score ?? null;
  const rule = loadRule(sessions, ctx);
  const tagColor = ruleTagColors[rule.cls];

  return (
    <div ref={columnRef} className="week-col-width" style={{
      background: "#fff",
      border: isToday ? "1.5px solid #d44000" : "1px solid rgba(0,0,0,0.08)",
      borderRadius: 26, padding: 16,
      boxShadow: isToday ? "0 0 0 0 transparent, 0 8px 24px rgba(212,64,0,.08)" : "0 6px 18px rgba(0,0,0,0.05)",
      scrollSnapAlign: "start",
      transition: "transform 0.22s ease, box-shadow 0.22s ease",
      ...columnStyle,
    }}>
      {/* Header: day + ring */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 1000, letterSpacing: "0.12em", color: "#8a8f94", textTransform: "uppercase" }}>
            {DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1]}
          </div>
          {!hideDayNumber && (
            <div style={{ fontSize: 26, fontWeight: 1000, color: "#171b1f", lineHeight: 1.05, letterSpacing: "-0.04em" }}>
              {date.getDate()}
            </div>
          )}
          {isToday && (
            <span style={{ display: "inline-block", fontSize: 9, fontWeight: 800, color: "#fff", background: "#d44000", padding: "2px 7px", borderRadius: 999, marginTop: 3, letterSpacing: "0.04em" }}>
              Aujourd'hui
            </span>
          )}
        </div>
        <div onClick={e => { e.stopPropagation(); onWellness(); }} style={{ cursor: "pointer" }}>
          <PlanningRing score={score} />
        </div>
      </div>

      {/* Zone label */}
      <div style={{ fontSize: 10, fontWeight: 800, color: score !== null ? scoreColor(score) : "#8a8f94", marginBottom: 8, letterSpacing: "0.01em" }}>
        {formLabel(score)}
      </div>

      {/* Load rule card — remplacé par l'alerte wellness/décision quand un cas notable est détecté
         (prioritaire), sinon par le conseil récupération quand recoveryAdvice est fourni (aperçu
         onboarding uniquement, amalgame /today+/week). Seul CE bloc passe en sombre avec halo +
         pastille pulsants (copie exacte de CoachAthleteCard.tsx, showBadge) — la carte du jour reste
         blanche, comme /week et /coach/planning en vrai. */}
      {alert ? (
        <AlertBox alert={alert} />
      ) : recoveryAdvice ? (
        <div style={{ margin: "0 0 12px", padding: "11px 13px", borderRadius: 16, background: "#f5f5f5", border: "1px solid rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase", color: "#171b1f", marginBottom: 5 }}>🌿 Récupération</div>
          <div style={{ fontSize: 11, lineHeight: 1.45, color: "#555b60" }}>{recoveryAdvice}</div>
        </div>
      ) : (
        <div style={{ margin: "0 0 12px", padding: "11px 13px", borderRadius: 16, background: "#f5f5f5", border: "1px solid rgba(0,0,0,.06)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.02em", color: "#171b1f", lineHeight: 1.2 }}>{rule.title}</div>
            <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.09em", borderRadius: 999, padding: "4px 7px", whiteSpace: "nowrap", background: tagColor.bg, color: tagColor.color, flexShrink: 0 }}>
              {rule.tag}
            </div>
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.45, color: "#555b60" }}>{rule.text}</div>
        </div>
      )}

      {/* Sessions label */}
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.13em", color: "#8a8f94", textTransform: "uppercase", marginBottom: 7 }}>
        Séances · {sessions.length}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sessions.length === 0 && (
          <div style={{ fontSize: 10, color: "#8a8f94", textAlign: "center", border: "0.5px dashed rgba(0,0,0,0.12)", borderRadius: 10, padding: "11px 4px" }}>
            Repos / libre
          </div>
        )}
        {sessions.map(s => renderSession ? renderSession(s) : (
          <WeekSessionCard key={s.id} session={s} onComplete={onComplete} onEdit={onEdit} onDuplicate={onDuplicate} />
        ))}
        <div
          data-tour="add-session-btn"
          onClick={e => { e.stopPropagation(); onAddSession(dstr); }}
          style={{ border: "0.5px dashed rgba(212,64,0,.32)", color: "#d44000", background: "#fff", borderRadius: 10, padding: "9px 8px", textAlign: "center", fontSize: 11, cursor: "pointer", fontWeight: 700, transition: "all .15s" }}
        >
          + Ajouter une séance
        </div>
      </div>
    </div>
  );
}
