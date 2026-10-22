"use client";

/* Choix de la personne connectée sur les démos (« Changer de démo », « Masquer »), table
   exercise_demo_prefs (migration 038, RLS : chacun ses choix). Cache module chargé une fois par
   session ; les lignes d'exercice se re-rendent quand il arrive ou change (useDemoPrefs).
   Limite v1 : le choix d'un coach ne s'applique qu'à son affichage, pas encore chez ses sportifs. */
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { demoById, mediaForLine, type LineMedia } from "@/lib/exerciseDemos";

export interface DemoPref { entry_id: number | null; hidden: boolean }

let prefs = new Map<string, DemoPref>();
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());

function load() {
  if (loaded || loading) return loading;
  loading = (async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from("exercise_demo_prefs").select("demo_key, entry_id, hidden");
      if (error) { console.error("[exercise_demo_prefs] lecture", error); return; }
      prefs = new Map((data ?? []).map(r => [r.demo_key as string, { entry_id: r.entry_id as number | null, hidden: !!r.hidden }]));
    } finally {
      loaded = true;
      emit();
    }
  })();
  return loading;
}

export function useDemoPrefs(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const fn = () => setV(x => x + 1);
    listeners.add(fn);
    load();
    return () => { listeners.delete(fn); };
  }, []);
  return v;
}

export async function setDemoPref(key: string, patch: DemoPref | null) {
  const before = prefs.get(key);
  if (patch) prefs.set(key, patch); else prefs.delete(key);
  emit();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = patch
    ? await supabase.from("exercise_demo_prefs").upsert({ owner_id: user.id, demo_key: key, entry_id: patch.entry_id, hidden: patch.hidden, updated_at: new Date().toISOString() }, { onConflict: "owner_id,demo_key" })
    : await supabase.from("exercise_demo_prefs").delete().eq("owner_id", user.id).eq("demo_key", key);
  if (error) {
    console.error("[exercise_demo_prefs] écriture", error);
    if (before) prefs.set(key, before); else prefs.delete(key);
    emit();
  }
}

export const demoKeyOf = (entryId: number) => String(entryId);
export const imageKeyOf = (key: string) => "img:" + key;

/** mediaForLine + choix de la personne connectée (démo remplacée, démo ou image masquée). */
export function resolveLineMedia(text: string): LineMedia | null {
  const m = mediaForLine(text);
  if (!m) return null;
  if (m.kind === "image") return prefs.get(imageKeyOf(m.key))?.hidden ? null : m;
  const items = m.items.flatMap(it => {
    const p = prefs.get(demoKeyOf(it.entryId));
    if (!p) return [{ ...it, defaultId: it.entryId }];
    if (p.hidden) return [];
    const alt = p.entry_id != null ? demoById(p.entry_id) : null;
    return [alt ? { ...alt, defaultId: it.entryId } : { ...it, defaultId: it.entryId }];
  });
  return items.length ? { ...m, items } : null;
}

/* Ouverture du lecteur depuis n'importe quelle ligne (DemoSheetHost, monté dans le layout racine). */
export const DEMO_SHEET_EVENT = "tpc-demo-sheet";
/** `anchorY` (position du tap dans la page) : utilisé quand la page est en iframe (/p/ sur WordPress),
    où l'iframe fait toute la hauteur du programme et un lecteur « fixed » s'ouvrirait loin du doigt. */
export function openDemoSheet(text: string, editable: boolean, anchorY?: number) {
  window.dispatchEvent(new CustomEvent(DEMO_SHEET_EVENT, { detail: { text, editable, anchorY } }));
}
/* « Mettre ma vidéo » : ouvre le bloc vidéo de la carte d'exercice correspondante dans l'éditeur. */
export const LINE_MEDIA_EVENT = "tpc-line-media";
