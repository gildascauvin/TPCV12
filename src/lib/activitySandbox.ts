import { format, subDays } from "date-fns";
import { buildAthleteFixture, buildCoachFixture } from "@/lib/sandboxFixtures";
import { buildActivitySubject } from "@/lib/activitySubject";
import type { ActivityPeriod, ActivityStatus } from "@/lib/activityStatus";

/* Bandeau d'activité de la sandbox (2026-10-03) : mêmes données d'exemple que les pages sandbox,
   même calcul que l'API (buildActivitySubject). Chargé à la demande (import dynamique) pour ne pas
   alourdir l'app réelle. Le sportif d'exemple suit un vrai programme officiel (CrossFit — Base 8
   Semaines, démarré il y a 2 semaines) pour montrer un bandeau actif avec ses barres de charge. */
const DEMO_PROGRAM = { id: "698b8601-93ca-4893-886a-5224d3ca1b9a", name: "CrossFit — Base 8 Semaines", sport: "CrossFit", weeks_count: 8 };
const DEMO_LOADS = [5, 6, 7, 4, 6, 7, 8, 4];
// Barres de charge sans charger le vrai programme : une semaine type par niveau de difficulté.
const DEMO_TEMPLATE = { weeks: DEMO_LOADS.map(d => ({ Lun: [{ target_difficulty: d }] })) };

export function sandboxActivityStatus(role: "athlete" | "coach", period?: ActivityPeriod): ActivityStatus {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  if (role === "athlete") {
    const f = buildAthleteFixture(now);
    const assignment = { start_date: format(subDays(now, 14), "yyyy-MM-dd"), programs: { ...DEMO_PROGRAM, template: DEMO_TEMPLATE } };
    return { role, self: buildActivitySubject(f.profile.user_id, f.profile.name ?? "", f.profile.sport, [assignment], f.sessions, today, period), athletes: [] };
  }
  const f = buildCoachFixture(now);
  const all = Object.values(f.sessionsByDate).flat();
  const athletes = f.athletes.map(a =>
    buildActivitySubject(a.id, a.name, a.sport, [], all.filter(s => s.athlete_id === a.id), today, period),
  );
  return { role, self: null, athletes };
}
