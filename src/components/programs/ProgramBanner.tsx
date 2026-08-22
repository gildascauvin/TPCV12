"use client";

import type { Program } from "@/types";
import { useBreakpoint } from "@/hooks/useBreakpoint";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const LEVEL_LABELS: Record<string, string> = {
  debutant: "Débutant", intermediaire: "Intermédiaire", avance: "Avancé", elite: "Élite",
};

function avgWeekRpe(week: Record<string, { target_difficulty: number }[]>): number {
  const sessions = DAYS.flatMap(d => week[d] ?? []);
  if (!sessions.length) return 0;
  return sessions.reduce((sum, s) => sum + (s.target_difficulty ?? 5), 0) / sessions.length;
}

function loadColor(avg: number): string {
  if (avg <= 4) return "#2f9e44";
  if (avg <= 7) return "#f28a00";
  return "#d44000";
}

function sportEmoji(sport?: string | null): string {
  if (!sport) return "🏋️";
  const s = sport.toLowerCase();
  if (s.includes("halt") || s.includes("force") || s.includes("power")) return "🏋️";
  if (s.includes("sprint") || s.includes("athlé")) return "⚡";
  if (s.includes("combat") || s.includes("art")) return "🥊";
  if (s.includes("fitness") || s.includes("forme")) return "💪";
  if (s.includes("collectif")) return "⚽";
  return "🏃";
}

interface Props {
  program?: Program | null;
  currentWeek?: number;
  onEdit?: () => void;
  onStop?: () => void;
  onOpenLibrary?: () => void;
  onReconduire?: () => void;
}

export default function ProgramBanner({ program, currentWeek, onEdit, onStop, onOpenLibrary, onReconduire }: Props) {
  const { isMd } = useBreakpoint();
  const curWi = currentWeek ?? -1;
  const isActiveWeek = !!program && curWi >= 0 && curWi < program.weeks_count;

  if (!isActiveWeek) {
    return (
      <div style={{
        background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.08)", padding: "11px 18px",
        display: "flex", flexDirection: isMd ? "row" : "column", alignItems: isMd ? "center" : "flex-start",
        justifyContent: "space-between", gap: isMd ? 0 : 10,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 2 }}>Aucun programme actif</div>
          <div style={{ fontSize: 11, color: "#8a8f94" }}>Les séances libres restent disponibles</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, width: isMd ? "auto" : "100%" }}>
          {onReconduire && (
            <button onClick={onReconduire} style={{ flex: isMd ? undefined : 1, padding: "6px 13px", borderRadius: 10, border: "1px solid rgba(0,0,0,.12)", cursor: "pointer", background: "#fff", color: "#62686e", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>
              Reconduire la semaine →
            </button>
          )}
          {onOpenLibrary && (
            <button data-tour="programmes-btn" onClick={onOpenLibrary} style={{ flex: isMd ? undefined : 1, padding: "6px 13px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontWeight: 700, fontSize: 11, boxShadow: "0 4px 12px rgba(212,64,0,.20)", whiteSpace: "nowrap" }}>
              📚 Programmes<span className="tour-lock">🔒</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const bars = program!.template.weeks.map(w => avgWeekRpe(w as Record<string, { target_difficulty: number }[]>));
  const maxBar = Math.max(...bars, 1);
  const levelLabel = program!.level ? LEVEL_LABELS[program!.level] : null;
  const focusLabel = `S${curWi + 1}/${program!.weeks_count}`;

  return (
    <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.08)", padding: "10px 18px", display: "flex", alignItems: "center", gap: 12 }}>
      {/* Sport icon */}
      <div style={{ width: 38, height: 38, borderRadius: 11, background: "#f1f0ee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
        {sportEmoji(program!.sport)}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.02em" }}>
          {program!.name}
        </div>
        <div style={{ fontSize: 11, color: "#8a8f94", marginTop: 1 }}>
          {[focusLabel, levelLabel].filter(Boolean).join(" · ")}
        </div>
      </div>

      {/* Load bars */}
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 28, flexShrink: 0 }}>
        {bars.map((b, i) => (
          <div key={i} style={{
            width: 10, borderRadius: "2px 2px 0 0",
            height: Math.max(4, Math.round((b / maxBar) * 24)),
            background: loadColor(b),
            outline: i === curWi ? "2px solid #d44000" : "none",
            outlineOffset: 1,
          }} />
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {onEdit && (
          <button data-tour="modifier-btn" onClick={onEdit} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid rgba(212,64,0,.25)", cursor: "pointer", background: "#fff", color: "#d44000", fontWeight: 700, fontSize: 11 }}>
            ✏️ Modifier<span className="tour-lock">🔒</span>
          </button>
        )}
        {onStop && (
          <button onClick={onStop} style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid rgba(212,64,0,.25)", cursor: "pointer", background: "#fff", color: "#d44000", fontWeight: 700, fontSize: 11 }}>
            Arrêter
          </button>
        )}
      </div>
    </div>
  );
}
