"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "@/lib/ph";
import { BottomSheet } from "@/components/tests/TestsPanel";
import type { MetricKey } from "@/lib/testNorms";

/* « Je le teste en séance » (25/11) : propose où placer le 1er test (POST /api/objectives/plan-test sans
   `apply`), le sportif choisit le jour, puis la ligne test est écrite. Ouvert depuis « Renseigne ton 1er
   test » sur la fiche d'un test sans valeur (une seule entrée, plus de carte « Teste-le cette semaine »).
   Jamais un test placé dans une séance inadaptée (la route ne le propose pas). */

type Opt = { kind: "mark" | "start" | "new"; date: string; sessionId: string | null; sessionName: string | null };
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayTxt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const optTitle = (o: Opt) => o.kind === "new" ? `${dayTxt(o.date)} · une courte séance test` : o.kind === "mark" ? `${dayTxt(o.date)} · dans ta séance ${o.sessionName ?? ""}` : `${dayTxt(o.date)} · au début de ta séance ${o.sessionName ?? ""}`;
const optSub = (o: Opt) => o.kind === "new" ? "Échauffement puis le test, environ 30 minutes." : o.kind === "mark" ? "Elle contient déjà ce mouvement : cette ligne devient ton test." : "Juste après l'échauffement : un test se fait frais.";
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default function PlanTestSheet({ metric, onClose }: { metric: MetricKey; onClose: () => void }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "choose" | "saving" | "done" | "error">("loading");
  const [options, setOptions] = useState<Opt[]>([]);
  const [pick, setPick] = useState(0);
  const [test, setTest] = useState<string | undefined>();
  const [done, setDone] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await fetch("/api/objectives/plan-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metric, today: todayLocal() }) }).catch(() => null);
      const j = r?.ok ? await r.json().catch(() => null) : null;
      if (!alive) return;
      if (!j?.options?.length) { setState("error"); return; }
      const opts = j.options as Opt[];
      setOptions(opts);
      setPick(Math.max(0, opts.findIndex(o => o.kind === j.recommended.kind && o.sessionId === j.recommended.sessionId && o.date === j.recommended.date)));
      setTest(j.test);
      setState("choose");
    })();
    return () => { alive = false; };
  }, [metric]);

  async function apply() {
    const o = options[pick];
    if (!o) return;
    setState("saving");
    const r = await fetch("/api/objectives/plan-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metric, today: todayLocal(), apply: o }) }).catch(() => null);
    if (!r?.ok) { setState("error"); return; }
    setDone(`${cap(optTitle(o))}. Tu notes ta valeur en séance.`);
    setState("done");
    posthog.capture("objective_test_planned", { metric, kind: o.kind });
  }

  const cta: React.CSSProperties = { width: "100%", height: 52, marginTop: 18, borderRadius: 14, border: 0, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontFamily: "inherit", fontSize: 15.5, fontWeight: 800, cursor: "pointer" };
  return (
    <BottomSheet title={state === "done" ? "Test préparé" : "Le jour de ton test"} subtitle={test} onClose={onClose}>
      {state === "loading" && <div style={{ fontSize: 14, color: "#62686e" }}>…</div>}
      {state === "error" && <div style={{ fontSize: 14, color: "#d44000" }}>Impossible de préparer le test. Réessaie, ou renseigne ta valeur directement.</div>}
      {state === "done" && (
        <>
          <div style={{ fontSize: 14.5, lineHeight: 1.5 }}>{done}</div>
          <button type="button" onClick={() => router.push("/week")} style={cta}>Voir mon planning</button>
          <button type="button" onClick={onClose} style={{ display: "block", margin: "10px auto 0", border: 0, background: "none", color: "#62686e", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Fermer</button>
        </>
      )}
      {(state === "choose" || state === "saving") && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {options.map((o, i) => {
              const on = i === pick;
              return (
                <button key={`${o.kind}-${o.sessionId ?? o.date}`} type="button" onClick={() => setPick(i)} aria-pressed={on}
                  style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 12, alignItems: "start", textAlign: "left", padding: "12px 14px", borderRadius: 14, border: on ? "2px solid #171b1f" : "1px solid rgba(0,0,0,.1)", background: on ? "#f7f6f4" : "#fff", color: "#171b1f", fontFamily: "inherit", cursor: "pointer" }}>
                  <span style={{ width: 20, height: 20, marginTop: 1, borderRadius: "50%", border: on ? "6px solid #171b1f" : "2px solid rgba(0,0,0,.25)", boxSizing: "border-box" }} />
                  <span>
                    <span style={{ display: "block", fontSize: 14.5, fontWeight: 800 }}>{cap(optTitle(o))}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: "#62686e", marginTop: 2 }}>{optSub(o)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={apply} disabled={state === "saving"} style={{ ...cta, opacity: state === "saving" ? 0.7 : 1 }}>
            {state === "saving" ? "Préparation…" : "Préparer le test"}
          </button>
        </>
      )}
    </BottomSheet>
  );
}
