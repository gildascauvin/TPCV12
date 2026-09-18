import type { SessionTemplate, WeekTemplate } from "@/types";
import DiffGauge from "@/components/calendar/DiffGauge";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function avgWeekRpe(week: WeekTemplate): number {
  const sessions = DAYS.flatMap(d => (week[d] ?? []) as SessionTemplate[]);
  if (!sessions.length) return 0;
  return sessions.reduce((sum, s) => sum + (s.target_difficulty ?? 5), 0) / sessions.length;
}

export function loadBarColor(avg: number): string {
  if (!avg) return "#e5e7eb";
  if (avg <= 4) return "#2f9e44";
  if (avg <= 7) return "#f28a00";
  return "#d44000";
}

export function SessionTemplateCard({ session, onClick, dragHandleProps, cardRef, cardStyle, renderExerciseLine, badgeOverride, gaugeOverride }: {
  session: SessionTemplate;
  onClick?: () => void;
  dragHandleProps?: Record<string, unknown>;
  cardRef?: (el: HTMLDivElement | null) => void;
  cardStyle?: React.CSSProperties;
  renderExerciseLine?: (line: string, index: number) => React.ReactNode;
  /* Aperçu autorégulation sur /p/[id] (2026-09) — remplace le badge "Prévu" fixe par la reco
     ("+10%"/"−20%") quand une suggestion est active pour cette séance. Additif, aucun autre
     appelant ne le passe (`Prévu` reste le comportement par défaut, inchangé). */
  badgeOverride?: { label: string; bg: string; color: string };
  /* Idem pour la jauge : affiche la difficulté ajustée (adjustDifficulty()) plutôt que
     session.target_difficulty brut, sans jamais muter la séance elle-même. */
  gaugeOverride?: number;
}) {
  const exercises = session.notes ? session.notes.split("\n").filter(Boolean) : [];
  const gaugeValue = gaugeOverride ?? session.target_difficulty ?? null;
  return (
    <div ref={cardRef} onClick={onClick} style={{
      cursor: onClick ? "pointer" : "default",
      border: "1px solid rgba(212,64,0,0.16)", background: "#fff", borderRadius: 14,
      padding: "10px 11px", boxShadow: "0 2px 10px rgba(0,0,0,0.045)",
      transition: "transform .2s ease, box-shadow .2s ease",
      ...cardStyle,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 5, marginBottom: 8 }}>
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            onClick={e => e.stopPropagation()}
            title="Glisser vers un autre jour"
            style={{ cursor: "grab", touchAction: "none", color: "#c7ccd1", fontSize: 12, flexShrink: 0, marginTop: 2, userSelect: "none" as const, lineHeight: 1 }}
          >⠿</span>
        )}
        <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25, color: "#171b1f", letterSpacing: "-0.025em", wordBreak: "break-word", flex: 1 }}>
          {session.name}
        </div>
        <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 7px", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0, background: badgeOverride?.bg ?? "rgba(212,64,0,0.10)", color: badgeOverride?.color ?? "#d44000" }}>
          {badgeOverride?.label ?? "Prévu"}
        </span>
      </div>
      {gaugeValue ? <DiffGauge value={gaugeValue} height={10} /> : null}
      {exercises.length > 0 && (
        <div style={{ marginTop: 7, borderRadius: 10, overflow: "hidden", background: "#f7f7f7", border: "1px solid rgba(0,0,0,.07)" }}>
          {exercises.map((ex, i) => renderExerciseLine ? (
            <div key={i}>{renderExerciseLine(ex, i)}</div>
          ) : (
            <div key={i} style={{
              padding: "6px 9px", fontSize: 11, lineHeight: 1.4, color: "#2c3236", fontWeight: 600,
              borderTop: i > 0 ? "1px solid rgba(0,0,0,.07)" : "none",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>{ex}</div>
          ))}
        </div>
      )}
    </div>
  );
}
