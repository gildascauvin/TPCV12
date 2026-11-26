"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "@/lib/ph";
import { createClient } from "@/lib/supabase/client";
import { mediaForLine, ytFrame } from "@/lib/exerciseDemos";
import { serveLine, type ProgramServe } from "@/lib/programServes";
import { useFollowedObjectives, refreshFollowedObjectives } from "@/lib/objectivesClient";
import { notifyFollowObjective } from "@/components/objectives/FollowProgramObjectives";
import { Carousel } from "@/components/programs/ProgramStoreSections";

/* « Il sert » sur la fiche d'un programme (P2, 24/11/2026, Gildas : « le composant des cartes d'objectif,
   qu'on peut ouvrir et ajouter directement ») : mêmes cartes photo que l'onglet Objectifs, en carrousel (comme les programmes sur la fiche d'un objectif). Tap sur la
   carte = sa fiche dans l'onglet Objectifs ; « + » = la suivre (échéance = fin du programme), ✓ = la retirer.
   Limite de 3 objectifs, comme l'onglet Objectifs. */

const MAX = 3;
const POOL: Record<string, string> = {
  backSquat: "powerlifting", frontSquat: "halterophilie", deadlift: "powerlifting", bench: "gym", pressOh: "gym",
  snatch: "halterophilie", cleanJerk: "halterophilie", cmjHeight: "pliometrie", sprint10m: "sprint", time5k: "course",
};
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function photoFor(s: ProgramServe): string {
  const m = mediaForLine(s.label);
  if (m) return m.kind === "demo" ? ytFrame(m.items[0].yt) : m.src;
  return `/illustrations/${POOL[s.metric] ?? "groupe"}.jpg`;
}

export default function ServeObjectiveCards({ serves, weeks }: { serves: ProgramServe[]; weeks: number }) {
  const router = useRouter();
  const mine = useFollowedObjectives();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { refreshFollowedObjectives(); }, []); // jamais une liste en cache périmée : la limite de 3 en dépend
  const followed = mine ?? [];
  const full = followed.length >= MAX;

  async function toggle(s: ProgramServe) {
    const id = `metric:${s.metric}`, on = followed.includes(id);
    /* Déjà 3 objectifs : on propose sur place lequel remplacer (FollowProgramObjectives). */
    if (!on && full) { notifyFollowObjective(s.metric, weeks); return; }
    setBusy(s.metric); setErr(null);
    if (!on && (await refreshFollowedObjectives()).length >= MAX) { setBusy(null); notifyFollowObjective(s.metric, weeks); return; }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(null); return; }
    const { error } = on
      ? await supabase.from("objectives").delete().eq("user_id", user.id).eq("objective_id", id)
      : await supabase.from("objectives").insert({ user_id: user.id, objective_id: id, start_date: todayIso(), deadline: addDays(todayIso(), Math.max(1, weeks) * 7) });
    setBusy(null);
    if (error) { console.error("[il sert] écriture", error.message); setErr("Enregistrement impossible. Réessaie."); return; }
    posthog.capture(on ? "objective_removed" : "objective_added", { id, surface: "program_detail" });
    await refreshFollowedObjectives();
  }

  return (
    <div>
      <Carousel itemWidth="200px" gap={12}>
        {serves.map(s => {
          const id = `metric:${s.metric}`, on = followed.includes(id), blocked = false;
          return (
            <div key={s.metric} style={{ position: "relative", width: "100%", height: 200, borderRadius: 22, overflow: "hidden", background: "#11161a", border: on ? "2px solid #d44000" : "1px solid rgba(0,0,0,.08)" }}>
              <button type="button" onClick={() => router.push(`/conseils?open=${id}`)} aria-label={`Voir ${s.label}`}
                style={{ position: "absolute", inset: 0, border: 0, padding: 0, background: "none", color: "#fff", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoFor(s)} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) contrast(1.1) brightness(.5)" }} />
                <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(7,10,13,.05),rgba(7,10,13,.35) 45%,rgba(7,10,13,.94))" }} />
                {on && <span style={{ position: "absolute", top: 10, left: 10, fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "#d44000", color: "#fff" }}>🎯 Ton objectif</span>}
                <span style={{ position: "absolute", left: 12, right: 48, bottom: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.15 }}>{s.label}</span>
                  <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.7)", lineHeight: 1.3 }}>{serveLine(s)}</span>
                </span>
              </button>
              <button type="button" onClick={() => toggle(s)} disabled={busy === s.metric || blocked}
                aria-label={on ? `Retirer l'objectif ${s.label}` : `Suivre ${s.label}`}
                style={{ position: "absolute", right: 10, bottom: 10, width: 32, height: 32, borderRadius: "50%", border: 0, display: "grid", placeItems: "center", fontSize: on ? 15 : 19, fontWeight: 900, cursor: blocked ? "default" : "pointer", background: on ? "#fff" : "rgba(255,255,255,.22)", color: on ? "#111" : "#fff", opacity: blocked ? 0.35 : busy === s.metric ? 0.6 : 1 }}>
                {on ? "✓" : "+"}
              </button>
            </div>
          );
        })}
      </Carousel>
      {err && <div role="alert" style={{ fontSize: 12.5, color: "#d44000", marginTop: 8 }}>{err}</div>}
    </div>
  );
}
