"use client";

/* Fin de séance (23/11/2026) : « Elle compte pour tes objectifs ». Pour chaque objectif suivi que la séance
   travaille (servesObjective : nom et exercices), le nombre de séances qui comptent depuis son départ.
   La récompense entre deux tests, même règle avec ou sans programme. Rien si la séance n'en sert aucun. */

import { useEffect, useState } from "react";
import posthog from "@/lib/ph";
import { createClient } from "@/lib/supabase/client";
import { defById, servesObjective, addDays, servedSessionsText } from "@/lib/objectives";
import { miniCard } from "@/components/physio/MiniBilan";

type Row = { label: string; text: string };

export default function ObjectiveContribution({ session, sport = null }: { session: { id: string; date: string; name?: string | null; notes?: string | null }; sport?: string | null }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data: objs, error } = await supabase.from("objectives").select("objective_id,start_date").eq("user_id", uid);
      if (error) { console.error("[objectifs] fin de séance", error.message); return; }
      const served = (objs ?? []).map(o => ({ o, def: defById(o.objective_id, sport) })).filter(x => x.def && servesObjective(x.def, session));
      if (!served.length) { if (alive) setRows([]); return; }
      /* Rétroactif, comme la fiche : les 4 semaines avant le départ comptent aussi. */
      const from = (start: string) => addDays(start, -28);
      const since = served.reduce((m, x) => (from(x.o.start_date) < m ? from(x.o.start_date) : m), from(served[0].o.start_date));
      const { data: sess, error: e2 } = await supabase.from("sessions").select("date,name,notes").eq("user_id", uid).eq("done", true).gte("date", since);
      if (e2) { console.error("[objectifs] séances", e2.message); return; }
      const out = served.map(({ o, def }) => ({ label: def!.label, text: servedSessionsText(def!, (sess ?? []).filter(s => s.date >= from(o.start_date) && servesObjective(def!, s)).length) }));
      if (!alive) return;
      setRows(out);
      posthog.capture("objective_contribution_shown", { count: out.length });
    })();
    return () => { alive = false; };
  }, [session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows?.length) return null;
  return (
    <div style={{ ...miniCard, gap: 8, border: "1px solid rgba(255,138,85,.35)" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#ff8a55" }}>🎯 Elle fait avancer tes objectifs</div>
      {rows.map(r => (
        <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, fontSize: 14, color: "rgba(255,255,255,.85)" }}>
          <span style={{ fontWeight: 700, color: "#fff" }}>{r.label}</span>
          <span>{r.text}</span>
        </div>
      ))}
    </div>
  );
}
