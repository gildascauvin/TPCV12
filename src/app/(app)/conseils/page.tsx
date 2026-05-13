export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import type { Session, WellnessDaily, Profile } from "@/types";

const BEHAVIOR_LABELS: Record<string, string> = {
  alcohol: "🍷 Alcool",
  late_sleep: "🌙 Couché tardif",
  tobacco: "🚬 Tabac",
  screen_late: "📱 Écran tard",
  heavy_meal: "🍔 Repas lourd",
  caffeine_late: "☕ Caféine tard",
  social_out: "🎉 Sortie sociale",
  travel: "✈️ Voyage",
};

const OBJECTIVE_LABELS: Record<string, string> = {
  performance: "Performance",
  longevite: "Longévité",
  stress: "Gestion du stress",
  composition: "Composition corporelle",
  equilibre: "Équilibre",
  rehab: "Réhabilitation",
};

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function scoreColor(s: number | null): string {
  if (s === null) return "rgba(0,0,0,0.10)";
  return s >= 75 ? "#2f9e44" : s >= 55 ? "#f28a00" : "#d10000";
}

function zoneLabel(s: number | null): string {
  if (s === null) return "Non renseigné";
  if (s >= 82) return "Zone optimale";
  if (s >= 65) return "Zone stable";
  if (s >= 45) return "Zone prudente";
  return "Zone récupération";
}

function computeSignature(sessions: Session[], wellnessScore: number) {
  const done = sessions.filter(s => s.done && s.rpe && s.duration);
  const load = done.reduce((a, s) => a + (s.rpe || 0) * (s.duration || 0), 0);
  const avg = done.length ? done.reduce((a, s) => a + (s.rpe || 0), 0) / done.length : 7;
  const hard = done.filter(s => (s.rpe || 0) >= 8).length;
  const long = done.filter(s => (s.duration || 0) >= 70).length;
  const signals = done.length;
  const nervous = Math.max(28, Math.min(94, Math.round(42 + hard * 10 + avg * 3)));
  const muscular = Math.max(30, Math.min(94, Math.round(38 + long * 10 + load / 120)));
  const recovery = Math.max(35, Math.min(92, Math.round(wellnessScore - hard * 3 + signals * 2)));
  return { nervous, muscular, recovery, signals, load };
}

// SVG ring for hero
function WellnessRingSVG({ score, size = 96 }: { score: number | null; size?: number }) {
  const r = Math.round(size * 0.423);
  const circ = +(2 * Math.PI * r).toFixed(1);
  const pct = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = +(circ * (1 - pct / 100)).toFixed(1);
  const sw = Math.round(size * 0.077);
  const color = scoreColor(score);
  return (
    <div style={{ position: "relative", flexShrink: 0, width: size, height: size, borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: Math.round(size * 0.29), fontWeight: 1000, lineHeight: 1, letterSpacing: "-0.055em", color: score !== null ? color : "rgba(255,255,255,0.4)" }}>
          {score !== null ? score : "—"}
        </span>
        <span style={{ fontSize: Math.round(size * 0.09), fontWeight: 1000, letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)", marginTop: 2, textTransform: "uppercase" }}>
          well.
        </span>
      </div>
    </div>
  );
}

// 7-day mini bar chart
function WellnessChart({ days }: { days: { date: string; score: number | null; isToday: boolean }[] }) {
  const barW = 28;
  const gap = 7;
  const chartH = 52;
  const totalW = days.length * (barW + gap) - gap;

  return (
    <svg width="100%" viewBox={`0 0 ${totalW} ${chartH + 18}`} style={{ display: "block", overflow: "visible" }}>
      {days.map((d, i) => {
        const x = i * (barW + gap);
        const h = d.score !== null ? Math.max(8, Math.round((d.score / 100) * chartH)) : 6;
        const y = chartH - h;
        const color = d.score !== null ? scoreColor(d.score) : "rgba(0,0,0,0.08)";
        const dayIdx = new Date(d.date + "T12:00:00").getDay();
        const label = DAY_LABELS[dayIdx];
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={h} rx={7} fill={color}
              opacity={d.score === null ? 0.5 : 1} />
            {d.score !== null && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="9" fill={color} fontWeight="800">{d.score}</text>
            )}
            <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fontSize="9"
              fill={d.isToday ? "#d44000" : "#8a8f94"} fontWeight={d.isToday ? "900" : "600"}>
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default async function ConseilsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const today = new Date().toISOString().split("T")[0];
  const since28 = daysAgoStr(28);
  const since7 = daysAgoStr(7);

  const [{ data: rawProfile }, { data: rawSessions }, { data: rawWellness }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
    supabase.from("sessions").select("*").eq("user_id", user!.id).gte("date", since28).order("date", { ascending: false }),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id).gte("date", since28).order("date", { ascending: false }),
  ]);

  const profile = rawProfile as Profile | null;
  const allSessions = (rawSessions || []) as Session[];
  const allWellness = (rawWellness || []) as WellnessDaily[];

  // Last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split("T")[0];
    const w = allWellness.find(w => w.date === dateStr);
    return { date: dateStr, score: w?.score ?? null, isToday: dateStr === today };
  });

  // Trend: last 3 days filled vs previous 3
  const filled7 = last7Days.filter(d => d.score !== null);
  const last3avg = filled7.slice(-3).length
    ? filled7.slice(-3).reduce((a, d) => a + d.score!, 0) / filled7.slice(-3).length : null;
  const prev3avg = filled7.slice(0, Math.max(0, filled7.length - 3)).length
    ? filled7.slice(0, Math.max(0, filled7.length - 3)).reduce((a, d) => a + d.score!, 0) / filled7.slice(0, Math.max(0, filled7.length - 3)).length : null;
  const trendDelta = last3avg !== null && prev3avg !== null ? Math.round(last3avg - prev3avg) : null;
  const trendIcon = trendDelta === null ? "" : trendDelta > 3 ? " ↑" : trendDelta < -3 ? " ↓" : " →";
  const trendColor = trendDelta === null ? "#8a8f94" : trendDelta > 3 ? "#2f9e44" : trendDelta < -3 ? "#d10000" : "#f28a00";

  // Stats 7 days
  const recent7Sessions = allSessions.filter(s => s.date >= since7);
  const done7 = recent7Sessions.filter(s => s.done && s.rpe);
  const planned7 = recent7Sessions.filter(s => !s.done);
  const avgRpe = done7.length
    ? Math.round(done7.reduce((a, s) => a + (s.rpe || 0), 0) / done7.length * 10) / 10 : null;
  const totalLoad = done7.reduce((a, s) => a + (s.rpe || 0) * (s.duration || 45), 0);
  const recent7Wellness = allWellness.filter(w => w.date >= since7);
  const avgWellness = recent7Wellness.length
    ? Math.round(recent7Wellness.reduce((a, w) => a + (w.score ?? w.base_score ?? 0), 0) / recent7Wellness.length) : null;

  // Today
  const todayWellness = allWellness.find(w => w.date === today);
  const wellnessScore = todayWellness?.score ?? todayWellness?.base_score ?? null;

  // Behaviors last 7 days
  const recentBehaviors: { date: string; behaviors: string[] }[] = allWellness
    .filter(w => w.date >= since7 && w.behaviors?.length > 0)
    .map(w => ({ date: w.date, behaviors: w.behaviors }));
  const allRecentBehaviorKeys = Array.from(new Set(recentBehaviors.flatMap(r => r.behaviors)));

  // Fatigue signature (28 days)
  const sig = computeSignature(allSessions, wellnessScore ?? 75);

  // Personalized advice
  const freqTarget = profile?.freq_target ?? 3;
  const freqRatio = done7.length / freqTarget;
  const loadAdvice = totalLoad > 1000
    ? "Charge élevée cette semaine : prévois au moins une journée mobilité ou récupération active avant ta prochaine séance intense."
    : totalLoad > 500
    ? "Charge modérée : bon niveau d'entraînement. Surveille le sommeil et le stress avant les séances clés."
    : freqRatio < 0.5 && done7.length === 0
    ? "Aucune séance réalisée cette semaine. Si c'est voulu (récupération), c'est bien. Sinon, reprends progressivement."
    : "Charge plutôt basse. Si ton énergie le permet, tu peux ajouter une séance technique ou de faible intensité.";
  const wellnessAdvice = wellnessScore !== null
    ? (wellnessScore >= 75
      ? `Bonne disponibilité (${wellnessScore}/100) : créneau favorable pour tenir l'intensité prévue.`
      : wellnessScore >= 55
      ? `Disponibilité moyenne (${wellnessScore}/100) : garde le plan, mais réduis le volume si les sensations baissent en séance.`
      : `Fatigue élevée (${wellnessScore}/100) : privilégie récupération, technique légère ou réduis l'intensité de 20–30%.`)
    : "Renseigne ton wellness aujourd'hui pour fiabiliser les conseils et adapter la charge de la semaine.";
  const behaviorAdvice = allRecentBehaviorKeys.length
    ? "Comportements à surveiller sur les 7 derniers jours. Limite surtout ceux qui impactent le sommeil les veilles de séances importantes."
    : "Comportements récents propres : continue à prioriser hydratation, nutrition et heure de coucher régulière.";
  const focusAdvice = profile?.objective === "performance"
    ? "Focus performance : protéines 1,8–2g/kg/j, coucher avant 23h les veilles de séance, hydratation 35ml/kg."
    : profile?.objective === "stress"
    ? "Focus gestion du stress : priorise les séances courtes et régulières, évite de sauter le sommeil pour t'entraîner."
    : profile?.objective === "longevite"
    ? "Focus longévité : régularité > intensité. Deux séances modérées valent mieux qu'une intense qui épuise."
    : "Hydratation 35ml/kg, protéines 1,6–2g/kg/j, coucher avant 23h les veilles d'entraînement important.";

  const adviceItems = [
    { icon: "⚡", title: "Entraînement", text: loadAdvice },
    { icon: "🌿", title: "Récupération", text: wellnessAdvice },
    { icon: "🔍", title: "Comportements", text: behaviorAdvice },
    { icon: "🎯", title: "Focus", text: focusAdvice },
  ];

  return (
    <div className="page-shell">

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "#8a8f94", marginBottom: 4 }}>
          Conseils
        </div>
        <div style={{ fontSize: 28, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", lineHeight: 1.1 }}>
          {profile?.name ? `Bonjour, ${profile.name.split(" ")[0]}` : "Conseils de la semaine"}
        </div>
        {profile?.sport && (
          <div style={{ fontSize: 13, color: "#62686e", marginTop: 4 }}>
            {profile.sport}
            {profile.objective ? ` · ${OBJECTIVE_LABELS[profile.objective] ?? profile.objective}` : ""}
          </div>
        )}
      </div>

      {/* Hero card — zone du jour */}
      <div style={{
        position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg,#111 0%,#2a2a2a 60%,#151515 100%)",
        border: "1px solid rgba(255,255,255,.10)",
        borderRadius: 28, padding: "20px 22px", marginBottom: 14,
        boxShadow: "0 24px 64px rgba(0,0,0,.18)",
      }}>
        <div style={{ position: "absolute", right: -60, top: -60, width: 200, height: 200, borderRadius: "50%", background: `${scoreColor(wellnessScore)}22`, filter: "blur(32px)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 2, display: "flex", gap: 18, alignItems: "center" }}>
          <WellnessRingSVG score={wellnessScore} size={92} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.5)", marginBottom: 4 }}>
              Zone du jour
            </div>
            <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.04em", color: "#fff", lineHeight: 1.1, marginBottom: 6 }}>
              {zoneLabel(wellnessScore)}
            </div>
            {trendDelta !== null && (
              <div style={{ fontSize: 12, fontWeight: 700, color: trendColor }}>
                {trendIcon} {trendDelta > 0 ? "+" : ""}{trendDelta} pts sur 7 jours
              </div>
            )}
            {wellnessScore === null && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", lineHeight: 1.4 }}>
                Remplis ton wellness pour voir ta zone du jour
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats 4-grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
        {[
          { value: done7.length, label: "Séances" },
          { value: avgRpe ?? "—", label: "RPE moy." },
          { value: totalLoad > 0 ? totalLoad : "—", label: "Charge" },
          { value: avgWellness ?? "—", label: "Wellness" },
        ].map(({ value, label }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 18, padding: "14px 8px", textAlign: "center" as const, boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
            <div style={{ fontSize: 22, fontWeight: 1000, color: "#d44000", letterSpacing: "-0.05em", lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase" as const, color: "#8a8f94", marginTop: 5 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* 7-day wellness chart */}
      <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: "16px 18px", marginBottom: 14, boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 1000, color: "#171b1f", letterSpacing: "-0.02em" }}>Wellness — 7 jours</div>
          <div style={{ fontSize: 11, color: "#8a8f94" }}>
            {filled7.length}/{last7Days.length} jours renseignés
          </div>
        </div>
        <WellnessChart days={last7Days} />
        {planned7.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#62686e" }}>
            {planned7.length} séance{planned7.length > 1 ? "s" : ""} planifiée{planned7.length > 1 ? "s" : ""} cette semaine
          </div>
        )}
      </div>

      {/* Fatigue Signature */}
      <div style={{
        background: "linear-gradient(135deg,#161616,#333 64%,#111)",
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: 28, padding: 22, marginBottom: 14,
        color: "#fff", boxShadow: "0 28px 72px rgba(0,0,0,.20)",
        position: "relative" as const, overflow: "hidden",
      }}>
        <div style={{ position: "absolute", right: -80, bottom: -90, width: 240, height: 210, background: "rgba(212,64,0,.18)", borderRadius: "50%", filter: "blur(30px)", pointerEvents: "none" }} />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 16, position: "relative" as const, zIndex: 2 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.045em" }}>Ta signature de fatigue</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.70)", lineHeight: 1.45, marginTop: 4 }}>
              28 jours de données · comment tu réponds à la charge
            </div>
          </div>
          <div style={{ background: "#d44000", color: "#fff", borderRadius: 999, padding: "6px 11px", fontSize: 10, fontWeight: 1000, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
            {sig.signals ? `${sig.signals} signaux` : "À construire"}
          </div>
        </div>
        <div className="sig-grid" style={{ position: "relative", zIndex: 2 }}>
          {[
            { value: sig.nervous, label: "Nerveux", text: sig.nervous < 68 ? "Tu tolères bien les séances nerveuses courtes." : "Les séances nerveuses te coûtent plus cher cette semaine." },
            { value: sig.muscular, label: "Musculaire", text: "Les séances longues et lourdes définissent ton coût musculaire." },
            { value: sig.recovery, label: "Récupération", text: sig.recovery >= 70 ? "Bonne capacité de récupération récente." : "Récupération plus fragile : surveiller sommeil et enchaînements durs." },
          ].map(({ value, label, text }) => (
            <div key={label} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 20, padding: 14 }}>
              <div style={{ fontSize: 28, fontWeight: 1000, letterSpacing: "-0.055em", color: "#fff" }}>{value}</div>
              <div style={{ fontSize: 10, color: "#ff8a55", textTransform: "uppercase" as const, letterSpacing: ".13em", fontWeight: 1000, margin: "2px 0 8px" }}>{label}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.76)", lineHeight: 1.38 }}>{text}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Advice items */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10, marginBottom: 14 }}>
        {adviceItems.map(({ icon, title, text }) => (
          <div key={title} style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: 18, boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
            <div style={{ fontSize: 12, fontWeight: 1000, color: "#d44000", letterSpacing: ".10em", textTransform: "uppercase" as const, marginBottom: 7 }}>
              {icon} {title}
            </div>
            <div style={{ fontSize: 14, color: "#2b3034", lineHeight: 1.56 }}>{text}</div>
          </div>
        ))}
      </div>

      {/* Behavior history */}
      {allRecentBehaviorKeys.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: 18, boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
          <div style={{ fontSize: 12, fontWeight: 1000, color: "#d44000", letterSpacing: ".10em", textTransform: "uppercase" as const, marginBottom: 12 }}>
            🔍 Comportements — 7 jours
          </div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
            {allRecentBehaviorKeys.map(b => {
              const count = recentBehaviors.filter(r => r.behaviors.includes(b)).length;
              return (
                <div key={b} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid rgba(212,64,0,.26)", background: "rgba(212,64,0,.06)", borderRadius: 20, padding: "6px 12px" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#d44000" }}>{BEHAVIOR_LABELS[b] || b}</span>
                  <span style={{ fontSize: 10, fontWeight: 900, background: "#d44000", color: "#fff", borderRadius: 999, padding: "1px 6px" }}>{count}×</span>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 12, lineHeight: 1.45 }}>
            Ces comportements ont été renseignés {recentBehaviors.length} jour{recentBehaviors.length > 1 ? "s" : ""} sur 7. Limite-les les veilles de séances importantes.
          </div>
        </div>
      )}

    </div>
  );
}
