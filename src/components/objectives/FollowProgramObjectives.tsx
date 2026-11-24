"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import posthog from "@/lib/ph";
import { createClient } from "@/lib/supabase/client";
import { programServes, serveLine, type ProgramServe } from "@/lib/programServes";
import { refreshFollowedObjectives } from "@/lib/objectivesClient";
import type { ProgramTemplate } from "@/types";

/* « Suivre aussi ses objectifs ? » (P2, 24/11/2026) : quand le sportif démarre un programme (bibliothèque,
   générateur, import, ou ajout depuis une page /p/), on lui propose de suivre les objectifs que ce
   programme travaille, cibles calculées par l'onglet Objectifs, échéance = fin du programme. Tout coché
   dans la limite des 3 objectifs, décochable ; rien si le programme ne sert rien de nouveau.
   Déclenché par l'événement PROGRAM_STARTED ou par ?suivre=<programId> (retour d'une page /p/). */

export const PROGRAM_STARTED = "tpc:program-started";
export function notifyProgramStarted(programId: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PROGRAM_STARTED, { detail: { programId } }));
}

const MAX = 3;
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

type Offer = { programId: string; name: string; weeks: number; items: ProgramServe[]; slots: number };

export default function FollowProgramObjectives() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function prepare(programId: string) {
    const supabase = createClient();
    const { data, error } = await supabase.from("programs").select("name, weeks_count, template").eq("id", programId).maybeSingle();
    if (error || !data) { if (error) console.error("[objectifs programme] lecture", error.message); return; }
    const followed = await refreshFollowedObjectives(); // lecture fraîche : la limite de 3 doit tenir
    const slots = MAX - followed.length;
    const items = programServes(data.template as ProgramTemplate).filter(s => !followed.includes(`metric:${s.metric}`));
    if (slots <= 0 || !items.length) return;
    setOffer({ programId, name: data.name as string, weeks: Math.max(1, Number(data.weeks_count) || 8), items, slots });
    setPicked(items.slice(0, slots).map(i => i.metric));
    setErr(null);
    posthog.capture("program_objectives_offered", { count: items.length, slots });
  }

  useEffect(() => {
    const on = (e: Event) => { const id = (e as CustomEvent<{ programId: string }>).detail?.programId; if (id) prepare(id); };
    window.addEventListener(PROGRAM_STARTED, on);
    return () => window.removeEventListener(PROGRAM_STARTED, on);
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
  const deadline = addDays(todayIso(), offer.weeks * 7);
  const close = () => { posthog.capture("program_objectives_dismissed", { count: offer.items.length }); setOffer(null); };

  async function follow() {
    if (!offer || !picked.length) return close();
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const start = todayIso();
    const { error } = await supabase.from("objectives").insert(picked.map(m => ({ user_id: user.id, objective_id: `metric:${m}`, start_date: start, deadline })));
    setSaving(false);
    if (error) { console.error("[objectifs programme] écriture", error.message); setErr("Enregistrement impossible. Réessaie."); return; }
    posthog.capture("program_objectives_followed", { count: picked.length, metrics: picked });
    await refreshFollowedObjectives();
    setOffer(null);
    router.refresh();
  }

  const toggle = (m: string) => setPicked(p => p.includes(m) ? p.filter(x => x !== m) : p.length >= offer.slots ? p : [...p, m]);

  return createPortal(
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 2147483090, background: "rgba(4,6,8,.5)" }} />
      <div role="dialog" aria-modal="true" aria-label="Suivre ses objectifs" style={{
        position: "fixed", left: "50%", bottom: 0, transform: "translateX(-50%)", zIndex: 2147483100, width: "min(520px, 100vw)",
        maxHeight: "88dvh", overflowY: "auto", background: "#fff", color: "#171b1f", borderRadius: "28px 28px 0 0",
        padding: "10px 22px calc(22px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -20px 50px rgba(0,0,0,.35)", animation: "sheetInUp .32s cubic-bezier(.32,.72,0,1)",
      }}>
        <div aria-hidden style={{ width: 38, height: 4, borderRadius: 4, background: "rgba(0,0,0,.14)", margin: "0 auto 14px" }} />
        <div style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 }}>Suivre aussi ses objectifs ?</div>
        <div style={{ fontSize: 13.5, color: "#62686e", marginTop: 6, lineHeight: 1.45 }}>
          {offer.name} les travaille. Tes séances les feront avancer, tu verras où tu en es dans l&apos;onglet Objectifs.
        </div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column" }}>
          {offer.items.map(it => {
            const on = picked.includes(it.metric);
            const full = !on && picked.length >= offer.slots;
            return (
              <button key={it.metric} type="button" onClick={() => toggle(it.metric)} disabled={full} aria-pressed={on}
                style={{ display: "grid", gridTemplateColumns: "26px 1fr", gap: 12, alignItems: "center", textAlign: "left", padding: "12px 0", border: 0, borderTop: "1px solid rgba(0,0,0,.07)", background: "none", cursor: full ? "default" : "pointer", fontFamily: "inherit", color: "#171b1f", opacity: full ? 0.45 : 1 }}>
                <span style={{ width: 24, height: 24, borderRadius: 8, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 900, background: on ? "#171b1f" : "#fff", color: "#fff", border: on ? "none" : "2px solid rgba(0,0,0,.2)" }}>{on ? "✓" : ""}</span>
                <span>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>{it.label}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: "#62686e", marginTop: 2 }}>{serveLine(it)} · d&apos;ici le {fmt(deadline)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {offer.slots < offer.items.length && <div style={{ fontSize: 12, color: "#8a8f94", marginTop: 6 }}>Jusqu&apos;à 3 objectifs : il te reste {offer.slots} place{offer.slots > 1 ? "s" : ""}.</div>}
        {err && <div role="alert" style={{ fontSize: 13, color: "#d44000", marginTop: 8 }}>{err}</div>}
        <button type="button" onClick={follow} disabled={saving}
          style={{ width: "100%", height: 52, marginTop: 16, borderRadius: 14, border: 0, background: "linear-gradient(180deg,#f04a08,#d44000)", color: "#fff", fontFamily: "inherit", fontSize: 15.5, fontWeight: 800, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Enregistrement…" : picked.length ? `Suivre ${picked.length > 1 ? `ces ${picked.length} objectifs` : "cet objectif"}` : "Continuer sans objectif"}
        </button>
        <button type="button" onClick={close} style={{ display: "block", margin: "10px auto 0", border: 0, background: "none", color: "#62686e", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Plus tard</button>
      </div>
    </>,
    document.body,
  );
}
