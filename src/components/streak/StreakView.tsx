"use client";

import { RewardGlyph, DayGlyph, Chevron } from "@/components/streak/BrandIcons";
import type { RewardKey, Reward, DayKind } from "@/lib/streak";
import type { StreakPayload } from "@/lib/streakClient";
import { useStreakCss } from "@/components/streak/Flame";

/* Contenu de la série (P1, 24/11/2026), partagé par le panneau de la puce et la page « série » du mini
   bilan : la semaine, le record, la prochaine récompense (avec sa progression), la révélation d'une
   récompense gagnée, la grille. Fond sombre. Jamais d'anneau : il reste réservé à la décision du jour. */

const LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

export function streakTitle(s: StreakPayload): string {
  if (s.current === 0) return "Ta série commence aujourd'hui";
  return `${s.current} jour${s.current > 1 ? "s" : ""} d'affilée`;
}

export function streakLine(s: StreakPayload): string {
  const t = s.todayState;
  if (t.validated) return t.kind === "saved" ? "Ta forme demandait de lever le pied : ta journée est sauvée." : "";
  if (!t.checkin) return "Ton point forme d'abord, puis ta séance.";
  return t.planned ? "Point forme fait. Ta séance valide la journée." : "Point forme fait.";
}

export function recordLine(s: StreakPayload): string {
  const parts = [`Record ${s.record} jour${s.record > 1 ? "s" : ""}`];
  if (s.saved) parts.push(`${s.saved} jour${s.saved > 1 ? "s" : ""} sauvé${s.saved > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

export function WeekStrip({ s }: { s: StreakPayload }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 5 }}>
      {s.week.map((d, i) => {
        const isToday = d.date === s.today;
        const bg = d.validated ? "rgba(255,255,255,.09)" : "rgba(255,255,255,.04)";
        return (
          <div key={d.date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ width: "100%", height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: bg, color: d.validated ? "#fff" : "rgba(255,255,255,.3)", boxShadow: isToday ? "inset 0 0 0 2px #fff" : "none" }}>
              {d.validated && (d.kind === "session" || d.kind === "rest" || d.kind === "saved") ? <span role="img" aria-label={d.kind === "session" ? "séance" : d.kind === "rest" ? "repos" : "jour sauvé"}><DayGlyph kind={d.kind} /></span> : null}
            </span>
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, color: isToday ? "#fff" : "rgba(255,255,255,.45)", fontWeight: isToday ? 700 : 400 }}>{LETTERS[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

function Medallion({ r, size = 48, reveal = false }: { r: Reward; size?: number; reveal?: boolean }) {
  const on = r.earned;
  /* Gagnée : le curseur du logo (disque noir, liseré blanc). À venir : disque vide, liseré gris. */
  return (
    <span className={reveal ? "tpc-medal" : undefined} style={{
      width: size, height: size, margin: "0 auto", borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0,
      background: on ? "#18181b" : "transparent",
      boxShadow: on ? `inset 0 0 0 ${Math.max(2, size / 22)}px #fff, 0 ${size / 10}px ${size / 3}px rgba(212,64,0,.28)` : "inset 0 0 0 1.5px rgba(255,255,255,.16)",
    }}>
      <RewardGlyph k={r.key} size={size * 0.56} on={on} />
    </span>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = Math.max(4, Math.min(100, (value / total) * 100));
  return (
    <span style={{ display: "block", height: 5, borderRadius: 3, background: "rgba(255,255,255,.12)", overflow: "hidden" }}>
      <span style={{ display: "block", width: `${pct}%`, height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#e8460a,#ffb347)" }} />
    </span>
  );
}

const leftTxt = (p: { value: number; total: number }, key: RewardKey) => {
  const n = p.total - p.value;
  return key === "perfect_week" ? `${p.value} jour${p.value > 1 ? "s" : ""} sur 7 cette semaine` : `Plus que ${n} jour${n > 1 ? "s" : ""}`;
};

export function RewardGrid({ rewards }: { rewards: Reward[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
      {rewards.map(r => (
        <div key={r.key} style={{ borderRadius: 16, padding: "12px 8px", textAlign: "center", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", gap: 7 }}>
          <Medallion r={r} />
          <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, color: r.earned ? "#fff" : "rgba(255,255,255,.55)" }}>{r.label}</span>
          {!r.earned && r.progress && r.progress.value > 0 && <ProgressBar value={r.progress.value} total={r.progress.total} />}
        </div>
      ))}
    </div>
  );
}

export function NextReward({ r, onClick }: { r: Reward; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", gap: 12, alignItems: "center", width: "100%", textAlign: "left", padding: "11px 12px", borderRadius: 16, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.05)", color: "#fff", cursor: onClick ? "pointer" : "default", fontFamily: "inherit" }}>
      <Medallion r={r} size={40} />
      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.45)" }}>Prochaine récompense</span>
        <span style={{ fontSize: 14.5, fontWeight: 800 }}>{r.label}</span>
        {r.progress && r.progress.value > 0
          ? <><ProgressBar value={r.progress.value} total={r.progress.total} /><span style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>{leftTxt(r.progress, r.key)}</span></>
          : <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.6)", lineHeight: 1.35 }}>{r.hint}</span>}
      </span>
      {onClick ? <Chevron size={18} /> : <span />}
    </button>
  );
}

/** Révélation d'une récompense qui vient d'être gagnée : le médaillon s'allume, son nom, une phrase. */
export function RewardReveal({ r }: { r: Reward }) {
  useStreakCss();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8, padding: "16px 14px", borderRadius: 18, background: "radial-gradient(120% 90% at 50% 0%, rgba(255,122,40,.22), rgba(255,255,255,.04) 70%)", border: "1px solid rgba(255,138,85,.3)" }}>
      <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#ff8a55" }}>Nouvelle récompense</span>
      <Medallion r={r} size={68} reveal />
      <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>{r.label}</span>
      <span style={{ fontSize: 13.5, color: "rgba(255,255,255,.72)", lineHeight: 1.45 }}>{r.won}</span>
    </div>
  );
}

/** Rangée de récompenses sous la série (panneau de la puce, 24/11) : la prochaine en premier, puis les
    gagnées, puis celles à venir. Un tap affiche le détail dessous ; la prochaine est sélectionnée d'office. */
export function RewardRail({ rewards, next, selected, onSelect, onGo }: {
  rewards: Reward[]; next: Reward | null; selected: RewardKey | null; onSelect: (k: RewardKey) => void;
  /** Action d'une récompense (étapes de démarrage) : « Y aller ». */
  onGo?: (r: Reward) => void;
}) {
  const ordered = [...(next ? [next] : []), ...rewards.filter(r => r.earned), ...rewards.filter(r => !r.earned && r.key !== next?.key)];
  const sel = ordered.find(r => r.key === selected) ?? ordered[0];
  if (!sel) return null;
  const isNext = sel.key === next?.key;
  return (
    <div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", margin: "0 -18px", padding: "4px 18px 6px", scrollbarWidth: "none" }}>
        {ordered.map(r => {
          const on = r.key === sel.key;
          return (
            <button key={r.key} type="button" onClick={() => onSelect(r.key)} aria-pressed={on} aria-label={r.label}
              style={{ flex: "0 0 auto", border: 0, background: "none", padding: 3, borderRadius: "50%", cursor: "pointer", boxShadow: on ? "0 0 0 2px #fff" : "none", opacity: on || r.earned || r.key === next?.key ? 1 : 0.7 }}>
              <Medallion r={r} size={46} />
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 8, padding: "11px 12px", borderRadius: 14, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: sel.earned ? "#ff8a55" : "rgba(255,255,255,.45)" }}>
          {sel.earned ? "Gagnée" : isNext ? "Prochaine récompense" : "À venir"}
        </span>
        <span style={{ fontSize: 14.5, fontWeight: 800 }}>{sel.label}</span>
        <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.65)", lineHeight: 1.4 }}>{sel.earned ? sel.won : sel.hint}</span>
        {!sel.earned && sel.note && <span style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>{sel.note}</span>}
        {!sel.earned && sel.progress && sel.progress.value > 0 && (
          <span style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
            <ProgressBar value={sel.progress.value} total={sel.progress.total} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>{leftTxt(sel.progress, sel.key)}</span>
          </span>
        )}
        {!sel.earned && onGo && (sel.key === "form" || sel.key === "build" || sel.key === "adjust" || sel.key === "unlock") && (
          <button type="button" onClick={() => onGo(sel)} style={{ alignSelf: "flex-start", marginTop: 4, border: 0, background: "none", padding: 0, color: "#ff8a55", fontFamily: "inherit", fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}>
            Y aller <Chevron size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
