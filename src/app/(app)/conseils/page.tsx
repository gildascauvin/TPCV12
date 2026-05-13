import { createClient } from "@/lib/supabase/server";
import type { Session, WellnessDaily } from "@/types";

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

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function computeSignature(sessions: Session[], todayWellnessScore: number) {
  const done = sessions.filter(s => s.done && s.rpe && s.duration);
  const load = done.reduce((a, s) => a + (s.rpe || 0) * (s.duration || 0), 0);
  const avg = done.length ? done.reduce((a, s) => a + (s.rpe || 0), 0) / done.length : 7;
  const hard = done.filter(s => (s.rpe || 0) >= 8).length;
  const long = done.filter(s => (s.duration || 0) >= 70).length;
  const signals = done.length;
  const nervous = Math.max(28, Math.min(94, Math.round(42 + hard * 10 + avg * 3)));
  const muscular = Math.max(30, Math.min(94, Math.round(38 + long * 10 + load / 120)));
  const recovery = Math.max(35, Math.min(92, Math.round(todayWellnessScore - hard * 3 + signals * 2)));
  return { nervous, muscular, recovery, signals, load, avgRpe: avg };
}

export default async function ConseilsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const today = new Date().toISOString().split("T")[0];
  const since28 = daysAgoStr(28);
  const since7 = daysAgoStr(7);

  const [{ data: rawSessions }, { data: rawWellness }] = await Promise.all([
    supabase.from("sessions").select("*").eq("user_id", user!.id).gte("date", since28).order("date", { ascending: false }),
    supabase.from("wellness_daily").select("*").eq("user_id", user!.id).gte("date", since28).order("date", { ascending: false }),
  ]);

  const allSessions = (rawSessions || []) as Session[];
  const allWellness = (rawWellness || []) as WellnessDaily[];

  const recent7Sessions = allSessions.filter(s => s.date >= since7);
  const done7 = recent7Sessions.filter(s => s.done && s.rpe);
  const avgRpe = done7.length
    ? Math.round(done7.reduce((a, s) => a + (s.rpe || 0), 0) / done7.length * 10) / 10
    : null;
  const recent7Wellness = allWellness.filter(w => w.date >= since7);
  const avgWellness = recent7Wellness.length
    ? Math.round(recent7Wellness.reduce((a, w) => a + (w.score ?? w.base_score ?? 0), 0) / recent7Wellness.length)
    : null;
  const todayWellness = allWellness.find(w => w.date === today);
  const wellnessScore = todayWellness?.score ?? todayWellness?.base_score ?? null;
  const behaviors = todayWellness?.behaviors || [];

  const sig = computeSignature(allSessions, wellnessScore ?? 75);

  const totalLoad = done7.reduce((a, s) => a + (s.rpe || 0) * (s.duration || 45), 0);
  const loadAdvice = totalLoad > 900
    ? "Charge élevée cette semaine : garde une journée légère ou mobilité, et évite d'empiler deux séances intenses."
    : totalLoad > 450
    ? "Charge modérée : conserve l'intensité, mais surveille sommeil et stress avant les séances clés."
    : "Charge plutôt basse : tu peux ajouter une séance technique ou une séance facile si ton énergie est bonne.";
  const wellnessAdvice = wellnessScore !== null
    ? (wellnessScore >= 75
      ? "Bonne disponibilité : créneau favorable pour maintenir l'intensité prévue."
      : wellnessScore >= 55
      ? "Disponibilité moyenne : garde le plan, mais réduis le volume si les sensations baissent."
      : "Fatigue élevée : privilégie récupération, technique légère ou intensité réduite de 20–30%.")
    : "Renseigne ton wellness aujourd'hui pour fiabiliser les conseils et adapter la charge.";
  const behaviorAdvice = behaviors.length
    ? "Comportements à surveiller : limite surtout ceux qui impactent sommeil et récupération les veilles de séances importantes."
    : "Comportements récents propres : continue à prioriser hydratation, nutrition et heure de coucher régulière.";
  const toleranceText = sig.nervous < 68
    ? "Tu tolères bien les séances nerveuses courtes."
    : "Les séances nerveuses te coûtent plus cher cette semaine.";
  const recoveryText = sig.recovery >= 70
    ? "Bonne capacité de récupération récente."
    : "Récupération plus fragile : surveiller sommeil et enchaînements durs.";

  const adviceItems = [
    { icon: "⚡", title: "Entraînement", text: loadAdvice, tags: null },
    { icon: "🌿", title: "Récupération", text: wellnessAdvice, tags: null },
    { icon: "🔍", title: "Comportements", text: behaviorAdvice, tags: behaviors },
    { icon: "🎯", title: "Focus semaine", text: "Hydratation 35ml/kg, protéines 1,6–2g/kg/j, coucher avant 23h les veilles d'entraînement important.", tags: null },
  ];

  return (
    <div style={{ padding: "20px 18px 100px", maxWidth: 600, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.13em", textTransform: "uppercase" as const, color: "#8a8f94", marginBottom: 4 }}>
          Conseils
        </div>
        <div style={{ fontSize: 28, fontWeight: 1000, letterSpacing: "-0.045em", color: "#171b1f", lineHeight: 1.1 }}>
          Conseils de la semaine
        </div>
        <div style={{ fontSize: 14, color: "#62686e", marginTop: 5, lineHeight: 1.45 }}>
          {done7.length} séance{done7.length !== 1 ? "s" : ""} réalisée{done7.length !== 1 ? "s" : ""} sur 7 jours
          {wellnessScore !== null ? ` · Wellness ${wellnessScore}/100` : " · Wellness non renseigné aujourd'hui"}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
        {[
          { value: done7.length, label: "SÉANCES" },
          { value: avgRpe ?? "—", label: "DIFF. MOY." },
          { value: avgWellness ?? "—", label: "WELLNESS" },
        ].map(({ value, label }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 20, padding: "16px 10px", textAlign: "center" as const, boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
            <div style={{ fontSize: 30, fontWeight: 1000, color: "#d44000", letterSpacing: "-0.05em", lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase" as const, color: "#8a8f94", marginTop: 5 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Fatigue Signature Panel */}
      <div style={{
        background: "linear-gradient(135deg,#161616,#333 64%,#111)",
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: 30, padding: 22, marginBottom: 18,
        color: "#fff", boxShadow: "0 28px 72px rgba(0,0,0,.20)",
        position: "relative" as const, overflow: "hidden",
      }}>
        <div style={{
          position: "absolute" as const, right: -80, bottom: -90,
          width: 240, height: 210, background: "rgba(212,64,0,.20)",
          borderRadius: "50%", filter: "blur(30px)", pointerEvents: "none",
        }} />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 16, position: "relative" as const, zIndex: 2 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "-0.05em" }}>Ta signature de fatigue</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.74)", lineHeight: 1.48, marginTop: 5 }}>
              Le système commence à comprendre comment tu réponds à la charge : ce que tu tolères, ce qui te coûte, et quand adapter.
            </div>
          </div>
          <div style={{ background: "#ff6b2b", color: "#fff", borderRadius: 999, padding: "7px 11px", fontSize: 11, fontWeight: 1000, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
            {sig.signals ? `${sig.signals} signaux` : "À construire"}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, position: "relative" as const, zIndex: 2 }}>
          {[
            { value: sig.nervous, label: "Nerveux", text: toleranceText },
            { value: sig.muscular, label: "Musculaire", text: "Les séances longues et lourdes définissent ton coût musculaire." },
            { value: sig.recovery, label: "Récupération", text: recoveryText },
          ].map(({ value, label, text }) => (
            <div key={label} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 20, padding: 14 }}>
              <div style={{ fontSize: 30, fontWeight: 1000, letterSpacing: "-0.055em", color: "#fff" }}>{value}</div>
              <div style={{ fontSize: 11, color: "#ff8a55", textTransform: "uppercase" as const, letterSpacing: ".13em", fontWeight: 1000, margin: "2px 0 8px" }}>{label}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.76)", lineHeight: 1.38 }}>{text}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Advice items */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
        {adviceItems.map(({ icon, title, text, tags }) => (
          <div key={title} style={{ background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 24, padding: 18, boxShadow: "0 4px 12px rgba(0,0,0,.04)" }}>
            <div style={{ fontSize: 13, fontWeight: 1000, color: "#d44000", letterSpacing: ".10em", textTransform: "uppercase" as const, marginBottom: 7 }}>
              {icon} {title}
            </div>
            <div style={{ fontSize: 14, color: "#2b3034", lineHeight: 1.56 }}>{text}</div>
            {tags && tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5, marginTop: 10 }}>
                {tags.map((b: string) => (
                  <span key={b} style={{ border: "1px solid rgba(212,64,0,.30)", color: "#d44000", background: "rgba(212,64,0,.08)", fontSize: 11, padding: "4px 10px", borderRadius: 20, fontWeight: 700 }}>
                    {BEHAVIOR_LABELS[b] || b}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
