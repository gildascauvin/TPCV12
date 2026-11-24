"use client";

import { useId } from "react";
import type { RewardKey } from "@/lib/streak";

/* Icônes de la série dans la charte du logo (24/11/2026, Gildas : « plutôt la charte du logo ») :
   traits épais à bouts ronds, piste grise, segment au dégradé du logo (#ffb5a7 → #d44000), curseur
   noir à liseré blanc. Une seule grammaire pour toutes les récompenses et les jours de la semaine. */

const SW = 3.2;

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="4" y1="6" x2="20" y2="18">
        <stop offset="0" stopColor="#ffb5a7" />
        <stop offset="1" stopColor="#d44000" />
      </linearGradient>
    </defs>
  );
}
const Knob = ({ x, y, r = 2.7 }: { x: number; y: number; r?: number }) => <circle cx={x} cy={y} r={r} fill="#18181b" stroke="#fff" strokeWidth={1.4} />;

export function RewardGlyph({ k, size = 24, on = true }: { k: RewardKey; size?: number; on?: boolean }) {
  const gid = `bi${useId().replace(/:/g, "")}`;
  const track = on ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.18)";
  const acc = on ? `url(#${gid})` : "rgba(255,255,255,.38)";
  const p = { fill: "none", strokeWidth: SW, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const knob = (x: number, y: number) => on ? <Knob x={x} y={y} /> : <circle cx={x} cy={y} r={2.2} fill="rgba(255,255,255,.38)" />;
  let body: React.ReactNode;
  switch (k) {
    case "form": // le curseur du point forme
      body = <><path d="M4 12h16" stroke={track} {...p} /><path d="M4 12h9" stroke={acc} {...p} />{knob(13, 12)}</>; break;
    case "build": // les semaines d'un programme
      body = <><path d="M5 7h14M5 12h14M5 17h14" stroke={track} {...p} /><path d="M5 12h9" stroke={acc} {...p} /></>; break;
    case "adjust": // la jauge de décision (le logo)
      body = <><path d="M6.3 17.7A8 8 0 1 1 17.7 17.7" stroke={track} {...p} /><path d="M16.9 7.1A8 8 0 0 1 19.5 13" stroke={acc} {...p} />{knob(18.6, 10)}</>; break;
    case "unlock": // le sommet
      body = <><path d="M4 18l8-11 8 11" stroke={track} {...p} /><path d="M8 12.5L12 7l4 5.5" stroke={acc} {...p} />{knob(12, 7)}</>; break;
    case "fatigue": // la charge qui baisse au bon moment
      body = <><path d="M4 7l8 5 8 5" stroke={track} {...p} /><path d="M12 12l8 5" stroke={acc} {...p} />{knob(12, 12)}</>; break;
    case "listened": // le pied levé : la courbe qui redescend
      body = <><path d="M3.5 15h4l3-7 3 9 3-5h4" stroke={track} {...p} /><path d="M13.5 17l3-5h4" stroke={acc} {...p} />{knob(20.5, 12)}</>; break;
    case "perfect_week": // sept jours pleins
      body = <>{[4, 7.7, 11.3, 15, 18.7].map(x => <path key={x} d={`M${x} 8v8`} stroke={acc} {...p} />)}<path d="M21.5 8v8" stroke={acc} {...p} />{knob(21.5, 12)}</>; break;
    case "streak7": case "streak30": case "streak100": {
      const n = k === "streak7" ? "7" : k === "streak30" ? "30" : "100";
      body = <><path d="M4 19h16" stroke={track} {...p} /><path d="M4 19h16" stroke={acc} {...p} strokeDasharray={k === "streak7" ? "6 30" : k === "streak30" ? "11 30" : "16 30"} />
        <text x="12" y="15" textAnchor="middle" fontFamily="var(--font-display), system-ui" fontWeight={800} fontSize={n.length > 2 ? 9 : 11} fill={on ? "#fff" : "rgba(255,255,255,.45)"}>{n}</text></>;
      break;
    }
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><Defs id={gid} />{body}</svg>;
}

/** Glyphe d'un jour de la semaine : séance = segment orange, repos = point, jour sauvé = le curseur. */
export function DayGlyph({ kind, size = 18 }: { kind: "session" | "rest" | "saved"; size?: number }) {
  const gid = `dg${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <Defs id={gid} />
      {kind === "session" && <path d="M5 12h14" stroke={`url(#${gid})`} strokeWidth={4.2} strokeLinecap="round" />}
      {kind === "rest" && <circle cx="12" cy="12" r="3.2" fill="rgba(255,255,255,.75)" />}
      {kind === "saved" && <Knob x={12} y={12} r={4.6} />}
    </svg>
  );
}

export function Chevron({ size = 16, color = "#ff8a55" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><path d="M9 6l6 6-6 6" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
