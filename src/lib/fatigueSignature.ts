import type { Session, WellnessDaily } from "@/types";

// Extrait de conseils/page.tsx pour être réutilisé tel quel par /coach/athletes
// (signature de fatigue condensée par sportif) — une seule source de vérité pour ces seuils.

export function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export function computeSignature(sessions: Session[], wellnessScore: number) {
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

export function sigDimInfo(dim: "cost" | "recovery", value: number): { label: string; color: string; text: string } {
  if (dim === "cost") {
    if (value < 55) return { label: "COÛT FAIBLE", color: "#2f9e44", text: "Tu absorbes bien ce type de séances." };
    if (value < 75) return { label: "COÛT MODÉRÉ", color: "#f28a00", text: "Espace ces séances pour ne pas saturer." };
    return            { label: "COÛT ÉLEVÉ",  color: "#d10000", text: "Ces séances te coûtent cher — espace-les." };
  }
  if (value >= 70) return { label: "BONNE RÉCUP",  color: "#2f9e44", text: "Bonne capacité de récupération." };
  if (value >= 50) return { label: "RÉCUP STABLE", color: "#f28a00", text: "Récupération moyenne — surveille le sommeil." };
  return             { label: "RÉCUP FRAGILE", color: "#d10000", text: "Récupération fragile — évite d'enchaîner les séances dures." };
}

export type DayPoint = {
  date: string;
  nervousLoad: number;   // avgRPE × 10 ce jour-là (0–100), signal d'intensité pure
  muscularLoad: number;  // durée totale séances ce jour-là (minutes), signal de volume
  recovery: number | null; // wellness score ce jour-là
};

export function buildDailyTimeSeries(sessions: Session[], wellness: WellnessDaily[], days = 28): DayPoint[] {
  const points: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgoStr(i);
    const daySessions = sessions.filter(s => s.date === date && s.done && s.rpe && s.duration);
    const rpeValues = daySessions.map(s => s.rpe || 0).filter(r => r > 0);
    const avgRpe = rpeValues.length > 0 ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length : 0;
    const nervousLoad = Math.round(avgRpe * 10);
    const muscularLoad = Math.min(180, daySessions.reduce((acc, s) => acc + (s.duration || 0), 0));
    const w = wellness.find(wd => wd.date === date);
    const recovery = (w?.score ?? w?.base_score) ?? null;
    points.push({ date, nervousLoad, muscularLoad, recovery });
  }
  return points;
}

// Signature condensée d'un sportif pour la liste /coach/athletes : "manual" (sportif géré à la
// main par le coach, pas de wellness quotidien), "no_data" (sportif réel mais rien renseigné sur
// la fenêtre), "ok" (courbes exploitables).
export type AthleteSignature =
  | { kind: "manual" }
  | { kind: "no_data" }
  | {
      kind: "ok";
      nervous: number[];
      muscular: number[];
      recovery: (number | null)[];
    };
