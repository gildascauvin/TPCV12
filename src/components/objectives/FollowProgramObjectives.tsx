"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import posthog from "@/lib/ph";
import { createClient } from "@/lib/supabase/client";
import { programServes, serveLine } from "@/lib/programServes";
import { refreshFollowedObjectives } from "@/lib/objectivesClient";
import { METRIC_DISPLAY, type MetricKey } from "@/lib/testNorms";
import { defById } from "@/lib/objectives";
import type { ProgramTemplate } from "@/types";

/* Suivre des objectifs depuis un programme ou une carte (P2-P3, 24/11/2026).
   - Démarrage d'un programme (bibliothèque, générateur, import, ajout depuis /p/) : « Suivre aussi ses
     objectifs ? », cases cochées dans la limite des 3, échéance = fin du programme. L'objectif choisi dans le
     générateur (« Pour quel objectif ? ») passe en premier.
   - Déjà 3 objectifs suivis : on propose sur place lequel remplacer (plus besoin de changer d'onglet).
   Déclenché par PROGRAM_STARTED, FOLLOW_OBJECTIVE (carte « + » quand c'est plein) ou ?suivre=<programId>. */

export const PROGRAM_STARTED = "tpc:program-started";
export const FOLLOW_OBJECTIVE = "tpc:follow-objective";
export function notifyProgramStarted(programId: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PROGRAM_STARTED, { detail: { programId } }));
}
export function notifyFollowObjective(metric: string, weeks: number) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FOLLOW_OBJECTIVE, { detail: { metric, weeks } }));
}
/** Objectif choisi dans le générateur pour un programme créé (lu au démarrage de ce programme). */
export function rememberProgramObjective(programId: string, metric: string) {
  try { sessionStorage.setItem(`tpc_program_objective_${programId}`, metric); } catch { /* stockage indisponible */ }
}

const MAX = 3;
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
const labelOf = (id: string) => defById(id, null)?.label ?? (id.startsWith("metric:") ? METRIC_DISPLAY[id.slice(7) as MetricKey]?.name : null) ?? id;

type Item = { metric: string; label: string; line: string };
type Offer = { name: string | null; weeks: number; items: Item[]; slots: number; followed: string[] };

export default function FollowProgramObjectives() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [drop, setDrop] = useState<string | null>(null); // objectif suivi à remplacer (mode plein)
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function open(o: Omit<Offer, "slots" | "followed">) {
    const followed = await refreshFollowedObjectives(); // lecture fraîche : la limite de 3 doit tenir
    const items = o.items.filter(i => !followed.includes(`metric:${i.metric}`));
    if (!items.length) return;
    const slots = MAX - followed.length;
    setOffer({ ...o, items, slots, followed });
    setPicked(slots > 0 ? items.slice(0, slots).map(i => i.metric) : [items[0].metric]);
    setDrop(null);
    setErr(null);
    posthog.capture("program_objectives_offered", { count: items.length, slots, replace: slots <= 0 });
  }

  async function prepare(programId: string) {
    const supabase = createClient();
    const { data, error } = await supabase.from("programs").select("name, weeks_count, template").eq("id", programId).maybeSingle();
    if (error || !data) { if (error) console.error("[objectifs programme] lecture", error.message); return; }
    let chosen: string | null = null;
    try { chosen = sessionStorage.getItem(`tpc_program_objective_${programId}`); sessionStorage.removeItem(`tpc_program_objective_${programId}`); } catch { /* idem */ }
    const serves = programServes(data.template as ProgramTemplate).slice(0, 3).map(s => ({ metric: s.metric as string, label: s.label, line: serveLine(s) }));
    const m = chosen?.startsWith("metric:") ? chosen.slice(7) : null;
    const items: Item[] = m ? [serves.find(s => s.metric === m) ?? { metric: m, label: METRIC_DISPLAY[m as MetricKey]?.name ?? m, line: "L'objectif choisi pour ce programme" }, ...serves.filter(s => s.metric !== m)] : serves;
    await open({ name: data.name as string, weeks: Math.max(1, Number(data.weeks_count) || 8), items });
  }

  useEffect(() => {
    const onStart = (e: Event) => { const id = (e as CustomEvent<{ programId: string }>).detail?.programId; if (id) prepare(id); };
    const onFollow = (e: Event) => {
      const d = (e as CustomEvent<{ metric: string; weeks: number }>).detail;
      if (d?.metric) open({ name: null, weeks: d.weeks || 8, items: [{ metric: d.metric, label: METRIC_DISPLAY[d.metric as MetricKey]?.name ?? d.metric, line: "" }] });
    };
    window.addEventListener(PROGRAM_STARTED, onStart);
    window.addEventListener(FOLLOW_OBJECTIVE, onFollow);
    return () => { window.removeEventListener(PROGRAM_STARTED, onStart); window.removeEventListener(FOLLOW_OBJECTIVE, onFollow); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = search?.get("suivre");
    if (!id) return;
    prepare(id);
    const params = new URLSearchParams(search.toString());
    params.delete("suivre");
    router.replace(params.toString() ? `${pathname}?${params}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (!offer) return null;
  const full = offer.slots <= 0;
  const deadline = addDays(todayIso(), offer.weeks * 7);
  const close = () => { posthog.capture("program_objectives_dismissed", { count: offer.items.length, replace: full }); setOffer(null); };

  async function follow() {
    if (!offer || !picked.length || (full && !drop)) return close();
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    if (full && drop) {
      const { error: delErr } = await supabase.from("objectives").delete().eq("user_id", user.id).eq("objective_id", drop);
      if (delErr) { setSaving(false); console.error("[objectifs] remplacement", delErr.message); setErr("Enregistrement impossible. Réessaie."); return; }
    }
    const start = todayIso();
    const { error } = await supabase.from("objectives").insert(picked.map(m => ({ user_id: user.id, objective_id: `metric:${m}`, start_date: start, deadline })));
    setSaving(false);
    if (error) { console.error("[objectifs programme] écriture", error.message); setErr("Enregistrement impossible. Réessaie."); return; }
    posthog.capture("program_objectives_followed", { count: picked.length, metrics: picked, replaced: drop });
    await refreshFollowedObjectives();
    setOffer(null);
    router.refresh();
  }

  const toggle = (m: string) => setPicked(p => full ? [m] : p.includes(m) ? p.filter(x => x !== m) : p.length >= offer.slots ? p : [...p, m]);
  const box = (on: boolean, round = false): React.CSSProperties => ({ width: 24, height: 24, borderRadius: round ? "50%" : 8, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 900, background: on ? "#171b1f" : "#fff", color: "#fff", border: on ? "none" : "2px solid rgba(0,0,0,.2)" });
  const rowStyle = (disabled = false): React.CSSProperties => ({ display: "grid", gridTemplateColumns: "26px 1fr", gap: 12, alignItems: "center", textAlign: "left", padding: "12px 0", border: 0, borderTop: "1px solid rgba(0,0,0,.07)", background: "none", cursor: disabled ? "default" : "pointer", fontFamily: "inherit", color: "#171b1f", opacity: disabled ? 0.45 : 1, width: "100%" });

  return createPortal(
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 2147483090, background: "rgba(4,6,8,.5)" }} />
      <div role="dialog" aria-modal="true" aria-label="Suivre des objectifs" style={{
        position: "fixed", left: 0, right: 0, bottom: 0, marginLeft: "auto", marginRight: "auto", zIndex: 2147483100, width: "min(520px, 100vw)",
        maxHeight: "88dvh", overflowY: "auto", background: "#fff", color: "#171b1f", borderRadius: "28px 28px 0 0",
        padding: "10px 22px calc(22px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -20px 50px rgba(0,0,0,.35)", animation: "sheetInUp .32s cubic-bezier(.32,.72,0,1)",
      }}>
        <div aria-hidden style={{ width: 38, height: 4, borderRadius: 4, background: "rgba(0,0,0,.14)", margin: "0 auto 14px" }} />
        <div style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          {full ? "Tu suis déjà 3 objectifs" : offer.name ? "Les objectifs qu'il travaille" : "Suivre cet objectif"}
        </div>
        <div style={{ fontSize: 13.5, color: "#62686e", marginTop: 6, lineHeight: 1.45 }}>
          {full ? "Choisis le nouvel objectif, puis celui qu'il remplace. L'historique de l'ancien reste dans sa fiche."
            : offer.name ? <>{offer.name} les travaille. Tes séances les feront avancer, tu verras où tu en es dans l&apos;onglet Objectifs.</> : "Tes séances le feront avancer, tu verras où tu en es dans l'onglet Objectifs."}
        </div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column" }}>
          {full && <div style={{ fontSize: 12, fontWeight: 700, color: "#8a8f94", marginBottom: 2 }}>Nouvel objectif</div>}
          {offer.items.map(it => {
            const on = picked.includes(it.metric);
            const disabled = !full && !on && picked.length >= offer.slots;
            return (
              <button key={it.metric} type="button" onClick={() => toggle(it.metric)} disabled={disabled} aria-pressed={on} style={rowStyle(disabled)}>
                <span style={box(on, full)}>{on ? "✓" : ""}</span>
                <span>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>{it.label}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: "#62686e", marginTop: 2 }}>{it.line ? `${it.line} · ` : ""}d&apos;ici le {fmt(deadline)}</span>
                </span>
              </button>
            );
          })}
          {full && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#8a8f94", margin: "14px 0 2px" }}>Il remplace</div>
              {offer.followed.map(id => (
                <button key={id} type="button" onClick={() => setDrop(id)} aria-pressed={drop === id} style={rowStyle()}>
                  <span style={box(drop === id, true)}>{drop === id ? "✓" : ""}</span>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{labelOf(id)}</span>
                </button>
              ))}
            </>
          )}
        </div>
        {!full && offer.slots < offer.items.length && <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 6 }}>Jusqu&apos;à 3 objectifs : il te reste {offer.slots} place{offer.slots > 1 ? "s" : ""}.</div>}
        {err && <div role="alert" style={{ fontSize: 13, color: "#d44000", marginTop: 8 }}>{err}</div>}
        <button type="button" onClick={follow} disabled={saving || (full && !drop)}
          style={{ width: "100%", height: 52, marginTop: 16, borderRadius: 14, border: 0, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontFamily: "inherit", fontSize: 15.5, fontWeight: 800, cursor: "pointer", opacity: saving || (full && !drop) ? 0.55 : 1 }}>
          {saving ? "Enregistrement…" : full ? "Remplacer" : picked.length ? `Suivre ${picked.length > 1 ? `ces ${picked.length} objectifs` : "cet objectif"}` : "Continuer sans objectif"}
        </button>
        <button type="button" onClick={close} style={{ display: "block", margin: "10px auto 0", border: 0, background: "none", color: "#62686e", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{full ? "Garder mes objectifs" : "Plus tard"}</button>
      </div>
    </>,
    document.body,
  );
}
