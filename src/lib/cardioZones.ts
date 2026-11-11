import { HZ_ZONES, karvonen } from "@/lib/oTests";

/* Zones cardiaques sur la ligne FC de l'onglet Performance (11/11/2026) : mêmes calculs que /o/zones
   (zones-karvonen.js). Karvonen si la FC de repos est connue, sinon % de FC max. Pas de repère ni de
   verdict : c'est un calcul, donc jamais flouté en gratuit. L'app ne connaît pas l'âge : sans FC max
   testée, pas de zones (une estimation par l'âge reste sur la page WordPress). */
export interface CardioZones { method: "karvonen" | "pctmax"; max: number; rest: number | null; zones: { name: string; low: number; high: number; pct: string }[] }

export function cardioZonesFor(max: number | null | undefined, rest: number | null | undefined): CardioZones | null {
  if (!(max != null && max > 0)) return null;
  if (rest != null && rest > 0) {
    const k = karvonen(0, rest, max);
    if (k) return { method: "karvonen", max, rest, zones: k.zones.map(z => ({ name: z.name, low: z.low, high: z.high, pct: `${Math.round(z.a * 100)}-${Math.round(z.b * 100)} %` })) };
  }
  return { method: "pctmax", max, rest: null, zones: HZ_ZONES.map(([a, b, name]) => ({ name, low: Math.round(max * a), high: Math.round(max * b), pct: `${Math.round(a * 100)}-${Math.round(b * 100)} %` })) };
}
