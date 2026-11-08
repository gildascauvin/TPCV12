import { readFile } from "fs/promises";
import path from "path";
import { braiseColor } from "@/lib/ringColors";

/* Kit des images d'aperçu (OG) des liens de l'app (08/11/2026) : racine, programme /p/[id], invitation
   /join/[code]. Rendu satori (next/og) : pas de hooks ni de canvas, l'anneau de décision est redessiné en
   SVG statique avec les mêmes repères que DecisionRing (arc de -120° à +120°, zone, curseur, essaim
   récup bleu / charge orange, petit repère au-dessus du titre). /share garde son propre rendu. */

export const OG_SIZE = { width: 1200, height: 630 };

let fontCache: { name: string; data: Buffer; weight: 500 | 700 | 900; style: "normal" }[] | null = null;
export async function ogFonts() {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), "public/fonts");
  const [w500, w700, w900] = await Promise.all([
    readFile(path.join(dir, "DMSans-500.woff")),
    readFile(path.join(dir, "DMSans-700.woff")),
    readFile(path.join(dir, "DMSans-900.woff")),
  ]);
  fontCache = [
    { name: "DM Sans", data: w500, weight: 500, style: "normal" },
    { name: "DM Sans", data: w700, weight: 700, style: "normal" },
    { name: "DM Sans", data: w900, weight: 900, style: "normal" },
  ];
  return fontCache;
}

let iconCache: string | null = null;
export async function ogIcon() {
  if (!iconCache) iconCache = `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public/icon-192.png"))).toString("base64")}`;
  return iconCache;
}

/* Photo de fond en data URI (satori ne lit que jpeg/png). Échec ou délai : pas de photo, le dégradé suffit. */
export async function ogPhoto(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/jpe?g|png/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

const A0 = -120, A1 = 120, MIN = 1, MAX = 10, TAU = Math.PI * 2;
/* Mêmes repères que DecisionRing.tsx (polar, arcPath, sectorPath, dimensions de l'anneau en grand). */
const ang = (v: number) => A0 + ((Math.min(MAX, Math.max(MIN, v)) - MIN) / (MAX - MIN)) * (A1 - A0);
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
const pt = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
function arc(cx: number, cy: number, r: number, from: number, to: number) {
  return `M ${pt(polar(cx, cy, r, from))} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${pt(polar(cx, cy, r, to))}`;
}
function sector(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number) {
  const rc = ((rOut - rIn) / 2).toFixed(2), big = a1 - a0 > 180 ? 1 : 0;
  return `M ${pt(polar(cx, cy, rOut, a0))} A ${rOut} ${rOut} 0 ${big} 1 ${pt(polar(cx, cy, rOut, a1))}`
    + ` A ${rc} ${rc} 0 0 1 ${pt(polar(cx, cy, rIn, a1))}`
    + ` A ${rIn} ${rIn} 0 ${big} 0 ${pt(polar(cx, cy, rIn, a0))}`
    + ` A ${rc} ${rc} 0 0 1 ${pt(polar(cx, cy, rOut, a0))} Z`;
}

/* L'anneau de décision en grand, figé : palette Braise (la couleur dit l'écart à la zone), zone en
   pointillés, étiquette « OPTIMAL », curseur à 3 traits, essaim récup/charge sur son orbite, halo. */
export function OgRing({ size, value, zone, title, glow, recup, charge }: { size: number; value: number; zone: [number, number]; title: string; glow: string; recup: number; charge: number }) {
  const r = Math.round(size * 0.36), sw = Math.round(size * 0.055);
  const rOut = r + sw * 0.95, rIn = r - sw * 0.95;
  const cx = size / 2, cy = Math.round(rOut + sw / 2 + 3 + 24);
  const h = Math.round(cy + rOut * 0.5 + sw / 2 + 3);
  const [lo, hi] = zone;
  const inZone = Math.round(value) >= lo && Math.round(value) <= hi;
  const end = ang(value), SEGS = 64;
  const fills = Array.from({ length: SEGS }, (_, i) => ({
    d: arc(cx, cy, r, A0 + ((end - A0) * i) / SEGS, A0 + ((end - A0) * (i + 1.04)) / SEGS),
    c: braiseColor(MIN + ((value - MIN) * (i + 0.5)) / SEGS, lo, hi),
  }));
  const [sx, sy] = polar(cx, cy, r, A0), [mx, my] = polar(cx, cy, r, end);
  const za0 = ang(Math.max(MIN, lo - 0.35)), za1 = ang(Math.min(MAX, hi + 0.35));
  /* Essaim (useDecisionSwarm) : 40 points alternés récup/charge sur l'orbite r + 1,15 trait, plus agités
     et plus gros côté charge au-dessus de la zone, regroupés et côté récup en dessous. */
  const hot = value > hi ? Math.min(1, (value - hi) / 2.5) : 0, cold = value < lo ? Math.min(1, (lo - value) / 2.5) : 0;
  const scale = size / 300, Rorb = r + sw * 1.15;
  const dots = Array.from({ length: 40 }, (_, i) => {
    const sd = ((i * 0.618034) % 1), ty = i & 1;
    const u = ((i + 0.5) / 40 + (cold ? Math.floor(sd * 7) / 7 - (i + 0.5) / 40 : 0) * cold * 0.8 + 1) % 1;
    const da = ((A0 - 90) + u * (A1 - A0)) * Math.PI / 180;
    const rr = Rorb + (hot * 22 * Math.sin(10 * sd + i) + cold * (2 + 6 * sd)) * scale;
    const dom = ty ? hot - cold : cold - hot;
    const sz = (1.4 + hot * sd * 1.2 + cold * 1.1) * (1 + 0.7 * Math.max(0, dom) - 0.4 * Math.max(0, -dom)) * scale * 0.95;
    const al = Math.min(1, (0.5 + 0.35 * sd * hot + 0.35 * cold + 0.12) * 0.6 + 0.2) * Math.min(1, u / 0.06, (1 - u) / 0.06);
    return { x: cx + rr * Math.cos(da), y: cy + rr * Math.sin(da), sz, ty, al };
  });
  const knob = Math.max(1, sw / 16);
  const mid = (za0 + za1) / 2, [lx, ly] = polar(cx, cy, rOut + 14, mid);
  const titleSize = Math.round(size * 0.1);
  return (
    <div style={{ position: "relative", display: "flex", width: size, height: h + 40 }}>
      <div style={{ position: "absolute", left: cx - size * 0.575, top: cy - size * 0.575, width: size * 1.15, height: size * 1.15, borderRadius: "50%", backgroundImage: `radial-gradient(circle, ${glow}70 0%, ${glow}28 40%, transparent 68%)` }} />
      <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} style={{ position: "absolute", left: 0, top: 0 }}>
        <path d={arc(cx, cy, Rorb, A0, A1)} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={1} />
        <path d={arc(cx, cy, r, A0, A1)} fill="none" stroke="#1d2226" strokeWidth={sw} strokeLinecap="round" />
        {fills.map((f, i) => <path key={i} d={f.d} fill="none" stroke={f.c} strokeWidth={sw} />)}
        <circle cx={sx} cy={sy} r={sw / 2} fill={braiseColor(MIN, lo, hi)} />
        <circle cx={mx} cy={my} r={sw / 2} fill={braiseColor(value, lo, hi)} />
        {dots.map((d, i) => <circle key={`d${i}`} cx={d.x} cy={d.y} r={d.sz} fill={d.ty ? `rgba(246,128,64,${d.al.toFixed(2)})` : `rgba(128,184,204,${d.al.toFixed(2)})`} />)}
        <path d={sector(cx, cy, rIn, rOut, za0, za1)} fill="none" stroke="rgba(255,255,255,.75)" strokeWidth={2} strokeDasharray="3 3" />
        <g transform={`translate(${mx.toFixed(2)} ${my.toFixed(2)}) scale(${knob.toFixed(2)})`}>
          <circle r={12.5} fill={inZone ? "rgba(42,128,69,.25)" : "rgba(255,255,255,.14)"} />
          <circle r={9.5} fill={inZone ? "#2a8045" : "#18181b"} stroke="rgba(255,255,255,.9)" strokeWidth={1.5} />
          {[-3, 0, 3].map(dy => <line key={dy} x1={-3.5} x2={3.5} y1={dy} y2={dy} stroke="#fff" strokeWidth={2} strokeLinecap="round" />)}
        </g>
      </svg>
      <div style={{ position: "absolute", left: lx - 60, top: ly - 9, width: 120, display: "flex", justifyContent: "center", transform: `rotate(${mid.toFixed(1)}deg)`, fontSize: Math.round(size * 0.03), fontWeight: 700, letterSpacing: 2.4, color: "rgba(255,255,255,.8)" }}>OPTIMAL</div>
      {/* Pastilles de la légende (RÉCUP / CHARGE), comme sous l'anneau de l'Accueil. */}
      <div style={{ position: "absolute", left: 0, top: h - 4, width: size, display: "flex", justifyContent: "center", gap: 12 }}>
        {([["Récup", recup, "#80b8cc"], ["Charge", charge, "#f6803f"]] as const).map(([lab, v, c]) => (
          <div key={lab} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 999, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)", fontSize: 15, fontWeight: 700, letterSpacing: 1.6, color: "rgba(255,255,255,.75)" }}>
            <div style={{ display: "flex", width: 9, height: 9, borderRadius: 5, background: c }} />{lab.toUpperCase()}<div style={{ display: "flex", color: "#fff", fontSize: 17 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, top: cy - Math.round(r * 0.12), width: size, display: "flex", justifyContent: "center", transform: "translateY(-50%)" }}>
        <div style={{ display: "flex", textAlign: "center", justifyContent: "center", fontSize: titleSize, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1, color: "#fff", width: Math.round(rIn * 1.85) }}>{title}</div>
      </div>
    </div>
  );
}

/* Cadre commun : photo assombrie, texte à gauche, anneau à droite, marque en bas à gauche. */
export function OgFrame({ photo, icon, eyebrow, title, sub, ring }: { photo: string | null; icon: string; eyebrow: string; title: string; sub: string; ring: React.ReactNode }) {
  return (
    <div style={{ display: "flex", width: OG_SIZE.width, height: OG_SIZE.height, position: "relative", background: "#070a0d", fontFamily: "DM Sans", color: "#fff" }}>
      {photo && <img src={photo} width={OG_SIZE.width} height={OG_SIZE.height} style={{ position: "absolute", left: 0, top: 0, width: OG_SIZE.width, height: OG_SIZE.height, objectFit: "cover" }} />}
      <div style={{ position: "absolute", left: 0, top: 0, width: OG_SIZE.width, height: OG_SIZE.height, display: "flex", backgroundImage: "linear-gradient(90deg, rgba(7,10,13,.96) 0%, rgba(7,10,13,.86) 48%, rgba(7,10,13,.62) 100%)" }} />
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", padding: "56px 56px 48px 64px", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 24, height: "100%", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#ffb08a", marginBottom: 18 }}>{eyebrow}</div>
            <div style={{ display: "flex", fontSize: title.length > 60 ? 50 : 58, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1.5 }}>{title}</div>
            <div style={{ display: "flex", fontSize: 27, fontWeight: 500, lineHeight: 1.35, color: "rgba(255,255,255,.8)", marginTop: 22 }}>{sub}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <img src={icon} width={48} height={48} style={{ borderRadius: 12 }} />
            <div style={{ display: "flex", fontSize: 26, fontWeight: 900, letterSpacing: -0.5 }}>ThePerfClub</div>
          </div>
        </div>
        <div style={{ display: "flex", width: 470, justifyContent: "center", alignItems: "center" }}>{ring}</div>
      </div>
    </div>
  );
}
