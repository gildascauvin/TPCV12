import { format, subDays } from "date-fns";
import { buildAthleteFixture, buildCoachFixture } from "@/lib/sandboxFixtures";
import { buildActivitySubject } from "@/lib/activitySubject";
import type { ActivityStatus } from "@/lib/activityStatus";

/* Pilule d'activité de la sandbox (2026-10-03) : mêmes données d'exemple que les pages sandbox,
   même calcul que l'API (buildActivitySubject). Chargé à la demande (import dynamique) pour ne pas
   alourdir l'app réelle. Le sportif d'exemple suit un vrai programme officiel (CrossFit — Base 8
   Semaines, démarré il y a 2 semaines) pour montrer une pilule active avec S3/8. */
const DEMO_PROGRAM = { id: "698b8601-93ca-4893-886a-5224d3ca1b9a", name: "CrossFit — Base 8 Semaines", sport: "CrossFit", weeks_count: 8 };

export function sandboxActivityStatus(role: "athlete" | "coach"): ActivityStatus {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  if (role === "athlete") {
    const f = buildAthleteFixture(now);
    const assignment = { start_date: format(subDays(now, 14), "yyyy-MM-dd"), programs: DEMO_PROGRAM };
    return { role, self: buildActivitySubject(f.profile.user_id, f.profile.name ?? "", f.profile.sport, [assignment], f.sessions, today), athletes: [] };
  }
  const f = buildCoachFixture(now);
  const all = Object.values(f.sessionsByDate).flat();
  const athletes = f.athletes.map(a =>
    buildActivitySubject(a.id, a.name, a.sport, [], all.filter(s => s.athlete_id === a.id), today),
  );
  return { role, self: null, athletes };
}
