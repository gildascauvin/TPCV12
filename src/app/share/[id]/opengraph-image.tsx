import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import { getShare } from "./shareMeta";
import { wellnessColor, WELLNESS_RAMP } from "@/lib/wellness";
import DiffGauge from "@/components/calendar/DiffGauge";
import { ShareRing, ShareChip, ShareExerciseList, type ShareBehavior } from "./ShareCardParts";

/* Image OG dynamique par partage — sans ça, WhatsApp n'affiche souvent AUCUNE carte de preview.
   v5 (2026-08-16, suite) : suite à une discussion avec Gildas (relayant une critique de ChatGPT sur
   l'architecture "2 copies qui divergent") — décision explicite de rester sur satori (pas de
   Chromium headless, trop lourd/lent pour ce cas d'usage, voir CLAUDE.md pour le détail de
   l'arbitrage), mais d'extraire les pièces assez simples pour être réellement partagées entre
   ShareView.tsx (rendu navigateur) et cette route (rendu satori) — voir ShareCardParts.tsx et
   l'import direct de DiffGauge ci-dessus. Seuls Card/Page (dimensions différentes par nature :
   canvas 1200×630 fixe vs colonne ~460px CSS, pas de box-shadow satori) et le mini-graphe
   Charge/Récupération (interactif dans la vraie app, hooks — ne peut pas tourner dans satori)
   restent hand-portés séparément ici, par nécessité technique et non par oubli.
   Carte élargie (v5) et espaces réduits — retour explicite de Gildas ("réduis fortement les
   espaces blancs... agrandis le contenu") après un round où la carte ne prenait qu'environ la
   moitié du canvas. */

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#d44000";
const DAY_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
type Badge = { key: string; label: string; color: string };

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return DAY_FR[d.getDay()];
}

// DM Sans n'a que 500/700/900 de chargés — round vers le poids dispo le plus proche plutôt que de
// laisser satori retomber sur une police système pour un poids non fourni (ex. 650, 800, 1000 —
// notamment utilisé par ShareRing, importé tel quel de ShareView.tsx).
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

// Mêmes couleurs/radius que ZoneBadge.tsx (version statique, sans le tooltip au tap — inutile sur
// une image figée ; ZoneBadge lui-même a des hooks, ne peut pas être partagé tel quel).
function MiniBadge({ b }: { b: Badge }) {
  return (
    <div style={{
      display: "flex", fontSize: 16, fontWeight: fw(900), color: b.color, background: `${b.color}22`,
      border: `1px solid ${b.color}44`, borderRadius: 999, padding: "6px 16px", letterSpacing: 1, textTransform: "uppercase",
    }}>
      {b.label}
    </div>
  );
}

// Miroir des seuils réels (charge : ZoneSparkline.tsx DISPLAY_MAX=2 ; récupération : FORM_ZONES de
// SparkLineClient.tsx) — ces 2 fichiers sont "use client" (hooks), pas importables dans cette route
// Node. `min` ajouté (absent de l'original ZONES) pour dériver les bandes via la même fonction toY
// que le tracé lui-même, plutôt qu'une proportion approximative codée en dur.
const CHARGE_ZONES = [
  { min: 0, max: 0.8, color: "#7ecb20" },
  { min: 0.8, max: 1.3, color: "#2f9e44" },
  { min: 1.3, max: Infinity, color: "#d44000" },
];
const FORM_ZONES_MIRROR = [
  { min: 0, max: 42, color: "#d10000" },
  { min: 42, max: 58, color: "#8a8f94" },
  { min: 58, max: 101, color: "#2f9e44" },
];
function zoneColorFor(v: number) { return (CHARGE_ZONES.find(z => v < z.max) ?? CHARGE_ZONES[2]).color; }
function formZoneColorFor(v: number) { return (FORM_ZONES_MIRROR.find(z => v < z.max) ?? FORM_ZONES_MIRROR[2]).color; }

/* Bandes de zone (haut→bas = valeur décroissante, même sens que l'axe Y du chart) — hauteurs
   dérivées de la même fonction toY que le tracé, pas une proportion approximative : chaque bande
   correspond exactement à sa vraie plage sur l'échelle 0..maxVal. */
function ZoneBands({ zones, toY, maxVal, h }: { zones: { min: number; max: number; color: string }[]; toY: (v: number) => number; maxVal: number; h: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 8, height: h }}>
      {zones.slice().reverse().map(z => {
        const yTop = toY(Math.min(z.max, maxVal));
        const yBot = toY(z.min);
        return <div key={z.color} style={{ display: "flex", height: Math.max(0, yBot - yTop), background: z.color }} />;
      })}
    </div>
  );
}

/* Chart Charge/Récupération — hand-porté depuis ZoneSparkline.tsx/SparkLineClient.tsx (interactifs,
   hooks, ne peuvent pas tourner dans satori), pas une reproduction pixel-exacte de leur
   interactivité (tooltip, décimation, animation), mais fidèle à leur logique de rendu statique :
   échelle Y fixe (0..maxVal, pas d'auto-fit sur la plage des données — voir bug corrigé en v4),
   bandes de zone dérivées de toY (voir ZoneBands), et pour la récupération : aire remplie en
   dégradé séquentiel bleu (WELLNESS_RAMP, même direction bas→haut que le <linearGradient> réel) +
   ligne pointillée Forme (points2) avec marqueurs colorés par zone — les 2 pièces manquantes
   signalées par Gildas sur la v4 (chart plat, sans aire ni ligne Forme). */
function MiniChart({ points, dates, colorFn, maxVal, h = 250, showZones, sequentialFill, points2, zones2FormColorFn }: {
  points: (number | null)[]; dates: string[]; colorFn: (v: number) => string; maxVal: number; h?: number;
  showZones?: boolean; sequentialFill?: boolean; points2?: (number | null)[]; zones2FormColorFn?: (v: number) => string;
}) {
  const w = 900, pad = 14;
  const vals = points.filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const step = (w - pad * 2) / Math.max(1, points.length - 1);
  // Échelle FIXE (0..maxVal, clampée) — pas un auto-fit sur la plage des données, même convention
  // que les vrais composants (une semaine calme doit rester basse sur le graphe, pas être étirée).
  const toY = (v: number) => pad + (h - pad * 2) - (Math.max(0, Math.min(maxVal, v)) / maxVal) * (h - pad * 2);
  const coords = points.map((v, i) => v === null ? null : { x: pad + i * step, y: toY(v) });
  const known = coords.filter((c): c is { x: number; y: number } => c !== null);
  const line = known.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const baseline = h - pad;
  const fillD = known.length > 1
    ? `M ${known[0].x.toFixed(1)},${baseline} L ${known.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" L ")} L ${known[known.length - 1].x.toFixed(1)},${baseline} Z`
    : "";
  const coords2 = points2 ? points2.map((v, i) => v === null ? null : { x: pad + i * step, y: toY(v), v }) : [];
  const known2 = coords2.filter((c): c is { x: number; y: number; v: number } => c !== null);
  const line2 = known2.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const gutter = showZones || sequentialFill ? 8 + 12 : 0;
  const gradId = "og-recup-grad";
  return (
    <div style={{ display: "flex", width: "100%", flexDirection: "column" }}>
      <div style={{ display: "flex", width: "100%" }}>
        {showZones && <div style={{ display: "flex", marginRight: 12 }}><ZoneBands zones={CHARGE_ZONES} toY={toY} maxVal={maxVal} h={h} /></div>}
        {sequentialFill && (
          <div style={{
            display: "flex", width: 8, height: h, marginRight: 12, borderRadius: 4,
            background: `linear-gradient(to top, ${WELLNESS_RAMP.map(s => s.hex).join(",")})`,
          }} />
        )}
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "flex", flex: 1 }}>
          {sequentialFill && (
            <defs>
              <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
                {WELLNESS_RAMP.map(s => <stop key={s.stop} offset={`${s.stop * 100}%`} stopColor={s.hex} />)}
              </linearGradient>
            </defs>
          )}
          {fillD && <path d={fillD} fill={sequentialFill ? `url(#${gradId})` : "#7fa8ea"} fillOpacity={sequentialFill ? 0.32 : 0.16} />}
          <polyline points={line} fill="none" stroke={sequentialFill ? `url(#${gradId})` : "rgba(255,255,255,.85)"} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          {known2.length > 1 && (
            <polyline points={line2} fill="none" stroke="#9aa0a6" strokeWidth={3} strokeDasharray="11,8" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {coords.map((c, i) => c && (
            <circle key={i} cx={c.x} cy={c.y} r={8} fill="#1c1c1c" stroke={colorFn(points[i] as number)} strokeWidth={4} />
          ))}
          {zones2FormColorFn && coords2.map((c, i) => c && (
            <circle key={`f${i}`} cx={c.x} cy={c.y} r={7} fill="#1c1c1c" stroke={zones2FormColorFn(c.v)} strokeWidth={3} />
          ))}
        </svg>
        {sequentialFill && <div style={{ display: "flex", marginLeft: 12 }}><ZoneBands zones={FORM_ZONES_MIRROR} toY={toY} maxVal={100} h={h} /></div>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, marginLeft: gutter, marginRight: sequentialFill ? 8 + 12 : 0 }}>
        {dates.map((d, i) => (
          <div key={i} style={{ display: "flex", fontSize: 13, fontWeight: fw(700), color: "rgba(255,255,255,.4)" }}>{dayLabel(d)}</div>
        ))}
      </div>
    </div>
  );
}

// Carte élargie (v5) pour utiliser beaucoup plus du canvas 1200×630 — retour explicite de Gildas
// ("réduis fortement les espaces blancs autour de la card, agrandis le contenu"). Reste centrée
// avec une marge volontaire (pas étirée cadre à cadre — déjà essayé en v2, jugé "juste un résumé
// texte") mais la marge elle-même est maintenant modeste plutôt que la moitié du canvas.
function Page({ children, cardWidth = 1080 }: { children: React.ReactNode; cardWidth?: number }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f1f0ee", fontFamily: "DM Sans" }}>
      <div style={{ display: "flex", marginBottom: 14 }}><Logo /></div>
      <div style={{ display: "flex", width: cardWidth }}>{children}</div>
    </div>
  );
}

function Card({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{
      width: "100%", display: "flex", flexDirection: "column",
      padding: 36, borderRadius: 28, border: dark ? "1px solid rgba(255,255,255,.08)" : "1px solid rgba(0,0,0,.06)",
      background: dark ? "linear-gradient(145deg,#1a1a1a,#282828)" : "#ffffff",
      color: dark ? "#ffffff" : "#171b1f",
    }}>
      {children}
    </div>
  );
}

function AuthorFooter({ name, dark }: { name?: string; dark?: boolean }) {
  return (
    <div style={{ display: "flex", fontSize: 15, color: dark ? "rgba(255,255,255,.35)" : "#9a9ea1", marginTop: 20, justifyContent: "center", width: "100%" }}>
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
        <Page>
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 18 }}>
              <div style={{ display: "flex", fontSize: 34, fontWeight: fw(900), letterSpacing: -1 }}>{s.name}</div>
              <div style={{ display: "flex", flexShrink: 0, fontSize: 15, fontWeight: fw(800), padding: "7px 16px", borderRadius: 999, background: s.done ? "rgba(47,158,68,.13)" : "rgba(212,64,0,.1)", color: s.done ? "#2f9e44" : "#d44000" }}>
                {s.done ? "Terminé" : "Prévu"}
              </div>
            </div>
            {s.difficulty != null && <div style={{ display: "flex", marginBottom: 20, width: "100%" }}><DiffGauge value={s.difficulty} height={20} /></div>}
            <ShareExerciseList exercises={exercises} max={5} fontSize={20} rowPadding="16px 20px" />
            <AuthorFooter name={s.authorName} />
          </Card>
        </Page>
      ),
      { ...size, fonts }
    );
  }

  if (row.resource_type === "wellness" || row.resource_type === "coach_athlete") {
    const isCoach = row.resource_type === "coach_athlete";
    const behaviors: ShareBehavior[] = Array.isArray(s.behaviors) ? s.behaviors.slice(0, 4) : [];
    const eyebrow = isCoach ? "COACH CONTROL" : "SCORE & CONSEILS";
    const heading = isCoach ? s.athleteName : s.zoneLabel;
    return new ImageResponse(
      (
        <Page>
          <Card dark>
            <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: isCoach ? 14 : 24 }}>
              <ShareRing score={s.score ?? null} size={isCoach ? 130 : 160} />
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: fw(900), letterSpacing: 2, color: "#ff8a55", display: "flex", marginBottom: 5 }}>{eyebrow}</div>
                <div style={{ fontSize: 36, fontWeight: fw(900), display: "flex", letterSpacing: -1 }}>{heading}</div>
                {behaviors.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 11 }}>
                    {behaviors.map((b, i) => <ShareChip key={i} b={b} fontSize={17} padding="7px 16px" />)}
                  </div>
                )}
              </div>
            </div>

            {!isCoach && (
              <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                <div style={{ display: "flex", height: 1, background: "rgba(255,255,255,.08)", margin: "3px 0 18px" }} />
                <div style={{ display: "flex", fontSize: 15, fontWeight: fw(900), letterSpacing: 1, color: "#ff8a55", marginBottom: 12 }}>✨ CONSEILS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,.05)", borderRadius: 16, padding: "16px 20px" }}>
                    <div style={{ display: "flex", fontSize: 12, fontWeight: fw(900), letterSpacing: 1, color: "rgba(255,255,255,.6)", marginBottom: 5 }}>⚡ ENTRAÎNEMENT</div>
                    <div style={{ display: "flex", fontSize: 17, lineHeight: 1.4 }}>{(s.trainingAdvice ?? "").slice(0, 140)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,.05)", borderRadius: 16, padding: "16px 20px" }}>
                    <div style={{ display: "flex", fontSize: 12, fontWeight: fw(900), letterSpacing: 1, color: "rgba(255,255,255,.6)", marginBottom: 5 }}>🌿 RÉCUPÉRATION</div>
                    <div style={{ display: "flex", fontSize: 17, lineHeight: 1.4 }}>{(s.recoveryAdvice ?? "").slice(0, 140)}</div>
                  </div>
                </div>
              </div>
            )}

            {isCoach && (
              <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                <div style={{
                  display: "flex", borderRadius: 16, padding: "13px 18px", marginBottom: s.topSession ? 10 : 0,
                  background: s.isPriority ? "rgba(212,64,0,.16)" : "rgba(47,158,68,.14)",
                  border: `1px solid ${s.isPriority ? "rgba(212,64,0,.3)" : "rgba(47,158,68,.3)"}`,
                  fontSize: 16, lineHeight: 1.35, fontWeight: fw(650),
                }}>
                  {s.isPriority ? "⚠️" : "👌"} {(s.decision ?? "").slice(0, 140)}
                </div>
                {s.topSession && (
                  <div style={{ display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16, padding: "13px 18px", color: "#171b1f" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ display: "flex", fontSize: 17, fontWeight: fw(800) }}>{s.topSession.name}</div>
                      <div style={{ display: "flex", fontSize: 12, fontWeight: fw(800), padding: "3px 11px", borderRadius: 999, background: s.topSession.done ? "rgba(47,158,68,.12)" : "rgba(212,64,0,.1)", color: s.topSession.done ? "#2f9e44" : "#d44000" }}>
                        {s.topSession.done ? "Terminé" : "Prévu"}
                      </div>
                    </div>
                    {s.topSession.difficulty != null && <div style={{ display: "flex", width: "100%", marginBottom: 8 }}><DiffGauge value={s.topSession.difficulty} height={12} /></div>}
                    {Array.isArray(s.topSession.exercises) && s.topSession.exercises.length > 0 && <ShareExerciseList exercises={s.topSession.exercises} max={3} fontSize={15} rowPadding="9px 13px" />}
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

  if (row.resource_type === "signature") {
    // Remplace les 2 partages séparés Charge/Récupération par un seul lien combiné (insight croisé
    // global + les 2 charts, sans les badges d'indicateurs) — retour explicite de Gildas. Charts
    // côte à côte (canvas landscape) plutôt qu'empilés, mêmes proportions que la grille desktop de
    // AthleteSignatureBlock (isLg ? "1fr 1fr" : "1fr") sur /coach/athletes.
    const dates: string[] = s.dates ?? [];
    return new ImageResponse(
      (
        <Page>
          <Card dark>
            {s.insight && (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 7, background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 18, padding: "18px 22px", marginBottom: 24 }}>
                <div style={{ display: "flex", fontSize: 19 }}>{s.emoji}</div>
                {s.action && <div style={{ display: "flex", fontSize: 19, fontWeight: fw(900), textTransform: "uppercase", letterSpacing: 1, color: "#ff8a55" }}>{s.action} —</div>}
                <div style={{ display: "flex", fontSize: 19, color: "rgba(255,255,255,.9)", fontWeight: fw(650), lineHeight: 1.4 }}>{(s.insight ?? "").slice(0, 160)}</div>
              </div>
            )}
            <div style={{ display: "flex", width: "100%", gap: 28 }}>
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ display: "flex", fontSize: 15, fontWeight: fw(900), letterSpacing: 1, marginBottom: 10 }}>⚡ CHARGE</div>
                <MiniChart points={s.chargePoints ?? []} dates={dates} colorFn={zoneColorFor} maxVal={2} showZones h={230} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ display: "flex", fontSize: 15, fontWeight: fw(900), letterSpacing: 1, marginBottom: 10 }}>🌿 RÉCUPÉRATION</div>
                <MiniChart points={s.recoveryPoints ?? []} dates={dates} colorFn={v => wellnessColor(v)} maxVal={100} sequentialFill points2={s.recoveryPoints2} zones2FormColorFn={formZoneColorFor} h={230} />
              </div>
            </div>
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
      <Page>
        <Card dark>
          <div style={{ display: "flex", fontSize: 18, fontWeight: fw(900), letterSpacing: -0.3, marginBottom: 12 }}>
            {isCharge ? "⚡ Charge" : "🌿 Récupération"}
          </div>
          {badges.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {badges.map((b, i) => <MiniBadge key={i} b={b} />)}
            </div>
          )}
          <div style={{ display: "flex", fontSize: 17, color: "rgba(255,255,255,.75)", lineHeight: 1.4, marginBottom: 20 }}>{(s.insight ?? "").slice(0, 150)}</div>
          {isCharge
            ? <MiniChart points={points} dates={dates} colorFn={zoneColorFor} maxVal={2} showZones />
            : <MiniChart points={points} dates={dates} colorFn={v => wellnessColor(v)} maxVal={100} sequentialFill points2={s.points2} zones2FormColorFn={formZoneColorFor} />}
          <AuthorFooter name={s.authorName} dark />
        </Card>
      </Page>
    ),
    { ...size, fonts }
  );
}
