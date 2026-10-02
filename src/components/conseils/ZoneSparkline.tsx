"use client";

import { useState, useRef, useId } from "react";

/* Chart "Charge" façon WHOOP/TrainingPeaks (bandes de zone + ligne colorée par zone) — inspiré
   d'une capture partagée par Gildas. Pensé pour les 7 derniers jours glissants : c'est la fenêtre
   où le concept de "zone" (Récup/Optimal/Surcharge) reste lisible jour par jour.

   Trace l'ACWR (ratio 0–2), pas la charge en UA : les bandes Récup/Optimal/Surcharge n'ont de sens
   que sur un ratio (une journée à 842 UA n'est ni l'une ni l'autre dans l'absolu — c'est tout le
   sens de l'ACWR). Les UA du jour survolé sont dans le tooltip.

   Labels et points sont rendus en overlay HTML (position absolue en %, taille de police/rayon en
   px fixe) plutôt qu'en <text>/<circle> SVG à l'intérieur du viewBox : un <text> SVG scale avec
   la largeur rendue du SVG (unités viewBox), donc sur une carte desktop large, tout devenait
   visuellement "zoomé" hors de proportion avec le reste de la page — un plafond de largeur avait
   été essayé en pis-aller, mais l'objectif est une largeur pleine, donc il fallait s'attaquer à la
   vraie cause plutôt que contraindre la largeur. Seuls les éléments de fond (bandes de couleur,
   ligne de connexion) restent en SVG — un remplissage ou un trait qui s'étire ne "zoome" pas
   visuellement de la même façon qu'un texte ou un marqueur. */

const MONTH_FR = ["jan","fév","mar","avr","mai","juin","juil","aoû","sep","oct","nov","déc"];
const DAY_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
function dayLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return DAY_FR[d.getDay()];
}
function formatDateFr(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return `${DAY_FR[d.getDay()]} ${d.getDate()} ${MONTH_FR[d.getMonth()]}`;
}
/* Vue Mois (28j) : "Lun/Mar..." répété 4x ne donne aucun repère temporel (retour de Gildas,
   2026-08-16) — "S{n} {mois}" à la place (n = position parmi les labels affichés, jamais un numéro
   ISO de semaine réelle, plus simple à lire pour se situer dans les 4 dernières semaines). */
function weekMonthLabel(dateStr: string, weekNum: number) {
  const d = new Date(dateStr + "T12:00:00");
  const month = MONTH_FR[d.getMonth()];
  return `S${weekNum} ${month.charAt(0).toUpperCase()}${month.slice(1)}.`;
}

/* Bandes ACWR — seuils Gabbett et al. (la "sweet spot" 0.8–1.3 est la bande la plus citée dans la
   littérature sportive) : <0.8 sous-charge, 0.8–1.3 zone optimale, >1.3 risque accru. */
type Zone = { min: number; max: number; label: string; color: string };
const ZONES: Zone[] = [
  { min: 0,   max: 0.8,       label: "RÉCUP.",    color: "#7ecb20" },
  { min: 0.8, max: 1.3,       label: "OPTIMAL",   color: "#2f9e44" },
  { min: 1.3, max: Infinity,  label: "SURCHARGE", color: "#d44000" },
];
const DISPLAY_MAX = 2; // ratio au-delà duquel on plafonne visuellement (charge >> chronique)

function zoneFor(ratio: number): Zone {
  return ZONES.find(z => ratio < z.max) ?? ZONES[ZONES.length - 1];
}

const W = 400, PAD_L = 4, PAD_R = 10, PAD_TOP = 10, PAD_BOT = 22;

export default function ZoneSparkline({ points, dates, loads, monotony, strain, hideDayLabels, weekLabels, height }: {
  points: (number | null)[]; dates: string[]; loads?: number[];
  /* Monotonie/Contrainte du jour survolé, en complément de l'ACWR déjà affiché — pour les
     sportifs/coachs qui veulent le détail complet du tooltip, pas juste le résumé en badge. */
  monotony?: (number | null)[]; strain?: (number | null)[];
  /* Masque les labels de jour en bas (Lun/Mar/...) — réservé aux previews illustratives qui
     veulent simplifier le chart. `false` par défaut : zéro impact sur /conseils. */
  hideDayLabels?: boolean;
  /* Vue Mois (28j, toggle Sem./Mois sur /conseils et /coach/athletes) : "S{n} {mois}" au lieu de
     "Lun/Mar/..." — un jour de la semaine répété 4x ne donne aucun repère pour se situer dans le
     mois. `false` par défaut : zéro impact sur les appelants existants (vue Sem. inchangée). */
  weekLabels?: boolean;
  /* Hauteur du viewBox (défaut 168, la valeur réelle de /conseils) — réservé aux previews
     illustratives qui veulent un chart plus compact. Tout le reste (bandes de zone, points,
     labels) est déjà positionné en % de cette hauteur, donc se redimensionne proprement. */
  height?: number;
}) {
  const H = height ?? 168;
  const [hover, setHover] = useState<{ idx: number; xPx: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const n = points.length;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_TOP - PAD_BOT;
  const toX = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const toY = (v: number) => {
    const clamped = Math.max(0, Math.min(DISPLAY_MAX, v));
    return PAD_TOP + (1 - clamped / DISPLAY_MAX) * plotH;
  };
  const toXPct = (i: number) => (toX(i) / W) * 100;
  const toYPct = (v: number) => (toY(v) / H) * 100;

  const known = points
    .map((v, i) => (v !== null ? { i, v } : null))
    .filter((p): p is { i: number; v: number } => p !== null);

  /* Segments CONTIGUS (2026-09-26) — avant, `known` était joint en UNE seule polyline, donc un jour
     sans ACWR (historique insuffisant) était silencieusement relié en ligne droite par-dessus le
     vide. Tant qu'il y avait une pastille par jour, l'absence de point se voyait quand même ; en
     passant à une ligne colorée sans pastille par jour (voir plus bas), le trou serait devenu
     invisible et aurait ressemblé à de la donnée continue. Même découpage que SparkLineClient. */
  const segments: { i: number; v: number }[][] = [];
  for (const p of known) {
    const last = segments[segments.length - 1];
    if (last && p.i === last[last.length - 1].i + 1) last.push(p);
    else segments.push([p]);
  }
  const segPoints = (seg: { i: number; v: number }[]) =>
    seg.map(p => `${toX(p.i).toFixed(1)},${toY(p.v).toFixed(1)}`).join(" ");

  /* Dégradé vertical de zone (2026-09-26, retour de Gildas — "une simple ligne avec la couleur qui
     change selon la zone" plutôt qu'une ligne blanche + une pastille colorée par jour). Un dégradé
     en `userSpaceOnUse` le long de l'axe Y, avec des stops NETS aux frontières de zone, plutôt que
     de découper le tracé segment par segment : colorer chaque segment selon son point de départ
     donnerait une couleur fausse sur un segment qui traverse 0.8 ou 1.3, alors qu'ici la couleur
     change exactement là où la ligne franchit la frontière. `useId` : plusieurs charts peuvent
     cohabiter sur une même page, un id fixe les ferait partager le même dégradé. */
  // `useId()` renvoie un id contenant des `:` (ex. `:r1:`) — retirés ici : une référence
  // `url(#...)` dans un attribut SVG les tolère mal selon les navigateurs.
  const gradId = `acwr-zone-grad-${useId().replace(/:/g, "")}`;
  const offsetFor = (v: number) => 1 - Math.max(0, Math.min(DISPLAY_MAX, v)) / DISPLAY_MAX;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(n - 1, Math.round(xRatio * (n - 1))));
    setHover({ idx, xPx: e.clientX - rect.left });
  };

  const hIdx = hover?.idx ?? null;
  const hVal = hIdx !== null ? points[hIdx] : null;
  const hLoad = hIdx !== null && loads ? loads[hIdx] : null;
  const hMonotony = hIdx !== null && monotony ? monotony[hIdx] : null;
  const hStrain = hIdx !== null && strain ? strain[hIdx] : null;
  const hDate = hIdx !== null ? dates[hIdx] : null;
  const hZone = hVal !== null ? zoneFor(hVal) : null;

  // Les seuls points qui gardent une pastille — voir le commentaire au rendu de l'overlay.
  const markerIdx = new Set<number>();
  if (known.length) markerIdx.add(known[known.length - 1].i);
  if (hIdx !== null && points[hIdx] !== null) markerIdx.add(hIdx);
  for (const seg of segments) if (seg.length === 1) markerIdx.add(seg[0].i);

  const wrapWidth = wrapRef.current?.offsetWidth ?? 300;
  const hXPct = hover ? (hover.xPx / wrapWidth) * 100 : 0;
  // Ancré près du POINT survolé (2026-09-25, retour de Gildas — "je le vois pas il est derrière en
  // haut, il faudrait qu'il soit proche des points") : l'ancien `bottom: calc(100% + 8px)` plaçait
  // le tooltip tout en haut du WRAPPER entier (hauteur H=168 pleine), donc loin du point réel et
  // potentiellement chevauchant le contenu au-dessus de la carte (RangeToggle/badges) — jamais
  // repositionné selon la valeur survolée. `top: {hYPct}%` (position Y réelle du point sur le
  // chart) + `translateY(calc(-100% - 8px))` le fait flotter juste au-dessus du point lui-même,
  // toujours dans les bornes verticales du chart pour l'immense majorité des valeurs.
  const hYPct = hVal !== null ? toYPct(hVal) : 40;
  const tooltipStyle: React.CSSProperties = {
    position: "absolute",
    top: `${hYPct}%`,
    pointerEvents: "none",
    zIndex: 20,
    background: "rgba(18,18,18,0.92)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.13)",
    borderRadius: 12,
    padding: "7px 12px",
    whiteSpace: "nowrap",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    ...(hXPct < 25
      ? { left: 0, transform: "translateY(calc(-100% - 8px))" }
      : hXPct > 75
      ? { right: 0, transform: "translateY(calc(-100% - 8px))" }
      : { left: `${hXPct}%`, transform: "translate(-50%, calc(-100% - 8px))" }),
  };

  // Décimation des labels de jour si beaucoup de points (évite le chevauchement) — toujours le
  // premier et le dernier, un point tous les `labelStep` entre les deux.
  const labelStep = n > 10 ? Math.ceil(n / 7) : 1;

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
    >
      {hover && hDate && (
        <div style={tooltipStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginBottom: 3 }}>
            {formatDateFr(hDate)}
          </div>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 13, fontWeight: 700, color: hZone?.color ?? "#8a8f94" }}>
            {hVal !== null && hZone ? `⚡ ACWR ${hVal.toFixed(2)} · ${hZone.label}` : "— Historique insuffisant"}
          </div>
          {hLoad !== null && (
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              {hLoad > 0 ? `${hLoad} UA` : "🛌 Repos"}
            </div>
          )}
          {(hMonotony !== null || hStrain !== null) && (
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
              {[
                hMonotony !== null ? `Monotonie ${hMonotony.toFixed(2)}` : null,
                hStrain !== null ? `Contrainte ${hStrain} UA` : null,
              ].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", aspectRatio: `${W} / ${H}`, display: "block", cursor: "crosshair" }}
        preserveAspectRatio="none"
      >
        {/* Bandes de zone (fond + barre de couleur — pas de texte ici) */}
        {ZONES.map((z, idx) => {
          const yTop = toY(Math.min(z.max, DISPLAY_MAX));
          const yBot = toY(z.min);
          return (
            <g key={z.label}>
              {idx === 1 && <rect x={PAD_L} y={yTop} width={plotW} height={yBot - yTop} fill="rgba(255,255,255,.05)" />}
              <rect x={0} y={yTop} width={3} height={Math.max(0, yBot - yTop)} fill={z.color} />
            </g>
          );
        })}

        <defs>
          <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={0} y1={toY(DISPLAY_MAX)} x2={0} y2={toY(0)}>
            {/* Du haut (surcharge) vers le bas (récup.) : 2 stops par zone à la même couleur, donc
                une transition franche à chaque frontière au lieu d'un fondu. */}
            {[...ZONES].reverse().flatMap(z => [
              <stop key={`${z.label}-from`} offset={offsetFor(Math.min(z.max, DISPLAY_MAX))} stopColor={z.color} />,
              <stop key={`${z.label}-to`} offset={offsetFor(z.min)} stopColor={z.color} />,
            ])}
          </linearGradient>
        </defs>

        {/* Ligne reliant les points — colorée par zone (dégradé ci-dessus), angles arrondis
            (strokeLinejoin/Linecap) plutôt qu'anguleux : ça n'arrondit QUE les sommets, ça ne
            déplace aucune valeur. Volontairement pas un lissage en courbe : une spline classique
            dépasse les points réels, elle pourrait dessiner la ligne dans la bande SURCHARGE un
            jour où l'ACWR n'y est jamais monté — une lecture fausse créée par du cosmétique. */}
        {segments.map((seg, si) => seg.length > 1 && (
          <polyline
            key={`seg-${si}`}
            points={segPoints(seg)}
            fill="none" stroke={`url(#${gradId})`} strokeWidth={2.5}
            strokeLinecap="round" strokeLinejoin="round"
          />
        ))}

        {/* Curseur vertical au survol */}
        {hIdx !== null && (
          <line x1={toX(hIdx).toFixed(1)} y1={0} x2={toX(hIdx).toFixed(1)} y2={H - PAD_BOT} stroke="rgba(255,255,255,0.22)" strokeWidth={1} strokeDasharray="3,3" />
        )}
      </svg>

      {/* Overlay HTML : labels de zone, points, labels de jour — taille fixe en px, jamais liée à
          la largeur rendue du SVG. */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {ZONES.map(z => (
          <div key={z.label} style={{
            position: "absolute", left: 8, top: `${toYPct(Math.min(z.max, DISPLAY_MAX))}%`,
            transform: "translateY(2px)",
            fontFamily: "var(--font-mono), monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: z.color,
          }}>
            {z.label}
          </div>
        ))}

        {/* Plus une pastille par jour (2026-09-26) : la couleur de zone vit désormais dans la ligne
            elle-même, 7 à 90 pastilles par-dessus la rendaient illisible. Il reste 3 marqueurs, les
            mêmes que SparkLineClient : le DERNIER point connu (où s'arrête la série), le point
            SURVOLÉ (savoir quelle valeur on lit — le survol ne dépend pas des pastilles, c'est un
            onMouseMove sur le wrapper, donc les retirer ne coûte aucune interaction), et tout point
            ISOLÉ entre deux trous (une polyline à un seul point ne dessine rien, il disparaîtrait). */}
        {known.filter(({ i }) => markerIdx.has(i)).map(({ i, v }) => {
          const z = zoneFor(v);
          const isHovered = hIdx === i;
          const size = isHovered ? 14 : 11;
          return (
            <div key={i} style={{
              position: "absolute",
              left: `calc(${toXPct(i)}% - ${size / 2}px)`, top: `calc(${toYPct(v)}% - ${size / 2}px)`,
              width: size, height: size, borderRadius: "50%",
              background: "#1c1c1c", border: `${isHovered ? 3 : 2.5}px solid ${z.color}`,
              transition: "width .1s, height .1s",
            }} />
          );
        })}

        {!hideDayLabels && (() => {
          const shownIdx = dates.map((_, i) => i).filter(i => i % labelStep === 0 || i === n - 1);
          return shownIdx.map((i, shownI) => {
            const d = dates[i];
            const anchor = i === 0 ? "left" : i === n - 1 ? "right" : "center";
            const xPct = toXPct(i);
            return (
              <div key={d} style={{
                position: "absolute", bottom: 0,
                ...(anchor === "left" ? { left: `${xPct}%` } : anchor === "right" ? { right: `${100 - xPct}%` } : { left: `${xPct}%`, transform: "translateX(-50%)" }),
                fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.4)", whiteSpace: "nowrap" as const,
              }}>
                {weekLabels ? weekMonthLabel(d, shownI + 1) : dayLabel(d)}
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
