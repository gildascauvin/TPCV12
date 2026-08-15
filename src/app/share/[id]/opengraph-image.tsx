import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import { getShare } from "./shareMeta";
import { wellnessColor } from "@/lib/wellness";

/* Image OG dynamique par partage — sans ça, WhatsApp n'affiche souvent AUCUNE carte de preview.
   v4 (2026-08-16, suite) : les 2 rounds précédents avaient encore 2 écarts réels signalés par
   Gildas ("c'est pas fidèle") — pas juste du style :
   1. Aucune police chargée → satori retombe sur sa police par défaut, visuellement rien à voir avec
      DM Sans (utilisée partout dans l'app, next/font). Fix : 3 fichiers .woff DM Sans (500/700/900,
      téléchargés une fois dans public/fonts/, satori ne supporte pas woff2 sans décompresseur
      externe — récupérés via l'API Google Fonts avec un user-agent de vieux navigateur, qui sert du
      woff simple) chargés en local (fs, runtime Node) et passés à `fonts` de ImageResponse.
   2. Du VRAI CONTENU du snapshot n'était jamais affiché : `trainingAdvice` (wellness n'affichait
      que `recoveryAdvice`), les badges (Monotonie/Contrainte/Fitness/Fatigue ou Récup/Forme,
      absents du chart Charge/Récupération), et "Partagé par {authorName}" (absent partout). Fix :
      chaque type reproduit maintenant la structure exacte de ShareView.tsx section par section,
      pas un résumé.
   Carte recentrée et redimensionnée pour rester proche des proportions réelles (ShareView.tsx :
   maxWidth 460, radius 26, padding 22) plutôt qu'étirée sur tout le canvas 1200×630 — logo au-dessus
   de la carte (comme sur la vraie page /share/[id]), pas dans le coin de la carte. satori (moteur de
   next/og) supporte flexbox/gap/border-radius/gradient/SVG basique et transform sur <svg>, mais pas
   box-shadow de façon fiable — la carte reste distinguée du fond par un contour léger. */

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#d44000";
const DAY_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
type Behavior = { emoji: string; label: string; positive: boolean };
type Badge = { key: string; label: string; color: string };

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return DAY_FR[d.getDay()];
}

// DM Sans n'a que 500/700/900 de chargés — round vers le poids dispo le plus proche plutôt que de
// laisser satori retomber sur une police système pour un poids non fourni (ex. 650, 800, 1000).
function fw(w: number): 500 | 700 | 900 {
  return w < 620 ? 500 : w < 850 ? 700 : 900;
}

let fontCache: { name: string; data: Buffer; weight: 500 | 700 | 900; style: "normal" }[] | null = null;
async function loadFonts() {
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

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(180deg,#f04a08,#d44000)", display: "flex" }} />
      <div style={{ fontSize: 17, fontWeight: fw(900), display: "flex", color: "#171b1f" }}>ThePerfClub</div>
    </div>
  );
}

// Copie fidèle du Ring de ShareView.tsx (badge circulaire dark, score + "récup." en petites
// capitales dessous) — mêmes ratios (stroke 8%, rayon 42%), même dégradé de fond.
function Ring({ score, size: s = 110 }: { score: number | null; size?: number }) {
  const r = s * 0.42;
  const circ = 2 * Math.PI * r;
  const pct = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = circ * (1 - pct / 100);
  const color = wellnessColor(score);
  return (
    <div style={{ position: "relative", flexShrink: 0, width: s, height: s, borderRadius: s / 2, background: "linear-gradient(145deg,#171717,#2f2f2f)", display: "flex" }}>
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ display: "flex", transform: "rotate(-90deg)" }}>
        <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={s * 0.08} />
        <circle
          cx={s / 2} cy={s / 2} r={r} fill="none" stroke={color} strokeWidth={s * 0.08}
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: s * 0.3, fontWeight: fw(900), color, display: "flex", letterSpacing: -1 }}>{score ?? "—"}</div>
        <div style={{ fontSize: s * 0.1, fontWeight: fw(900), color: "rgba(255,255,255,.55)", textTransform: "uppercase", display: "flex", letterSpacing: 1, marginTop: 1 }}>récup.</div>
      </div>
    </div>
  );
}

// Mêmes couleurs/tailles/radius que Chip de ShareView.tsx (pastille comportement)
function Chip({ b }: { b: Behavior }) {
  return (
    <div style={{
      display: "flex", fontSize: 15, fontWeight: fw(700), padding: "6px 14px", borderRadius: 999,
      background: b.positive ? "rgba(47,158,68,.18)" : "rgba(212,64,0,.22)", color: b.positive ? "#bfeec8" : "#ffd2bf",
    }}>
      {b.emoji} {b.label}
    </div>
  );
}

// Mêmes couleurs/radius que ZoneBadge.tsx (version statique, sans le tooltip au tap — inutile sur
// une image figée)
function MiniBadge({ b }: { b: Badge }) {
  return (
    <div style={{
      display: "flex", fontSize: 13, fontWeight: fw(900), color: b.color, background: `${b.color}22`,
      border: `1px solid ${b.color}44`, borderRadius: 999, padding: "4px 12px", letterSpacing: 1, textTransform: "uppercase",
    }}>
      {b.label}
    </div>
  );
}

// Mêmes seuils/gradient que DiffGauge.tsx
function Gauge({ value, height = 14 }: { value: number; height?: number }) {
  const cls = value >= 8 ? "hard" : value >= 5 ? "moderate" : "easy";
  const bg = { hard: "linear-gradient(90deg,#ffb5a7,#d44000)", moderate: "linear-gradient(90deg,#ffe0a0,#f28a00)", easy: "linear-gradient(90deg,#bfeec8,#2f9e44)" }[cls];
  const w = Math.max(22, Math.min(100, Math.round(value * 10)));
  return (
    <div style={{ display: "flex", width: "100%", height, borderRadius: 999, background: "#e7e4df" }}>
      <div style={{ display: "flex", height: "100%", width: `${w}%`, borderRadius: 999, background: bg }} />
    </div>
  );
}

// Mêmes bordure/radius/padding/couleur que ExerciseList de ShareView.tsx
function ExerciseList({ exercises, max = 4 }: { exercises: string[]; max?: number }) {
  const shown = exercises.slice(0, max);
  const more = exercises.length - shown.length;
  if (!shown.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", border: "1px solid rgba(0,0,0,.08)", borderRadius: 16, overflow: "hidden" }}>
      {shown.map((ex, i) => (
        <div key={i} style={{ display: "flex", padding: "11px 14px", borderTop: i > 0 ? "1px solid rgba(0,0,0,.06)" : "none", fontSize: 15, fontWeight: fw(650), color: "#2c3236" }}>
          {ex.length > 70 ? ex.slice(0, 70) + "…" : ex}
        </div>
      ))}
      {more > 0 && (
        <div style={{ display: "flex", padding: "9px 14px", borderTop: "1px solid rgba(0,0,0,.06)", fontSize: 13, color: "#8a8f94" }}>+{more} autre{more > 1 ? "s" : ""}</div>
      )}
    </div>
  );
}

// Bandes + labels ACWR — mêmes seuils/couleurs/textes que ZoneSparkline.tsx (Gabbett et al.)
const ZONES = [
  { max: 0.8, color: "#7ecb20" },
  { max: 1.3, color: "#2f9e44" },
  { max: Infinity, color: "#d44000" },
];
function zoneColorFor(v: number) { return (ZONES.find(z => v < z.max) ?? ZONES[2]).color; }

function MiniChart({ points, dates, colorFn, fixedColor, showZones, maxVal, h = 190 }: {
  points: (number | null)[]; dates: string[]; colorFn?: (v: number) => string; fixedColor?: string; showZones?: boolean; maxVal: number; h?: number;
}) {
  const w = 900, pad = 14;
  const vals = points.filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const step = (w - pad * 2) / Math.max(1, points.length - 1);
  // Échelle FIXE (0..maxVal, clampée), pas un auto-fit sur la plage des données — même convention
  // que les vrais ZoneSparkline (DISPLAY_MAX=2)/SparkLineClient (maxVal=100) : une semaine calme
  // doit visuellement rester basse sur le graphe, pas être étirée pour remplir toute la hauteur.
  const toY = (v: number) => pad + (h - pad * 2) - (Math.max(0, Math.min(maxVal, v)) / maxVal) * (h - pad * 2);
  const coords = points.map((v, i) => v === null ? null : { x: pad + i * step, y: toY(v) });
  const line = coords.filter((c): c is { x: number; y: number } => c !== null).map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const zoneW = 7;
  return (
    <div style={{ display: "flex", width: "100%", flexDirection: "column" }}>
      <div style={{ display: "flex", width: "100%" }}>
        {showZones && (
          // Ordre haut→bas = Surcharge/Optimal/Récup. (ratio décroissant, même sens que l'axe Y du
          // vrai ZoneSparkline). Hauteurs proportionnelles aux bornes réelles sur DISPLAY_MAX=2
          // (1.3–2 / 0.8–1.3 / 0–0.8) — en px explicites, satori ne respecte pas les `flex`
          // fractionnaires (rendait 3 tiers quasi égaux malgré des valeurs 0.35/0.25/0.4 distinctes).
          <div style={{ display: "flex", flexDirection: "column", width: zoneW, height: h, marginRight: 9 }}>
            <div style={{ display: "flex", height: Math.round(h * 0.35), background: "#d44000" }} />
            <div style={{ display: "flex", height: Math.round(h * 0.25), background: "#2f9e44" }} />
            <div style={{ display: "flex", height: Math.round(h * 0.4), background: "#7ecb20" }} />
          </div>
        )}
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "flex", flex: 1 }}>
          <polyline points={line} fill="none" stroke="rgba(255,255,255,.85)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          {coords.map((c, i) => c && (
            <circle key={i} cx={c.x} cy={c.y} r={8} fill="#1c1c1c" stroke={fixedColor ?? colorFn?.(points[i] as number) ?? "#fff"} strokeWidth={4} />
          ))}
        </svg>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, marginLeft: showZones ? zoneW + 9 : 0 }}>
        {dates.map((d, i) => (
          <div key={i} style={{ display: "flex", fontSize: 12, fontWeight: fw(700), color: "rgba(255,255,255,.4)" }}>{dayLabel(d)}</div>
        ))}
      </div>
    </div>
  );
}

// Carte centrée, proportions proches de ShareView.tsx (maxWidth 460, radius 26) plutôt qu'étirée
// sur tout le canvas — le fond neutre #f1f0ee entoure la carte comme sur la vraie page /share/[id].
function Page({ children, cardWidth = 560 }: { children: React.ReactNode; cardWidth?: number }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f1f0ee", fontFamily: "DM Sans" }}>
      <div style={{ display: "flex", marginBottom: 18 }}><Logo /></div>
      <div style={{ display: "flex", width: cardWidth }}>{children}</div>
    </div>
  );
}

function Card({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{
      width: "100%", display: "flex", flexDirection: "column",
      padding: 30, borderRadius: 26, border: dark ? "1px solid rgba(255,255,255,.08)" : "1px solid rgba(0,0,0,.06)",
      background: dark ? "linear-gradient(145deg,#1a1a1a,#282828)" : "#ffffff",
      color: dark ? "#ffffff" : "#171b1f",
    }}>
      {children}
    </div>
  );
}

function AuthorFooter({ name, dark }: { name?: string; dark?: boolean }) {
  return (
    <div style={{ display: "flex", fontSize: 13, color: dark ? "rgba(255,255,255,.35)" : "#9a9ea1", marginTop: 18, justifyContent: "center", width: "100%" }}>
      Partagé par {name ?? "un membre ThePerfClub"}
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getShare(id);
  const fonts = await loadFonts();

  if (!row) {
    return new ImageResponse(
      (
        <Page>
          <Card dark>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "10px 0" }}>
              <div style={{ fontSize: 16, fontWeight: fw(900), letterSpacing: 2, color: ACCENT, display: "flex" }}>PARTAGE</div>
              <div style={{ fontSize: 34, fontWeight: fw(900), display: "flex" }}>ThePerfClub</div>
            </div>
          </Card>
        </Page>
      ),
      { ...size, fonts }
    );
  }

  const s = row.snapshot as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  if (row.resource_type === "session") {
    const exercises: string[] = Array.isArray(s.exercises) ? s.exercises : [];
    return new ImageResponse(
      (
        <Page cardWidth={600}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
              <div style={{ display: "flex", fontSize: 24, fontWeight: fw(900), letterSpacing: -1 }}>{s.name}</div>
              <div style={{ display: "flex", flexShrink: 0, fontSize: 12, fontWeight: fw(800), padding: "5px 12px", borderRadius: 999, background: s.done ? "rgba(47,158,68,.13)" : "rgba(212,64,0,.1)", color: s.done ? "#2f9e44" : "#d44000" }}>
                {s.done ? "Terminé" : "Prévu"}
              </div>
            </div>
            {s.difficulty != null && <div style={{ display: "flex", marginBottom: 16, width: "100%" }}><Gauge value={s.difficulty} /></div>}
            <ExerciseList exercises={exercises} />
            <AuthorFooter name={s.authorName} />
          </Card>
        </Page>
      ),
      { ...size, fonts }
    );
  }

  if (row.resource_type === "wellness" || row.resource_type === "coach_athlete") {
    const isCoach = row.resource_type === "coach_athlete";
    const behaviors: Behavior[] = Array.isArray(s.behaviors) ? s.behaviors.slice(0, 4) : [];
    const eyebrow = isCoach ? "COACH CONTROL" : "SCORE & CONSEILS";
    const heading = isCoach ? s.athleteName : s.zoneLabel;
    return new ImageResponse(
      (
        <Page cardWidth={600}>
          <Card dark>
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: isCoach ? 16 : 20 }}>
              <Ring score={s.score ?? null} />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: fw(900), letterSpacing: 2, color: "#ff8a55", display: "flex", marginBottom: 4 }}>{eyebrow}</div>
                <div style={{ fontSize: 25, fontWeight: fw(900), display: "flex", letterSpacing: -1 }}>{heading}</div>
                {behaviors.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
                    {behaviors.map((b, i) => <Chip key={i} b={b} />)}
                  </div>
                )}
              </div>
            </div>

            {!isCoach && (
              // Wrapper explicite (pas un Fragment) : satori a fait chevaucher les enfants d'un
              // Fragment multi-racines rendu à ce niveau (bug constaté à l'image, pas supposé) —
              // un vrai <div flexDirection:column> garantit l'empilement.
              <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                <div style={{ display: "flex", height: 1, background: "rgba(255,255,255,.08)", margin: "2px 0 16px" }} />
                <div style={{ display: "flex", fontSize: 12, fontWeight: fw(900), letterSpacing: 1, color: "#ff8a55", marginBottom: 10 }}>✨ CONSEILS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,.05)", borderRadius: 14, padding: "12px 14px" }}>
                    <div style={{ display: "flex", fontSize: 10, fontWeight: fw(900), letterSpacing: 1, color: "rgba(255,255,255,.6)", marginBottom: 4 }}>⚡ ENTRAÎNEMENT</div>
                    <div style={{ display: "flex", fontSize: 14, lineHeight: 1.4 }}>{(s.trainingAdvice ?? "").slice(0, 140)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,.05)", borderRadius: 14, padding: "12px 14px" }}>
                    <div style={{ display: "flex", fontSize: 10, fontWeight: fw(900), letterSpacing: 1, color: "rgba(255,255,255,.6)", marginBottom: 4 }}>🌿 RÉCUPÉRATION</div>
                    <div style={{ display: "flex", fontSize: 14, lineHeight: 1.4 }}>{(s.recoveryAdvice ?? "").slice(0, 140)}</div>
                  </div>
                </div>
              </div>
            )}

            {isCoach && (
              <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                <div style={{
                  display: "flex", borderRadius: 14, padding: "12px 14px", marginBottom: s.topSession ? 12 : 0,
                  background: s.isPriority ? "rgba(212,64,0,.16)" : "rgba(47,158,68,.14)",
                  border: `1px solid ${s.isPriority ? "rgba(212,64,0,.3)" : "rgba(47,158,68,.3)"}`,
                  fontSize: 14, lineHeight: 1.4, fontWeight: fw(650),
                }}>
                  {s.isPriority ? "⚠️" : "👌"} {(s.decision ?? "").slice(0, 140)}
                </div>
                {s.topSession && (
                  <div style={{ display: "flex", flexDirection: "column", background: "#fff", borderRadius: 14, padding: "12px 14px", color: "#171b1f" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ display: "flex", fontSize: 14, fontWeight: fw(800) }}>{s.topSession.name}</div>
                      <div style={{ display: "flex", fontSize: 11, fontWeight: fw(800), padding: "3px 10px", borderRadius: 999, background: s.topSession.done ? "rgba(47,158,68,.12)" : "rgba(212,64,0,.1)", color: s.topSession.done ? "#2f9e44" : "#d44000" }}>
                        {s.topSession.done ? "Terminé" : "Prévu"}
                      </div>
                    </div>
                    {s.topSession.difficulty != null && <div style={{ display: "flex", width: "100%", marginBottom: 8 }}><Gauge value={s.topSession.difficulty} height={9} /></div>}
                    {Array.isArray(s.topSession.exercises) && s.topSession.exercises.length > 0 && <ExerciseList exercises={s.topSession.exercises} max={3} />}
                  </div>
                )}
              </div>
            )}
            <AuthorFooter name={s.authorName} dark />
          </Card>
        </Page>
      ),
      { ...size, fonts }
    );
  }

  // charge / recuperation
  const isCharge = row.resource_type === "charge";
  const points: (number | null)[] = s.points ?? [];
  const dates: string[] = s.dates ?? [];
  const badges: Badge[] = Array.isArray(s.badges) ? s.badges : [];
  return new ImageResponse(
    (
      <Page cardWidth={640}>
        <Card dark>
          <div style={{ display: "flex", fontSize: 15, fontWeight: fw(900), letterSpacing: -0.3, marginBottom: 10 }}>
            {isCharge ? "⚡ Charge" : "🌿 Récupération"}
          </div>
          {badges.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {badges.map((b, i) => <MiniBadge key={i} b={b} />)}
            </div>
          )}
          <div style={{ display: "flex", fontSize: 14, color: "rgba(255,255,255,.75)", lineHeight: 1.4, marginBottom: 16 }}>{(s.insight ?? "").slice(0, 150)}</div>
          {isCharge
            ? <MiniChart points={points} dates={dates} colorFn={zoneColorFor} showZones maxVal={2} />
            : <MiniChart points={points} dates={dates} fixedColor={s.color ?? "#7fa8ea"} maxVal={100} />}
          <AuthorFooter name={s.authorName} dark />
        </Card>
      </Page>
    ),
    { ...size, fonts }
  );
}
