export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import type { Session, WellnessDaily, Profile } from "@/types";

const BEHAVIOR_META: Record<string, { emoji: string; label: string; positive: boolean }> = {
  alcohol:       { emoji: "🍷", label: "Alcool",            positive: false },
  late_sleep:    { emoji: "🌙", label: "Couché tardif",     positive: false },
  tobacco:       { emoji: "🚬", label: "Tabac",             positive: false },
  screen_late:   { emoji: "📱", label: "Écran tard",        positive: false },
  heavy_meal:    { emoji: "🍔", label: "Repas lourd",       positive: false },
  caffeine_late: { emoji: "☕", label: "Caféine tard",      positive: false },
  social_out:    { emoji: "🎉", label: "Sortie sociale",    positive: false },
  travel:        { emoji: "✈️", label: "Voyage",            positive: false },
  stretching:    { emoji: "🧘", label: "Stretching",        positive: true  },
  cold_shower:   { emoji: "🧊", label: "Douche froide",     positive: true  },
  reading:       { emoji: "📖", label: "Lecture",           positive: true  },
  meditation:    { emoji: "🧘‍♂️", label: "Méditation",       positive: true  },
  hydration:     { emoji: "💧", label: "Bonne hydratation", positive: true  },
  walk:          { emoji: "🚶", label: "Marche détente",    positive: true  },
};

const OBJECTIVE_LABELS: Record<string, string> = {
  performance:  "Performance",
  longevite:    "Longévité",
  stress:       "Gestion du stress",
  composition:  "Composition corporelle",
  equilibre:    "Équilibre",
  rehab:        "Réhabilitation",
};

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function computeSignature(sessions: Session[], wellnessScore: number) {
  const done = sessions.filter(s => s.done && s.rpe && s.duration);
  const load = done.reduce((a, s) => a + (s.rpe || 0) * (s.duration || 0), 0);
  const avgRpe = done.length
    ? Math.round(done.reduce((a, s) => a + (s.rpe || 0), 0) / done.length * 10) / 10
    : 7;
  const hard = done.filter(s => (s.rpe || 0) >= 8).length;
  const long = done.filter(s => (s.duration || 0) >= 70).length;
  const signals = done.length;
  const nervous  = Math.max(28, Math.min(94, Math.round(42 + hard * 10 + avgRpe * 3)));
  const muscular = Math.max(30, Math.min(94, Math.round(38 + long * 10 + load / 120)));
  const recovery = Math.max(35, Math.min(92, Math.round(wellnessScore - hard * 3 + signals * 2)));
  return { nervous, muscular, recovery, signals, hard, long, avgRpe };
}

function sigDimInfo(dim: "cost" | "recovery", value: number): { label: string; color: string; text: string } {
  if (dim === "cost") {
    if (value < 55) return { label: "COÛT FAIBLE", color: "#2f9e44", text: "Tu absorbes bien ce type de séances." };
    if (value < 75) return { label: "COÛT MODÉRÉ", color: "#f28a00", text: "Espace ces séances pour ne pas saturer." };
    return            { label: "COÛT ÉLEVÉ",  color: "#d10000", text: "Ces séances te coûtent cher — espace-les." };
  }
  if (value >= 70) return { label: "BONNE RÉCUP",  color: "#2f9e44", text: "Bonne capacité de récupération." };
  if (value >= 50) return { label: "RÉCUP STABLE", color: "#f28a00", text: "Récupération moyenne — surveille le sommeil." };
  return             { label: "RÉCUP FRAGILE", color: "#d10000", text: "Récupération fragile — évite d'enchaîner les séances dures." };
}

function sessionStatusInfo(done: number, target: number): { label: string; color: string } {
  if (done >= target) return { label: "OBJECTIF ATTEINT", color: "#2f9e44" };
  if (done > 0)       return { label: "EN COURS",         color: "#f28a00" };
  return                { label: "SEMAINE LÉGÈRE",   color: "#8a8f94" };
}

type BehaviorCorrelation = {
  key: string; impact: number; occurrences: number;
  emoji: string; label: string; positive: boolean;
};

function computeBehaviorCorrelations(wellness: WellnessDaily[]): BehaviorCorrelation[] {
  const sorted = [...wellness].sort((a, b) => a.date.localeCompare(b.date));
  const allKeys = Array.from(new Set(sorted.flatMap(w => w.behaviors || [])));
  const results: BehaviorCorrelation[] = [];

  for (const key of allKeys) {
    const daysWith: number[] = [];
    const daysWithout: number[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const dayD  = sorted[i];
      const dayD1 = sorted[i + 1];
      const diffDays = Math.round(
        (new Date(dayD1.date + "T12:00:00").getTime() - new Date(dayD.date + "T12:00:00").getTime()) / 86400000
      );
      if (diffDays !== 1) continue;
      const nextScore = dayD1.score ?? dayD1.base_score;
      if (nextScore === null || nextScore === undefined) continue;
      if ((dayD.behaviors || []).includes(key)) daysWith.push(nextScore);
      else daysWithout.push(nextScore);
    }
    if (daysWith.length < 2 || daysWithout.length < 2) continue;
    const avgWith    = daysWith.reduce((a, b) => a + b, 0) / daysWith.length;
    const avgWithout = daysWithout.reduce((a, b) => a + b, 0) / daysWithout.length;
    const impact = Math.round((avgWith - avgWithout) * 10) / 10;
    const meta = BEHAVIOR_META[key];
    if (!meta) continue;
    results.push({ key, impact, occurrences: daysWith.length, emoji: meta.emoji, label: meta.label, positive: meta.positive });
  }
  return results.sort((a, b) => b.impact - a.impact);
}

function BehaviorImpactCard({ correlations, filledDays }: { correlations: BehaviorCorrelation[]; filledDays: number }) {
  const MIN_DAYS = 10;

  if (filledDays < MIN_DAYS || correlations.length === 0) {
    const remaining = Math.max(0, MIN_DAYS - filledDays);
    return (
      <div style={{ background: "linear-gradient(135deg,#161616,#282828 64%,#111)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 28, padding: 22, marginBottom: 14, color: "#fff", position: "relative" as const, overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -60, top: -60, width: 180, height: 180, background: "rgba(212,64,0,.12)", borderRadius: "50%", filter: "blur(28px)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.45)", marginBottom: 6 }}>Impact comportements</div>
          <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em", marginBottom: 8 }}>Données en cours de collecte</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.60)", lineHeight: 1.5, marginBottom: 18 }}>
            {remaining > 0
              ? `Renseigne ton wellness ${remaining} jour${remaining > 1 ? "s" : ""} de plus pour voir l'impact réel de tes comportements.`
              : "Continue à renseigner ton wellness — les corrélations apparaîtront bientôt."}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {["🧘 Stretching", "🧊 Douche froide", "📖 Lecture", "💧 Hydratation", "🍷 Alcool", "📱 Écran tard"].map(b => (
              <div key={b} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 20, padding: "5px 11px", fontSize: 12, color: "rgba(255,255,255,.50)" }}>{b}</div>
            ))}
          </div>
          <div style={{ marginTop: 14, height: 4, background: "rgba(255,255,255,.08)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(filledDays / MIN_DAYS * 100, 100)}%`, background: "#d44000", borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 6 }}>{filledDays}/{MIN_DAYS} jours collectés</div>
        </div>
      </div>
    );
  }

  const maxAbs = Math.max(...correlations.map(c => Math.abs(c.impact)), 3);
  const bestHelper  = correlations.find(c => c.impact > 0.5);
  const worstHurt   = [...correlations].reverse().find(c => c.impact < -0.5);

  return (
    <div style={{ background: "linear-gradient(135deg,#161616,#282828 64%,#111)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 28, padding: 22, marginBottom: 14, color: "#fff", position: "relative" as const, overflow: "hidden" }}>
      <div style={{ position: "absolute", right: -60, top: -60, width: 180, height: 180, background: "rgba(212,64,0,.12)", borderRadius: "50%", filter: "blur(28px)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.45)", marginBottom: 4 }}>Impact comportements</div>
            <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.04em" }}>Ce qui t'aide ou te pénalise</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.50)", marginTop: 3 }}>Effet sur ton wellness du lendemain</div>
          </div>
          <div style={{ background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.60)", borderRadius: 999, padding: "5px 11px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" as const, flexShrink: 0 }}>{filledDays}j de données</div>
        </div>

        {/* En-têtes colonnes */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 52px", gap: 8, alignItems: "center", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.35)" }}>Comportement</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2px 1fr", alignItems: "center" }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#d10000", textAlign: "right" as const }}>Pénalise</div>
            <div />
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#2f9e44" }}>Aide</div>
          </div>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.35)", textAlign: "right" as const }}>Impact</div>
        </div>

        {/* Lignes */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
          {correlations.map(c => {
            const pct = Math.min(Math.abs(c.impact) / maxAbs * 100, 100);
            const isPositive = c.impact > 0;
            const isNeutral  = Math.abs(c.impact) < 0.3;
            const barColor   = isPositive ? "#2f9e44" : "#d10000";
            const impactStr  = isNeutral ? "0" : `${c.impact > 0 ? "+" : ""}${c.impact.toFixed(1)}`;
            const textColor  = isNeutral ? "rgba(255,255,255,.35)" : barColor;
            return (
              <div key={c.key} style={{ display: "grid", gridTemplateColumns: "1fr 120px 52px", gap: 8, alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{c.emoji}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, color: "rgba(255,255,255,.85)" }}>{c.label}</span>
                </div>
                <div style={{ position: "relative" as const, height: 6, background: "rgba(255,255,255,.08)", borderRadius: 3 }}>
                  <div style={{ position: "absolute" as const, left: "50%", top: -3, width: 1, height: 12, background: "rgba(255,255,255,.20)", transform: "translateX(-50%)" }} />
                  {!isNeutral && (
                    <div style={{ position: "absolute" as const, top: 0, height: "100%", borderRadius: 3, background: barColor, width: `${pct / 2}%`, ...(isPositive ? { left: "50%" } : { right: "50%" }) }} />
                  )}
                </div>
                <div style={{ fontSize: 12, fontWeight: 900, color: textColor, textAlign: "right" as const, letterSpacing: "-0.02em" }}>{impactStr} pts</div>
              </div>
            );
          })}
        </div>

        {/* Conseil personnalisé */}
        {(bestHelper || worstHurt) && (
          <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 14, display: "flex", flexDirection: "column" as const, gap: 7 }}>
            {bestHelper && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", lineHeight: 1.45 }}>
                <span style={{ fontWeight: 900, color: "#2f9e44" }}>✓ Continue : </span>
                <span style={{ fontWeight: 700 }}>{bestHelper.emoji} {bestHelper.label}</span>
                {" "}améliore ton wellness du lendemain de{" "}
                <span style={{ fontWeight: 900, color: "#2f9e44" }}>+{bestHelper.impact.toFixed(1)} pts</span> en moyenne.
              </div>
            )}
            {worstHurt && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", lineHeight: 1.45 }}>
                <span style={{ fontWeight: 900, color: "#d10000" }}>✗ Évite : </span>
                <span style={{ fontWeight: 700 }}>{worstHurt.emoji} {worstHurt.label}</span>
                {" "}pénalise ton wellness du lendemain de{" "}
                <span style={{ fontWeight: 900, color: "#d10000" }}>{worstHurt.impact.toFixed(1)} pts</span> en moyenne.
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,.28)", lineHeight: 1.5 }}>Basé sur tes {filledDays} derniers jours · corrélation J→J+1</div>
      </div>
    </div>
  );
}

export default async function ConseilsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const today   = new Date().toISOString().split("T")[0];
  const since28 = daysAgoStr(28);
  const since7  = daysAgoStr(7); // fenêtre glissante (comportements, alerte demain)

  const startOfWeek = (() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // ramène au lundi
    return d.toISOString().split("T")[0];
  })();

  const startOfPrevWeek = (() => {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  })();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const [{ data: rawProfile }, { data: rawSessions }, { data: rawWellness }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
    supabase.from("sessions").select("*").eq("user_id", user!.id).gte("date", since28).order("date", { ascending: false }),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id).gte("date", since28).order("date", { ascending: false }),
  ]);

  const profile     = rawProfile as Profile | null;
  const allSessions = (rawSessions || []) as Session[];
  const allWellness = (rawWellness || []) as WellnessDaily[];

  // Wellness du jour
  const todayWellness = allWellness.find(w => w.date === today);
  const wellnessScore = todayWellness?.score ?? todayWellness?.base_score ?? null;

  // Séances semaine calendaire courante (lundi → aujourd'hui)
  const done7 = allSessions.filter(s => s.date >= startOfWeek && s.done && s.rpe);
  const avgRpe = done7.length
    ? Math.round(done7.reduce((a, s) => a + (s.rpe || 0), 0) / done7.length * 10) / 10
    : null;

  const freqTarget    = profile?.freq_target ?? 3;
  const sessionStatus = sessionStatusInfo(done7.length, freqTarget);

  // Tendance charge : semaine calendaire courante vs semaine calendaire précédente
  const currLoad = done7.reduce((a, s) => a + (s.rpe || 0) * (s.duration || 45), 0);
  const prevDone = allSessions.filter(s => s.date >= startOfPrevWeek && s.date < startOfWeek && s.done && s.rpe);
  const prevLoad = prevDone.reduce((a, s) => a + (s.rpe || 0) * (s.duration || 45), 0);
  const loadTrend: number | null = prevLoad > 0
    ? Math.round((currLoad - prevLoad) / prevLoad * 100)
    : null;

  // Alerte séance demain + récup fragile
  const hasTomorrowSession = allSessions.some(s => s.date === tomorrowStr && !s.done);

  // Comportements — 7 jours
  const recentBehaviors = allWellness
    .filter(w => w.date >= since7 && w.behaviors?.length > 0)
    .map(w => ({ date: w.date, behaviors: w.behaviors }));
  const allRecentBehaviorKeys = Array.from(new Set(recentBehaviors.flatMap(r => r.behaviors)));

  // Corrélations comportements (28j)
  const correlations = computeBehaviorCorrelations(allWellness);
  const filledDays   = allWellness.filter(w => w.score !== null || w.base_score !== null).length;

  // Signature de fatigue (28j)
  const sig = computeSignature(allSessions, wellnessScore ?? 75);
  const recoveryAlert = hasTomorrowSession && sig.recovery < 50 && sig.signals > 0;

  // Conseil entraînement
  const loadAdviceShort = done7.length >= freqTarget
    ? avgRpe !== null && avgRpe >= 8
      ? "Objectif atteint à haute intensité — soigne la récup avant la semaine prochaine."
      : "Bonne régularité cette semaine — maintiens le rythme."
    : done7.length > 0
    ? `Plus que ${freqTarget - done7.length} séance${freqTarget - done7.length > 1 ? "s" : ""} pour atteindre ton objectif de la semaine.`
    : "Aucune séance cette semaine — reprends progressivement si l'arrêt n'était pas voulu.";

  return (
    <div className="page-shell">

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "#8a8f94", marginBottom: 4 }}>
          Conseils
        </div>
        <div style={{ fontSize: 28, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", lineHeight: 1.1 }}>
          {profile?.name ? `Bonjour, ${profile.name.split(" ")[0]}` : "Analyse & conseils"}
        </div>
        {profile?.sport && (
          <div style={{ fontSize: 13, color: "#62686e", marginTop: 4 }}>
            {profile.sport}{profile.objective ? ` · ${OBJECTIVE_LABELS[profile.objective] ?? profile.objective}` : ""}
          </div>
        )}
      </div>

      {/* Signature de fatigue + Entraînement */}
      <div style={{
        background: "linear-gradient(135deg,#161616,#333 64%,#111)",
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: 28, padding: 22, marginBottom: 14,
        color: "#fff", boxShadow: "0 28px 72px rgba(0,0,0,.20)",
        position: "relative" as const, overflow: "hidden",
      }}>
        <div style={{ position: "absolute", right: -80, bottom: -90, width: 240, height: 210, background: "rgba(212,64,0,.18)", borderRadius: "50%", filter: "blur(30px)", pointerEvents: "none" }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 6, position: "relative" as const, zIndex: 2 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.045em" }}>Ta signature de fatigue</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", lineHeight: 1.45, marginTop: 4 }}>
              28 jours · Nerveux = intensité, Musculaire = durée & volume, Récup = wellness ajusté
            </div>
          </div>
          <div style={{ background: sig.signals ? "#d44000" : "rgba(255,255,255,.10)", color: "#fff", borderRadius: 999, padding: "6px 11px", fontSize: 10, fontWeight: 1000, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
            {sig.signals ? `${sig.signals} séances` : "À construire"}
          </div>
        </div>

        {sig.signals === 0 ? (
          <div style={{ position: "relative" as const, zIndex: 2, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 18, padding: "16px 18px", marginTop: 14, fontSize: 13, color: "rgba(255,255,255,.55)", lineHeight: 1.5 }}>
            Termine des séances avec RPE + durée pour construire ta signature de fatigue.
          </div>
        ) : (
          <div style={{ position: "relative" as const, zIndex: 2 }}>
            {/* Alerte récup */}
            {recoveryAlert && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(242,138,0,.12)", border: "1px solid rgba(242,138,0,.35)", borderRadius: 14, padding: "10px 14px", marginTop: 14, marginBottom: 16 }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>⚠️</span>
                <div style={{ fontSize: 12, color: "#f28a00", lineHeight: 1.45, fontWeight: 600 }}>
                  Séance planifiée demain — ta récupération est fragile. Considère de réduire l'intensité.
                </div>
              </div>
            )}

            {/* 3 jauges */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 16, marginTop: recoveryAlert ? 0 : 18 }}>
              {([
                { key: "nervous",  label: "Coût nerveux",    dim: "cost"     as const, value: sig.nervous,  icon: "⚡", inputLine: `${sig.hard} séance${sig.hard !== 1 ? "s" : ""} RPE ≥ 8 · RPE moy. ${sig.avgRpe} sur 28j` },
                { key: "muscular", label: "Coût musculaire", dim: "cost"     as const, value: sig.muscular, icon: "💪", inputLine: `${sig.long} séance${sig.long !== 1 ? "s" : ""} ≥ 70 min sur 28j` },
                { key: "recovery", label: "Récupération",    dim: "recovery" as const, value: sig.recovery, icon: "🌿", inputLine: "Basé sur ton wellness ajusté par la charge récente" },
              ]).map(({ key, label, dim, value, icon, inputLine }) => {
                const info = sigDimInfo(dim, value);
                return (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.70)" }}>
                        {icon} {label}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: info.color }}>{info.label}</span>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: info.color, flexShrink: 0 }} />
                      </div>
                    </div>
                    <div style={{ position: "relative" as const, height: 7, background: "rgba(255,255,255,.10)", borderRadius: 4, marginBottom: 6, overflow: "hidden" }}>
                      <div style={{ position: "absolute" as const, left: 0, top: 0, height: "100%", width: `${Math.min(value, 100)}%`, background: info.color, borderRadius: 4, opacity: 0.85 }} />
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", lineHeight: 1.4 }}>{info.text}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.28)", marginTop: 3, fontStyle: "italic" as const }}>{inputLine}</div>
                  </div>
                );
              })}
            </div>

            {/* Séparateur + bloc "Cette semaine" */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,.10)", marginTop: 20, paddingTop: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.38)", marginBottom: 12 }}>
                Cette semaine
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" as const }}>
                  <span style={{ fontSize: 34, fontWeight: 1000, letterSpacing: "-0.055em", lineHeight: 1, color: sessionStatus.color }}>
                    {done7.length}
                  </span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,.45)" }}>
                    / {freqTarget} séances
                  </span>
                  {avgRpe !== null && (
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,.38)" }}>
                      · RPE moy. {avgRpe}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: sessionStatus.color, background: `${sessionStatus.color}22`, border: `1px solid ${sessionStatus.color}44`, borderRadius: 999, padding: "4px 10px", letterSpacing: "0.08em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>
                    {sessionStatus.label}
                  </div>
                  {loadTrend !== null && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: Math.abs(loadTrend) < 15 ? "rgba(255,255,255,.38)" : loadTrend > 0 ? "#f28a00" : "#2f9e44", whiteSpace: "nowrap" as const }}>
                      {Math.abs(loadTrend) < 15 ? "→ Stable" : loadTrend > 0 ? `↑ +${loadTrend}%` : `↓ ${loadTrend}%`} vs sem. préc.
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.62)", lineHeight: 1.5 }}>
                <span style={{ fontWeight: 800, color: "#d44000" }}>→</span> {loadAdviceShort}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Impact comportements (WHOOP + conseil personnalisé) */}
      <BehaviorImpactCard correlations={correlations} filledDays={filledDays} />

      {/* Comportements — 7 jours */}
      {allRecentBehaviorKeys.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: 18, boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".10em", textTransform: "uppercase" as const, color: "#62686e", marginBottom: 12 }}>
            🔍 Comportements — 7 jours
          </div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
            {allRecentBehaviorKeys.map(b => {
              const count = recentBehaviors.filter(r => r.behaviors.includes(b)).length;
              const meta  = BEHAVIOR_META[b];
              const accentColor = meta?.positive ? "#2f9e44" : "#d44000";
              return (
                <div key={b} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${accentColor}44`, background: `${accentColor}0d`, borderRadius: 20, padding: "6px 12px" }}>
                  <span style={{ fontSize: 13 }}>{meta?.emoji ?? "•"}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: accentColor }}>{meta?.label ?? b}</span>
                  <span style={{ fontSize: 10, fontWeight: 900, background: accentColor, color: "#fff", borderRadius: 999, padding: "1px 6px" }}>{count}×</span>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 12, lineHeight: 1.45 }}>
            Renseigné {recentBehaviors.length} jour{recentBehaviors.length > 1 ? "s" : ""} sur 7.
          </div>
        </div>
      )}

    </div>
  );
}
