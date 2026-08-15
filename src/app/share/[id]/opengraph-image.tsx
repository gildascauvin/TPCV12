import { ImageResponse } from "next/og";
import { getShare } from "./shareMeta";
import { wellnessColor } from "@/lib/wellness";

/* Image OG dynamique par partage — sans ça, WhatsApp n'affiche souvent AUCUNE carte de preview.
   Reprend fidèlement le vrai visuel de chaque carte (ShareView.tsx) plutôt qu'un résumé texte
   générique — retour explicite de Gildas après un 1er jet trop pauvre (juste eyebrow/titre/
   description). satori (moteur de next/og) supporte flexbox/gap/border-radius/gradient/SVG basique
   (cercle, polyline) mais pas box-shadow ni transform sur <svg> de façon fiable — le ring est donc
   construit sans rotation (cercle plein qui se remplit depuis 12h, pas depuis le haut comme dans
   l'app réelle : différence mineure assumée, invisible à l'échelle d'une preview de chat). */

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#d44000";
type Behavior = { emoji: string; label: string; positive: boolean };

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: "linear-gradient(180deg,#f04a08,#d44000)", display: "flex" }} />
      <div style={{ fontSize: 24, fontWeight: 900, display: "flex" }}>ThePerfClub</div>
    </div>
  );
}

function Ring({ score, size: s = 150 }: { score: number | null; size?: number }) {
  const r = s * 0.42;
  const circ = 2 * Math.PI * r;
  const pct = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = circ * (1 - pct / 100);
  const color = wellnessColor(score);
  return (
    <div style={{ position: "relative", width: s, height: s, display: "flex" }}>
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ display: "flex" }}>
        <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={s * 0.08} />
        <circle
          cx={s / 2} cy={s / 2} r={r} fill="none" stroke={color} strokeWidth={s * 0.08}
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: s * 0.32, fontWeight: 900, color, display: "flex" }}>{score ?? "—"}</div>
        <div style={{ fontSize: s * 0.09, fontWeight: 800, color: "rgba(255,255,255,.55)", textTransform: "uppercase", display: "flex" }}>récup.</div>
      </div>
    </div>
  );
}

function Chip({ b }: { b: Behavior }) {
  return (
    <div style={{
      display: "flex", fontSize: 20, fontWeight: 700, padding: "6px 16px", borderRadius: 999,
      background: b.positive ? "rgba(47,158,68,.22)" : "rgba(212,64,0,.26)", color: b.positive ? "#bfeec8" : "#ffd2bf",
    }}>
      {b.emoji} {b.label}
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const cls = value >= 8 ? "hard" : value >= 5 ? "moderate" : "easy";
  const bg = { hard: "linear-gradient(90deg,#ffb5a7,#d44000)", moderate: "linear-gradient(90deg,#ffe0a0,#f28a00)", easy: "linear-gradient(90deg,#bfeec8,#2f9e44)" }[cls];
  const w = Math.max(22, Math.min(100, Math.round(value * 10)));
  return (
    <div style={{ display: "flex", width: "100%", height: 18, borderRadius: 999, background: "#e7e4df" }}>
      <div style={{ display: "flex", height: "100%", width: `${w}%`, borderRadius: 999, background: bg }} />
    </div>
  );
}

// Bandes ACWR — mêmes seuils/couleurs que ZoneSparkline.tsx (Gabbett et al.)
const ZONES = [
  { max: 0.8, color: "#7ecb20" },
  { max: 1.3, color: "#2f9e44" },
  { max: Infinity, color: "#d44000" },
];
function zoneColorFor(v: number) { return (ZONES.find(z => v < z.max) ?? ZONES[2]).color; }

function MiniLine({ points, colorFn, fixedColor }: { points: (number | null)[]; colorFn?: (v: number) => string; fixedColor?: string }) {
  const w = 900, h = 220, pad = 14;
  const vals = points.filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const min = Math.min(...vals, 0), max = Math.max(...vals, min + 1);
  const span = max - min || 1;
  const step = (w - pad * 2) / Math.max(1, points.length - 1);
  const coords = points.map((v, i) => v === null ? null : { x: pad + i * step, y: pad + (h - pad * 2) - ((v - min) / span) * (h - pad * 2) });
  const line = coords.filter((c): c is { x: number; y: number } => c !== null).map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "flex" }}>
      <polyline points={line} fill="none" stroke="rgba(255,255,255,.85)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => c && (
        <circle key={i} cx={c.x} cy={c.y} r={9} fill="#1c1c1c" stroke={fixedColor ?? colorFn?.(points[i] as number) ?? "#fff"} strokeWidth={4} />
      ))}
    </svg>
  );
}

function Card({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
      padding: 56, background: dark ? "linear-gradient(135deg,#1a1a1a,#282828)" : "#ffffff", color: dark ? "#ffffff" : "#171b1f",
    }}>
      {children}
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getShare(id);

  if (!row) {
    return new ImageResponse(
      (
        <Card dark>
          <Logo />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2, color: ACCENT, display: "flex" }}>PARTAGE</div>
            <div style={{ fontSize: 52, fontWeight: 900, display: "flex" }}>ThePerfClub</div>
          </div>
        </Card>
      ),
      { ...size }
    );
  }

  const s = row.snapshot as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  if (row.resource_type === "session") {
    const exercises: string[] = Array.isArray(s.exercises) ? s.exercises : [];
    const shown = exercises.slice(0, 4);
    const more = exercises.length - shown.length;
    return new ImageResponse(
      (
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Logo />
            <div style={{ display: "flex", fontSize: 20, fontWeight: 800, padding: "8px 18px", borderRadius: 999, background: s.done ? "rgba(47,158,68,.13)" : "rgba(212,64,0,.1)", color: s.done ? "#2f9e44" : "#d44000" }}>
              {s.done ? "Terminé" : "Prévu"}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 44, fontWeight: 900, display: "flex" }}>{s.name}</div>
            {s.difficulty != null && <Gauge value={s.difficulty} />}
            {shown.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", border: "2px solid rgba(0,0,0,.08)", borderRadius: 18, overflow: "hidden" }}>
                {shown.map((ex, i) => (
                  <div key={i} style={{ display: "flex", padding: "14px 18px", borderTop: i > 0 ? "1px solid rgba(0,0,0,.06)" : "none", fontSize: 22, fontWeight: 650, color: "#2c3236" }}>
                    {ex.length > 70 ? ex.slice(0, 70) + "…" : ex}
                  </div>
                ))}
                {more > 0 && (
                  <div style={{ display: "flex", padding: "10px 18px", borderTop: "1px solid rgba(0,0,0,.06)", fontSize: 18, color: "#8a8f94" }}>+{more} autre{more > 1 ? "s" : ""}</div>
                )}
              </div>
            )}
          </div>
        </Card>
      ),
      { ...size }
    );
  }

  if (row.resource_type === "wellness" || row.resource_type === "coach_athlete") {
    const isCoach = row.resource_type === "coach_athlete";
    const behaviors: Behavior[] = Array.isArray(s.behaviors) ? s.behaviors.slice(0, 3) : [];
    const eyebrow = isCoach ? "COACH CONTROL" : "SCORE & CONSEILS";
    const heading = isCoach ? s.athleteName : s.zoneLabel;
    return new ImageResponse(
      (
        <Card dark>
          <Logo />
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
              <Ring score={s.score ?? null} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2, color: "#ff8a55", display: "flex" }}>{eyebrow}</div>
                <div style={{ fontSize: 46, fontWeight: 900, display: "flex" }}>{heading}</div>
                {behaviors.length > 0 && <div style={{ display: "flex", gap: 8 }}>{behaviors.map((b, i) => <Chip key={i} b={b} />)}</div>}
              </div>
            </div>
            <div style={{
              display: "flex", fontSize: 24, lineHeight: 1.4, color: "rgba(255,255,255,.85)",
              background: "rgba(255,255,255,.06)", borderRadius: 18, padding: "18px 22px", maxWidth: 1000,
            }}>
              {(isCoach ? s.decision : s.recoveryAdvice)?.slice(0, 130) ?? ""}
            </div>
          </div>
        </Card>
      ),
      { ...size }
    );
  }

  // charge / recuperation
  const isCharge = row.resource_type === "charge";
  const points: (number | null)[] = isCharge ? (s.points ?? []) : (s.points ?? []);
  return new ImageResponse(
    (
      <Card dark>
        <Logo />
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2, color: "#ff8a55", display: "flex" }}>
            {isCharge ? "⚡ CHARGE D'ENTRAÎNEMENT" : "🌿 RÉCUPÉRATION"}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "rgba(255,255,255,.8)", maxWidth: 1000 }}>{(s.insight ?? "").slice(0, 130)}</div>
          <div style={{ display: "flex", background: "rgba(255,255,255,.04)", borderRadius: 18, padding: "20px 24px" }}>
            {isCharge
              ? <MiniLine points={points} colorFn={zoneColorFor} />
              : <MiniLine points={points} fixedColor={s.color ?? "#7fa8ea"} />}
          </div>
        </div>
      </Card>
    ),
    { ...size }
  );
}
