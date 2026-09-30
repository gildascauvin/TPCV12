/* Cartes d'indice de l'Accueil (2026-09-28) — portage du POC `charge-variantes.html`, variante E1,
   validée par Gildas après comparaison avec E2 (l'impact en gros) et E3 (une ligne par indice).
   Inspirations : WHOOP (une section, un insight, des sous-indicateurs), Garmin (jauge à seuil),
   Withings (une carte par indice, aperçu intégré, détail au clic).

   Contrat d'information, posé une fois et valable pour toutes les cartes :
     — à GAUCHE  : le titre, la tendance chiffrée, puis l'IMPACT de cette tendance ;
     — à DROITE  : l'aperçu, le statut, et la valeur précise en dessous.
   Le statut ne vit JAMAIS à gauche : l'y remettre recréait la répétition que Gildas a repérée
   ("j'ai peur que ça répète"), puisque l'insight décrivait alors la même zone que le statut.

   Ce module ne contient que de la logique pure et testable. Aucune zone, aucun seuil n'est inventé
   ici : les couleurs et les libellés viennent de sigDimInfo() (fatigueSignature.ts) et de
   WELLNESS_RAMP (wellness.ts), qui restent les sources uniques. */

import { sigDimInfo, severityOf, type DayPoint, type Severity } from "@/lib/fatigueSignature";
import { WELLNESS_RAMP, wellnessColor } from "@/lib/wellness";
/* Import de TYPE seulement : effacé à la compilation, donc aucun cycle à l'exécution avec
   conseilsData.ts (qui, lui, n'importe rien d'ici — vérifié). */
import type { ConseilsData } from "@/lib/conseilsData";
import { DIMENSION_LABELS, Z_SWC } from "@/lib/wellnessBaseline";
import type { DimensionKey, Perspective, WellnessBaselineResult } from "@/lib/wellnessBaseline";

export type MetricKey = "load" | "acwr" | "strain" | "monotony" | "recovery" | "form" | "fitness" | "fatigue";
export type MetricGroup = "charge" | "recup";
export type TrendDir = "up" | "down" | "flat";

export const METRIC_GROUPS: Record<MetricGroup, MetricKey[]> = {
  charge: ["load", "acwr", "strain", "monotony"],
  recup: ["recovery", "form", "fitness", "fatigue"],
};

export const TREND_ARROW: Record<TrendDir, string> = { up: "↗", down: "↘", flat: "→" };

/* Zone morte de ±10 % autour de la séance moyenne des 4 dernières semaines — la MÊME que celle qui
   colore les barres du chart de charge, pour que le mot et la couleur ne puissent pas diverger. */
export const SESSION_DEAD_ZONE = 0.1;

export type ZoneBand = { from: number; to: number; color: string; label: string };
export type ChartKind = "bars" | "dots" | "line" | "area";

export type MetricMeta = {
  key: MetricKey;
  label: string;
  group: MetricGroup;
  kind: ChartKind;
  /* Bornes de l'axe. `hi: null` = cadré sur la donnée (la charge en UA n'a pas de borne haute, ce
     qui est aussi pourquoi elle n'a ni bandes ni jauge ronde). */
  lo: number;
  hi: number | null;
  zones?: ZoneBand[];
  /* Les points sont reliés par un fil neutre (ACWR uniquement) : sur 7 jours le ratio bouge de
     quelques centièmes, la courbe seule suggère un mouvement continu et on ne sait plus où tombent
     les jours ; les points seuls perdent la continuité. */
  link?: boolean;
  fmt: (v: number) => string;
  /* Série lue dans DayPoint. `trendOn` permet à une carte de baser sa tendance sur une AUTRE série
     que sa valeur : la charge se lit en tendance sur sa moyenne 7 jours, sinon on comparerait la
     séance d'aujourd'hui à celle d'il y a 7 jours, dont l'une peut être un repos. */
  pick: (p: DayPoint) => number | null;
  trendOn?: (p: DayPoint) => number | null;
};

const zoneColor = (dim: Parameters<typeof sigDimInfo>[0], v: number) => sigDimInfo(dim, v).color;
const fr = (v: number, d = 2) => v.toFixed(d).replace(".", ",");

export const METRICS: Record<MetricKey, MetricMeta> = {
  load: {
    key: "load", label: "Charge", group: "charge", kind: "bars", lo: 0, hi: null,
    fmt: v => `${Math.round(v)} UA`,
    pick: p => p.load, trendOn: p => p.acute,
  },
  acwr: {
    key: "acwr", label: "ACWR", group: "charge", kind: "dots", link: true, lo: 0, hi: 2,
    fmt: v => fr(v),
    pick: p => p.acwr,
    zones: [
      { from: 1.3, to: 2, color: zoneColor("load", 1.7), label: "SURCHARGE" },
      { from: 0.8, to: 1.3, color: zoneColor("load", 1), label: "OPTIMAL" },
      { from: 0, to: 0.8, color: zoneColor("load", 0.5), label: "SOUS-CHARGE" },
    ],
  },
  strain: {
    key: "strain", label: "Contrainte", group: "charge", kind: "line", lo: 0, hi: 12000,
    fmt: v => `${Math.round(v).toLocaleString("fr-FR")} UA`,
    pick: p => p.strain,
    zones: [
      { from: 10000, to: 12000, color: zoneColor("strain", 11000), label: "BLESSURE" },
      { from: 6000, to: 10000, color: zoneColor("strain", 8000), label: "FATIGUE" },
      { from: 0, to: 6000, color: zoneColor("strain", 3000), label: "OK" },
    ],
  },
  monotony: {
    key: "monotony", label: "Monotonie", group: "charge", kind: "line", lo: 0, hi: 3,
    fmt: v => fr(v),
    pick: p => p.monotony,
    zones: [
      { from: 2.5, to: 3, color: zoneColor("monotony", 2.8), label: "CRITIQUE" },
      { from: 2, to: 2.5, color: zoneColor("monotony", 2.2), label: "ÉLEVÉE" },
      { from: 0, to: 2, color: zoneColor("monotony", 1.2), label: "VARIÉE" },
    ],
  },
  recovery: {
    key: "recovery", label: "Récupération", group: "recup", kind: "area", lo: 0, hi: 100,
    fmt: v => `${Math.round(v)}/100`,
    pick: p => p.recovery,
    /* Mêmes bornes 42/58 que relativeZoneLabel() : Φ(±Z_SWC)×100 ≈ 42/58, et FORM_ZONES coupe
       exactement là aussi (±8 %), les deux échelles coïncident. */
    zones: [
      { from: 58, to: 100, color: WELLNESS_RAMP[WELLNESS_RAMP.length - 1].hex, label: "FRAIS" },
      { from: 42, to: 58, color: WELLNESS_RAMP[2].hex, label: "ÉQUILIBRÉ" },
      { from: 0, to: 42, color: WELLNESS_RAMP[0].hex, label: "FATIGUÉ" },
    ],
  },
  form: {
    key: "form", label: "Forme", group: "recup", kind: "line", lo: -50, hi: 50,
    fmt: v => `${v > 0 ? "+" : ""}${Math.round(v)} %`,
    pick: p => p.form,
    /* Bleu, pas le vert/gris/rouge de sigDimInfo("form") : tout l'onglet Récupération est sur la
       rampe séquentielle bleue (ring, chart, aperçus), la Forme y comprise — ce sont exactement les
       bornes et les couleurs de FORM_ZONES en prod. */
    zones: [
      { from: 8, to: 50, color: WELLNESS_RAMP[WELLNESS_RAMP.length - 1].hex, label: "FRAIS" },
      { from: -8, to: 8, color: WELLNESS_RAMP[2].hex, label: "ÉQUILIBRÉ" },
      { from: -50, to: -8, color: WELLNESS_RAMP[0].hex, label: "FATIGUÉ" },
    ],
  },
  fitness: {
    key: "fitness", label: "Fitness", group: "recup", kind: "line", lo: 0, hi: null,
    fmt: v => `${Math.round(v)} UA`, pick: p => p.fitness,
  },
  fatigue: {
    key: "fatigue", label: "Fatigue", group: "recup", kind: "line", lo: 0, hi: null,
    fmt: v => `${Math.round(v)} UA`, pick: p => p.fatigue,
  },
};

export function seriesOf(key: MetricKey, series: DayPoint[]): (number | null)[] {
  return series.map(METRICS[key].pick);
}
export function lastOf(key: MetricKey, series: DayPoint[]): number | null {
  const a = seriesOf(key, series).filter((v): v is number => v !== null);
  return a.length ? a[a.length - 1] : null;
}

/* "330 UA" ne parle à personne : le même chiffre rapporté à MA séance moyenne des 4 dernières
   semaines se dit en un mot, et on reprend le vocabulaire déjà en prod pour le RPE
   (qualitativeDifficulty : légère / modérée / dure) plutôt que d'en inventer un second.
   Nuance que porte l'insight de la carte : "Dure" veut dire plus dure que MON habitude, pas dure
   dans l'absolu — deux sportifs avec la même séance ne liront pas le même mot. */
export function sessionQualifier(load: number | null, ref: number | null): { label: string; pct: number | null } {
  if (!load || load <= 0) return { label: "Repos", pct: null };
  if (!ref) return { label: "Séance", pct: null };
  const pct = Math.round((load / ref - 1) * 100);
  if (pct > SESSION_DEAD_ZONE * 100) return { label: "Dure", pct };
  if (pct < -SESSION_DEAD_ZONE * 100) return { label: "Légère", pct };
  return { label: "Modérée", pct };
}

/* Séance moyenne des 4 dernières semaines, en ne comptant que les jours AVEC séance — la chronique
   (qui inclut les jours de repos) ferait lire "plus dure que d'habitude" à presque toutes les
   séances d'un sportif qui s'entraîne 4 jours sur 7. */
export function sessionReference(series: DayPoint[]): number | null {
  const done = series.slice(-28).map(p => p.load).filter(v => v > 0);
  return done.length ? done.reduce((a, b) => a + b, 0) / done.length : null;
}

export type MetricTrend = { dir: TrendDir; text: string; showsValue: boolean };

/* Deux formulations, selon ce qui a du sens. Un % d'évolution là où le rapport entre deux valeurs
   en a un ; un "de X à Y" là où il n'en a pas — la forme est DÉJÀ un pourcentage (un % de % ne se
   lit pas). Le score de récupération est un PERCENTILE : une baisse "de 43 %" n'y veut rien dire,
   on donne l'écart du jour à la moyenne de la période, qui est la même logique relative que le
   score lui-même. `showsValue` signale que la formulation se termine déjà sur la valeur du jour,
   pour que la colonne de droite ne la répète pas. */
export function trendFor(key: MetricKey, series: DayPoint[], days: number, override?: (number | null)[]): MetricTrend {
  const meta = METRICS[key];
  /* `override` : la récupération se lit sur le score RELATIF (percentile du z-score), pas sur le
     score brut de DayPoint — sinon la tendance porterait sur une autre échelle que la valeur et les
     zones affichées. */
  const raw = (override ?? series.map(meta.trendOn ?? meta.pick)).filter((v): v is number => v !== null);
  if (raw.length < 2) return { dir: "flat", text: "pas assez d'historique", showsValue: false };
  const first = raw[0], last = raw[raw.length - 1];
  const rel = first === 0 ? 0 : ((last - first) / Math.abs(first)) * 100;
  const dir: TrendDir = rel > 5 ? "up" : rel < -5 ? "down" : "flat";

  if (key === "recovery") {
    const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
    const pct = mean ? Math.round(((last - mean) / mean) * 100) : 0;
    return {
      dir: pct > 5 ? "up" : pct < -5 ? "down" : "flat",
      text: `${pct > 0 ? "+" : ""}${pct} % vs ma moyenne ${days} j`,
      showsValue: false,
    };
  }
  if (key === "form") {
    /* "depuis X" et non "de X à Y" : la valeur du jour est maintenant sur la ligne principale de la
       carte, la répéter en fin de tendance en ferait le seul indice à l'afficher deux fois. */
    const f = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} %`;
    return {
      dir,
      text: first === last ? `stable à ${f(last)} sur ${days} j` : `depuis ${f(first)} sur ${days} j`,
      showsValue: false,
    };
  }
  const suffix = meta.trendOn ? ` (moy. 7 j) sur ${days} j` : ` sur ${days} j`;
  const pct = Math.round(rel);
  return { dir, text: `${pct > 0 ? "+" : ""}${pct} %${suffix}`, showsValue: false };
}

/* Un insight sur CHAQUE carte, y compris quand tout va bien — "c'est la pédagogie" (Gildas). Une
   première version se taisait sur les indices verts et stables, ce qui privait justement des
   explications les plus utiles à quelqu'un qui découvre ces indicateurs.
   Trois registres : l'indice décroche → son texte porte déjà l'action ; il va bien mais bouge → ce
   que le mouvement implique ; il va bien et ne bouge pas → ce que l'indicateur MESURE, et pourquoi
   sa stabilité est une bonne nouvelle. */
type Voiced = { a: string; c: string };   // a = sportif (2e personne), c = coach (à propos de lui)
const MOVE_TEXT: Partial<Record<MetricKey, Partial<Record<TrendDir, Voiced>>>> = {
  /* Ces trois textes doivent parler du VOLUME, pas de la séance du jour (2026-09-28, incohérence
     trouvée par Gildas : "Ton volume hebdomadaire est stable" sur 7 j et "Séance plus légère que ton
     habitude" sur 28 j). La raison est structurelle : l'insight commente la TENDANCE, et la tendance
     de cette carte porte sur la moyenne 7 jours — pas sur la séance. Mélanger les deux sujets
     faisait changer de registre d'un onglet de période à l'autre, et pouvait contredire le statut,
     calculé lui sur la séance du jour ("Dure · 520 UA" au-dessus de "Séance plus légère…").
     La lecture de la séance reste sur la ligne principale, où elle est à sa place. */
  load: {
    up: { a: "Ton volume hebdomadaire monte : surveille ta récupération si ça continue.",
          c: "Son volume hebdomadaire monte : surveille sa récupération si ça continue." },
    down: { a: "Ton volume hebdomadaire baisse : tu as de la marge pour recharger.",
            c: "Son volume hebdomadaire baisse : il a de la marge pour recharger." },
    flat: { a: "Ton volume hebdomadaire est stable : c'est cette régularité qui construit la condition de fond.",
            c: "Son volume hebdomadaire est stable : c'est cette régularité qui construit la condition de fond." },
  },
  acwr: {
    up: { a: "Ta charge remonte vers ta base : tu peux suivre le volume prévu.",
          c: "Sa charge remonte vers sa base : le volume prévu reste adapté." },
    down: { a: "Ta charge redescend sous ta base : attention à ne pas perdre le rythme si ça dure.",
            c: "Sa charge redescend sous sa base : attention à la perte de rythme si ça dure." },
    flat: { a: "Ta charge récente suit ta base : tu progresses sans t'exposer.",
            c: "Sa charge récente suit sa base : il progresse sans s'exposer." },
  },
  strain: {
    up: { a: "La contrainte monte mais reste sous le seuil : garde un œil dessus.",
          c: "La contrainte monte mais reste sous le seuil : à garder à l'œil." },
    down: { a: "La contrainte redescend : ta semaine redevient plus soutenable.",
            c: "La contrainte redescend : sa semaine redevient plus soutenable." },
    flat: { a: "Ta semaine reste tenable : ton volume et ta variété s'équilibrent.",
            c: "Sa semaine reste tenable : son volume et sa variété s'équilibrent." },
  },
  monotony: {
    up: { a: "Tes journées se ressemblent un peu plus qu'avant : garde au moins un jour franchement différent.",
          c: "Ses journées se ressemblent un peu plus qu'avant : garde-lui au moins un jour franchement différent." },
    down: { a: "Tes journées se contrastent davantage : c'est le bon sens.",
            c: "Ses journées se contrastent davantage : c'est le bon sens." },
    flat: { a: "Tes alternances dur/facile font leur travail : rien à corriger de ce côté.",
            c: "Ses alternances dur/facile font leur travail : rien à corriger de ce côté." },
  },
  recovery: {
    up: { a: "Ta récupération remonte : c'est le moment de placer une séance exigeante.",
          c: "Sa récupération remonte : c'est le moment de lui placer une séance exigeante." },
    down: { a: "Ta récupération s'effrite : allège si ta prochaine séance est dure.",
            c: "Sa récupération s'effrite : allège si sa prochaine séance est dure." },
    flat: { a: "Ta récupération tient son niveau habituel : tu peux suivre ce qui est prévu sans ajuster.",
            c: "Sa récupération tient son niveau habituel : ce qui est prévu reste adapté." },
  },
  form: {
    up: { a: "Ta forme progresse : la condition prend le dessus sur la fatigue.",
          c: "Sa forme progresse : la condition prend le dessus sur la fatigue." },
    down: { a: "Ta forme s'érode : la fatigue reprend du terrain.",
            c: "Sa forme s'érode : la fatigue reprend du terrain." },
    flat: { a: "Ta condition et ta fatigue avancent au même rythme : ton équilibre tient.",
            c: "Sa condition et sa fatigue avancent au même rythme : son équilibre tient." },
  },
  fitness: {
    up: { a: "Ta condition de fond progresse : tu encaisses plus de charge qu'avant.",
          c: "Sa condition de fond progresse : il encaisse plus de charge qu'avant." },
    down: { a: "Ta charge chronique baisse : possible perte de forme si ça dure.",
            c: "Sa charge chronique baisse : possible perte de forme si ça dure." },
    flat: { a: "Ta base d'entraînement tient : tu encaisses autant de charge qu'avant.",
            c: "Sa base d'entraînement tient : il encaisse autant de charge qu'avant." },
  },
  fatigue: {
    up: { a: "Ta fatigue accumulée monte : normal après une période chargée, à surveiller si ça s'installe.",
          c: "Sa fatigue accumulée monte : normal après une période chargée, à surveiller si ça s'installe." },
    down: { a: "Ta fatigue redescend : tu récupères de la période chargée.",
            c: "Sa fatigue redescend : il récupère de la période chargée." },
    flat: { a: "Tu n'accumules pas : ta charge récente reste au niveau de d'habitude.",
            c: "Il n'accumule pas : sa charge récente reste à son niveau habituel." },
  },
};

/* Le statut de fitness et fatigue EST leur direction : ils n'ont aucun seuil absolu (deux EWMA de
   charge en UA). La carte affiche donc une flèche à droite et pas un mot, sinon "↘ -5 % sur 7 j" à
   gauche et "En baisse" à droite diraient deux fois la même chose. */
export const TREND_IS_STATUS: MetricKey[] = ["fitness", "fatigue"];
/* ...mais écrit en toutes lettres, pas en flèche (2026-09-28) : sur la ligne principale d'une carte,
   "↘" seul ne se lit pas comme un statut. Dérivé de la direction affichée par la carte, jamais du
   `trendDimInfo` de prod, qui est calculé sur une autre fenêtre (voir impactFor). */
export const TREND_STATUS_LABEL: Record<TrendDir, string> = {
  up: "En hausse", down: "En baisse", flat: "Stable",
};

/* `zoneText` est le texte déjà écrit par sigDimInfo() pour la zone courante : quand l'indice
   décroche, il porte déjà l'action à faire, on ne réécrit rien. */
export function impactFor(key: MetricKey, zoneText: string | null, dir: TrendDir, decroche: boolean, perspective: Perspective = "athlete"): string {
  const voiced = (v: Voiced | undefined) => (v ? (perspective === "coach" ? v.c : v.a) : undefined);
  /* Fitness et fatigue sont le seul cas où `zoneText` est lui-même DÉRIVÉ D'UNE TENDANCE : prod le
     calcule via trendDimInfo() sur SA fenêtre (7 jours, fitnessFatigueTrend), pas sur celle que la
     carte affiche. Le réutiliser tel quel produisait une contradiction directe — "↘ -20 % sur 28 j"
     au-dessus de "Ta charge récente est en hausse" (2026-09-28, trouvé par Gildas). Pour ces deux-là
     on reste donc toujours sur MOVE_TEXT, indexé par la direction RÉELLEMENT affichée.
     Les autres indices n'ont pas ce risque : leur texte décrit la zone COURANTE, qui ne dépend
     d'aucune fenêtre. */
  if (TREND_IS_STATUS.includes(key)) return voiced(MOVE_TEXT[key]?.[dir]) ?? voiced(MOVE_TEXT[key]?.flat) ?? "";
  if (decroche && zoneText) return zoneText;
  return voiced(MOVE_TEXT[key]?.[dir]) ?? voiced(MOVE_TEXT[key]?.flat) ?? zoneText ?? "";
}

/* Les libellés de sigDimInfo()/trendDimInfo() sont écrits pour des BADGES : tout en capitales, et
   parfois préfixés du nom de l'indicateur ("CONTRAINTE OK", "FITNESS ↗", "FATIGUE ACCUMULÉE ↘").
   Sur une carte le nom est déjà le titre, juste à gauche : le répéter à droite est la redondance que
   Gildas a demandé de retirer, et les capitales crient à cette taille. On normalise ici plutôt que
   de toucher sigDimInfo, dont les badges restent utilisés ailleurs tels quels. */
const STATUS_PREFIX: Partial<Record<MetricKey, RegExp>> = {
  strain: /^contrainte\s+/i,
  fitness: /^fitness\s*/i,
  fatigue: /^fatigue accumulée\s*/i,
  recovery: /^récup\.?\s+/i,
};
export function prettyStatus(metric: MetricKey, label: string | null | undefined): string {
  if (!label) return "";
  const stripped = label.replace(STATUS_PREFIX[metric] ?? /^$/, "").trim() || label.trim();
  if (stripped.length <= 2) return stripped;          // "OK" reste "OK", pas "Ok"
  const lower = stripped.toLocaleLowerCase("fr-FR");
  return lower.charAt(0).toLocaleUpperCase("fr-FR") + lower.slice(1);
}



/* Couleur AFFICHÉE du statut. Tout l'onglet Récupération vit sur la rampe séquentielle bleue (ring,
   charts, aperçus) — y laisser le vert/orange/gris de sigDimInfo()/trendDimInfo() faisait de la
   ligne principale le seul élément hors palette (2026-09-28, Gildas).
   La couleur d'origine reste la source de la SÉVÉRITÉ (severityOf teste des hex précis) : on ne la
   remplace pas, on la traduit pour l'affichage. */
export function statusDisplayColor(metric: MetricKey, infoColor: string | undefined): string {
  if (!infoColor) return "rgba(255,255,255,.5)";
  if (METRICS[metric].group !== "recup") return infoColor;
  if (metric === "recovery") return infoColor;          // déjà wellnessColor(), donc déjà dans la rampe
  /* Foncé = favorable, clair = défavorable, MÉDIAN = neutre — la convention de la rampe elle-même,
     où le score le plus haut est le plus foncé (t = score/100 dans wellnessColor). Le gris #8a8f94
     est le neutre de l'app ("ÉQUILIBRÉ", "→ STABLE") : le traiter comme "bon" lui donnait la même
     nuance que "FRAIS", donc deux états distincts indiscernables. */
  if (infoColor === "#d10000") return WELLNESS_RAMP[0].hex;
  if (infoColor === "#f28a00") return WELLNESS_RAMP[1].hex;
  if (infoColor === "#8a8f94") return WELLNESS_RAMP[2].hex;
  return WELLNESS_RAMP[WELLNESS_RAMP.length - 1].hex;
}

/* ── descripteur de chart ─────────────────────────────────────────────────────────────────────── */

export type ChartSpec = {
  values: (number | null)[];
  dates: string[];
  kind: ChartKind;
  lo: number;
  hi: number | null;
  zones?: ZoneBand[];
  /* Labels des zones qui reçoivent une BANDE de fond. Tout colorer ferait un fond arc-en-ciel qui
     ne dit rien : l'ACWR ne remplit que sa zone optimale (et en neutre, comme en prod), la
     monotonie et la contrainte ne remplissent que les zones à éviter. Le liseré vertical de gauche,
     lui, porte toujours les trois couleurs — c'est la légende. */
  bandZones?: string[];
  neutralBand?: boolean;
  gradient?: { offset: number; color: string }[];
  /* Cadrage dynamique sur la donnée plutôt que sur l'échelle complète (2026-09-28, Gildas : "éviter
     les courbes qui ressemblent à des lignes droites selon les temporalités"). Une monotonie qui
     vit entre 1,40 et 1,55 sur une échelle 0-3 est visuellement plate alors qu'elle bouge de 10 %.
     `minSpan` empêche l'excès inverse : une série quasi constante ne doit pas être amplifiée en
     montagnes russes. Les bandes et le liseré restent tracés dans le cadre visible, donc une zone
     hors champ remplit tout le chart — ce qui dit correctement "tu es entièrement dedans". */
  autoScale?: boolean;
  minSpan?: number;
  /* Frontières de zone en pointillé, sans remplissage : pour la récupération, dont la COURBE porte
     déjà la couleur de zone — une bande en plus ne ferait que redire la même chose. */
  boundaryLines?: number[];
  link?: boolean;
  showTicks?: boolean;
  refLine?: { value: number; label: string };
  fmt: (v: number) => string;
  colorAt: (v: number) => string;
  tooltipExtra?: (i: number) => string | null;
};

const rampAt = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  let loStop = WELLNESS_RAMP[0], hiStop = WELLNESS_RAMP[WELLNESS_RAMP.length - 1];
  for (let i = 0; i < WELLNESS_RAMP.length - 1; i++) {
    if (c >= WELLNESS_RAMP[i].stop && c <= WELLNESS_RAMP[i + 1].stop) { loStop = WELLNESS_RAMP[i]; hiStop = WELLNESS_RAMP[i + 1]; break; }
  }
  const k = (c - loStop.stop) / (hiStop.stop - loStop.stop || 1);
  const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = rgb(loStop.hex), [r2, g2, b2] = rgb(hiStop.hex);
  return "#" + [r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k].map(x => Math.round(x).toString(16).padStart(2, "0")).join("");
};

const zoneColorOf = (zones: ZoneBand[] | undefined, v: number, fallback: string) =>
  zones?.find(z => v >= z.from && v < z.to)?.color ?? zones?.[0]?.color ?? fallback;

/* Bandes de fond par indice — voir `bandZones` ci-dessus pour le pourquoi. */
const BAND_ZONES: Partial<Record<MetricKey, string[]>> = {
  acwr: ["OPTIMAL"],
  monotony: ["ÉLEVÉE", "CRITIQUE"],
  strain: ["FATIGUE", "BLESSURE"],
  form: ["FRAIS", "ÉQUILIBRÉ", "FATIGUÉ"],
};

export function chartSpecFor(
  metric: MetricKey,
  series: DayPoint[],
  opts: { sessionRef: number | null; recoveryRelative?: (number | null)[] },
): ChartSpec {
  const meta = METRICS[metric];
  const dates = series.map(p => p.date);
  /* La récupération se trace en RELATIF (percentile du z-score), jamais en score absolu : c'est ce
     que fait le chart de prod, et les bornes de zone 42/58 sont définies sur cette échelle-là. Les
     tracer sur le score brut donnerait des zones fausses. */
  const values = metric === "recovery" && opts.recoveryRelative ? opts.recoveryRelative : seriesOf(metric, series);

  const base: ChartSpec = {
    values, dates, kind: meta.kind, lo: meta.lo, hi: meta.hi,
    zones: meta.zones, bandZones: BAND_ZONES[metric], neutralBand: metric === "acwr",
    link: meta.link, showTicks: !meta.zones, fmt: meta.fmt,
    /* Cadrage dynamique RÉSERVÉ aux indices sans zones — fitness et fatigue (2026-09-28, correction
       après un premier jet trop large). Sur un indice à zones, zoomer sur la donnée fait sortir du
       cadre les seuils qui donnent tout son sens à la valeur : un ACWR à 0,85 ne veut rien dire si
       on ne voit plus où est 0,8 et 1,3. Les barres, elles, partent toujours de zéro : les cadrer
       sur la donnée couperait leur pied et exagérerait les écarts. */
    autoScale: !meta.zones && meta.kind !== "bars",
    minSpan: undefined,
    colorAt: v => zoneColorOf(meta.zones, v, "#8fbdf0"),
  };

  switch (metric) {
    case "load":
      /* Pas de fenêtre saine mobile ici (essayée le 2026-09-28, retirée le jour même) : 0,8–1,3 ×
         chronique en UA et l'ACWR énoncent littéralement la même chose, l'un en unités, l'autre en
         ratio. La tracer sur la carte Charge dupliquait donc la carte ACWR, en ajoutant une bande,
         une seconde ligne et ses points par-dessus les barres — illisible pour zéro information
         nouvelle. Le seul repère qui apporte quelque chose ici est la séance moyenne 4 semaines,
         qui compare une SÉANCE, pas une semaine. */
      return {
        ...base,
        colorAt: v => {
          const q = sessionQualifier(v, opts.sessionRef);
          return q.label === "Dure" ? "#a8500f" : q.label === "Légère" ? "#ffd2b0" : "#ef8544";
        },
        refLine: opts.sessionRef ? { value: opts.sessionRef, label: `séance moyenne 4 sem. · ${Math.round(opts.sessionRef)} UA` } : undefined,
        tooltipExtra: i => {
          const v = series[i]?.load;
          return v ? sessionQualifier(v, opts.sessionRef).label : "Repos";
        },
      };
    case "recovery":
      return {
        ...base,
        boundaryLines: [42, 58],
        colorAt: v => rampAt(v / 100),
        gradient: [...WELLNESS_RAMP].reverse().map(r => ({ offset: Math.round((1 - r.stop) * 100), color: r.hex })),
      };
    case "fitness":
      return { ...base, colorAt: () => "#8fbdf0" };
    case "fatigue":
      return { ...base, colorAt: () => "#d10000" };
    default:
      return base;
  }
}

/* Sous-jacents du score de récupération. Ils ne sont PAS des indices de la liste : ce sont les
   composantes du score, qui a déjà sa carte — ils filtrent donc le chart À L'INTÉRIEUR de cette
   carte. `dimensionRaw` a déjà inversé le stress en amont, donc "plus haut = mieux" partout. */
/* Libellés des chips de sous-jacent — simple ré-export de DIMENSION_LABELS (2026-09-28, une fois
   celui-ci aligné sur le mot du formulaire, "État physique"). Garder une seconde table ici serait
   exactement le point de divergence qu'on vient de supprimer. */
export const DIMENSION_CHART_LABELS = DIMENSION_LABELS;
export function dimensionSpec(dim: DimensionKey, baseline: (WellnessBaselineResult | null)[], dates: string[]): ChartSpec {
  /* On trace le Z, pas la valeur brute (2026-09-28, Gildas : "comparer aux valeurs d'il y a 7 jours
     est nul, il faudrait la comparer au Z-score"). Le Z est par construction l'écart à SA norme
     personnelle, donc la référence est la ligne 0 — pas besoin de la reconstruire, et surtout pas
     un point arbitraire du passé. La bande ±Z_SWC matérialise ce qui compte comme "stable" (même
     seuil que la flèche du chip, Hopkins & Batterham).
     Le brut reste lisible au survol via `tooltipExtra`. */
  const values = baseline.map(b => b?.dimensions?.[dim]?.z ?? null);
  const raws = baseline.map(b => b?.dimensions?.[dim]?.raw ?? null);
  /* Le stress est la SEULE dimension inversée (dimensionRaw : `10 - stress`), pour que "plus haut =
     mieux" vaille partout. Deux conséquences, toutes deux corrigées ici (2026-09-29, bug trouvé par
     Gildas en prod — "l'insight dit stress en dessous de ma norme alors que le chart le montre
     au-dessus") :

     1. LES LIBELLÉS DE ZONE. Le Z tracé est l'inversé, donc le haut du chart veut dire MOINS de
        stress. "AU-DESSUS" s'y lisait comme "mon stress est au-dessus", l'exact contraire — et ça
        contredisait describeDominantDimension(), qui parle lui du stress RÉEL (via directionalZ).
        Les deux disaient la même chose avec des mots opposés. On garde l'axe tel quel (haut = mieux
        pour les 4 dimensions, un invariant utile) et on nomme explicitement ce que ça veut dire.
     2. LE TOOLTIP. `raw` vaut `10 - stress` : affiché tel quel derrière "déclaré", il annonçait
        7/10 à quelqu'un qui avait déclaré 3. On ré-inverse pour retrouver la valeur réellement
        saisie dans le formulaire. */
  const inverted = dim === "stress";
  const zoneLabels = inverted
    ? { high: "MOINS DE STRESS", mid: "DANS MA NORME", low: "PLUS DE STRESS" }
    : { high: "AU-DESSUS", mid: "DANS MA NORME", low: "EN DESSOUS" };
  return {
    values, dates, kind: "line", lo: -2.5, hi: 2.5, showTicks: false,
    zones: [
      { from: Z_SWC, to: 2.5, color: WELLNESS_RAMP[WELLNESS_RAMP.length - 1].hex, label: zoneLabels.high },
      { from: -Z_SWC, to: Z_SWC, color: WELLNESS_RAMP[2].hex, label: zoneLabels.mid },
      { from: -2.5, to: -Z_SWC, color: WELLNESS_RAMP[0].hex, label: zoneLabels.low },
    ],
    boundaryLines: [0],
    fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}`,
    colorAt: v => rampAt(0.5 + v / 5),
    tooltipExtra: i => {
      const r = raws[i];
      if (r === null || r === undefined) return null;
      // Sommeil mesuré par la montre (2026-09-30) : le point tracé combine les deux, on les montre séparément.
      const sl = dim === "sleep" ? baseline[i]?.dimensions?.sleep : undefined;
      if (sl?.deviceMinutes != null && sl.declared != null) {
        const m = Math.round(sl.deviceMinutes);
        return `${Math.round(sl.declared)}/10 déclaré · ${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")} mesuré`;
      }
      return `${Math.round(inverted ? 10 - r : r)}/10 déclaré`;
    },
  };
}

/* FC au repos (montre, 2026-09-30) : même lecture que les 4 autres sous-jacents (Z de la composante,
   plus haut = mieux, donc une FC PLUS BASSE que d'habitude tire le chart vers le haut). Les libellés
   nomment le sens réel pour ne pas refaire l'erreur du stress. Le bpm reste lisible au survol. */
export function rhrSpec(baseline: (WellnessBaselineResult | null)[], dates: string[]): ChartSpec {
  const values = baseline.map(b => b?.rhr?.z ?? null);
  return {
    values, dates, kind: "line", lo: -2.5, hi: 2.5, showTicks: false,
    zones: [
      { from: Z_SWC, to: 2.5, color: WELLNESS_RAMP[WELLNESS_RAMP.length - 1].hex, label: "FC PLUS BASSE" },
      { from: -Z_SWC, to: Z_SWC, color: WELLNESS_RAMP[2].hex, label: "DANS MA NORME" },
      { from: -2.5, to: -Z_SWC, color: WELLNESS_RAMP[0].hex, label: "FC PLUS HAUTE" },
    ],
    boundaryLines: [0],
    fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}`,
    colorAt: v => rampAt(0.5 + v / 5),
    tooltipExtra: i => {
      const r = baseline[i]?.rhr;
      return r ? `${Math.round(r.bpm)} bpm · norme ${Math.round(r.norm)}` : null;
    },
  };
}

/* ── Score agrégé par onglet (2026-09-29, POC charge-variantes.html variante S2, retenue par Gildas)
   ──────────────────────────────────────────────────────────────────────────────────────────────────
   Ce n'est PAS une note de qualité ("72/100, c'est bien ?") mais une POSITION sur un axe qui a deux
   extrémités opposées et un milieu souhaitable : 0 = un bout, 50 = le milieu de la zone visée,
   100 = l'autre bout. Un même chiffre ne peut donc pas vouloir dire deux choses contraires, ce qui
   condamnait la première version essayée (moyenne pondérée de sous-scores de qualité) : elle
   saturait à 100 dès que les trois indicateurs étaient dans leur zone, sans voir qu'on glissait
   vers le bas de l'optimal.

   CHARGE — sous-charge ↔ optimal ↔ surcharge. Trois points qui évitent l'invention :
     • l'axe est celui de l'ACWR (0-2), donc les bandes tombent sur ses seuils réels (Gabbett 0,8 et
       1,3 → 40 % et 65 % de l'axe) et gardent leurs vraies proportions ;
     • monotonie et contrainte ne peuvent pousser que vers la DROITE : elles ne disent jamais
       "pas assez", seulement "trop accumulé". Elles n'ajoutent donc aucun delta arbitraire, elles
       posent un PLANCHER sur une frontière qui existe déjà (entrée de surcharge, ou milieu de
       surcharge si elles sont en alerte) ;
     • un indicateur absent est ignoré, il ne tire pas le résultat vers le bas.
   Assumé : deux indicateurs secondaires en alerte ne pèsent pas plus qu'un seul.

   RÉCUPÉRATION — fatigué ↔ équilibré ↔ frais, et pas seulement le score de récupération (Gildas :
   "pas que le wellness"). On croise les deux axes réellement INDÉPENDANTS :
     • le ressenti — le score relatif, qui est déjà le composite de sommeil / stress / état physique
       / motivation. Les reprendre un par un les compterait deux fois ;
     • l'objectif — la Forme (Fitness − Fatigue), dérivée de l'entraînement, que le ressenti ignore.
       Fitness et fatigue n'entrent pas séparément : ce sont ses deux composantes.
   Les deux se moyennent légitimement parce qu'ils partagent la MÊME échelle normalisée et les MÊMES
   frontières : ±8 % de Forme sur un axe -50/+50 tombe sur 42 % et 58 %, exactement les bornes du
   percentile de récupération (±Z_SWC). Vérifié dans le code, pas supposé.
   Les comportements négatifs de la veille ne sont dans aucun des deux (le signal part du
   `base_score`, voir wellnessSignal) : ils posent un PLAFOND juste sous "Frais" plutôt qu'un malus
   chiffré — on ne déclare pas quelqu'un frais au lendemain d'un écart, mais on n'invente pas de
   combien. */
export type AggBand = { label: string; color: string; from: number; to: number };

/* Les couleurs ne sont pas choisies ici : on demande à sigDimInfo() et à la rampe wellness la
   couleur qu'elles donnent déjà à une valeur représentative de chaque bande. Une bande recolorée à
   la main finirait par diverger du chart juste en dessous. */
export const AGG_BANDS: Record<MetricGroup, AggBand[]> = {
  charge: [
    { label: "Sous-charge", color: sigDimInfo("load", 0.5, "athlete").color, from: 0,    to: 0.4 },
    { label: "Optimal",     color: sigDimInfo("load", 1.0, "athlete").color, from: 0.4,  to: 0.65 },
    { label: "Surcharge",   color: sigDimInfo("load", 1.6, "athlete").color, from: 0.65, to: 1 },
  ],
  recup: [
    { label: "Fatigué",   color: wellnessColor(20), from: 0,    to: 0.42 },
    { label: "Équilibré", color: wellnessColor(50), from: 0.42, to: 0.58 },
    { label: "Frais",     color: wellnessColor(85), from: 0.58, to: 1 },
  ],
};

const CHARGE_SURCHARGE_ENTRY = 0.66;  // juste dans la bande surcharge (elle commence à 0,65)
const CHARGE_SURCHARGE_MID   = 0.82;  // milieu de la bande surcharge
const RECUP_FEEL_WEIGHT      = 0.7;   // part du ressenti dans l'agrégat récup, le reste = Forme

export function chargeAggregatePos(a: {
  acwr: number | null; monotonySeverity: Severity; strainSeverity: Severity;
}): number | null {
  if (a.acwr === null) return null;
  let pos = Math.max(0, Math.min(1, a.acwr / 2));           // l'axe 0-2 de l'ACWR
  const secondaries = [a.monotonySeverity, a.strainSeverity];
  if (secondaries.includes("alert")) pos = Math.max(pos, CHARGE_SURCHARGE_MID);
  else if (secondaries.includes("watch")) pos = Math.max(pos, CHARGE_SURCHARGE_ENTRY);
  return pos;
}

export function recupAggregatePos(a: {
  relativeScore: number | null; form: number | null;
}): number | null {
  /* Pondération 70 % ressenti / 30 % Forme (2026-09-30, Gildas — c'était une moyenne simple 50/50) :
     le ressenti reste le signal principal de la récupération, la Forme le module. Un axe manquant
     n'est pas compté (on renormalise sur les poids présents), jamais tiré vers 0. */
  const parts: { v: number; w: number }[] = [];
  if (a.relativeScore !== null) parts.push({ v: Math.max(0, Math.min(1, a.relativeScore / 100)), w: RECUP_FEEL_WEIGHT });
  if (a.form !== null) parts.push({ v: Math.max(0, Math.min(1, (a.form + 50) / 100)), w: 1 - RECUP_FEEL_WEIGHT });
  if (!parts.length) return null;
  const mean = parts.reduce((x, p) => x + p.v * p.w, 0) / parts.reduce((x, p) => x + p.w, 0);
  /* Plus de plafond "pas Frais" en cas de comportement négatif la veille (retiré le 2026-09-30,
     Gildas) : leur effet passe déjà par le ressenti déclaré et par la carte Comportements. */
  return mean;
}

export function bandFor(group: MetricGroup, pos: number): AggBand {
  const bands = AGG_BANDS[group];
  return bands.find(b => pos >= b.from && pos < b.to) ?? bands[bands.length - 1];
}

/* Extraction unique depuis ConseilsData — appelée à l'identique par les cartes de l'Accueil et par
   la liste coach. Deux extractions séparées finiraient par ne plus dire la même chose, exactement
   le défaut qu'on a déjà corrigé entre un ring et les badges d'une même ligne. */
export function aggregateFor(group: MetricGroup, data: ConseilsData):
  { pos: number; band: AggBand } | null {
  let pos: number | null;
  if (group === "charge") {
    pos = chargeAggregatePos({
      acwr: lastNonNull(data.zoneAcwr),
      monotonySeverity: severityOf(data.monotonyInfo.color),
      strainSeverity: data.strainInfo ? severityOf(data.strainInfo.color) : "good",
    });
  } else {
    const last = data.timeSeries[data.timeSeries.length - 1];
    const b = data.wellnessBaseline;
    pos = recupAggregatePos({
      relativeScore: b?.hasEnoughHistory ? b.relativeScore : (last?.recovery ?? null),
      form: last?.form ?? null,
    });
  }
  return pos === null ? null : { pos, band: bandFor(group, pos) };
}

function lastNonNull(a: (number | null)[]): number | null {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] !== null) return a[i];
  return null;
}

/* VFC (montre, 2026-09-30) : même lecture que la FC au repos, mais ici plus haut = VFC plus haute =
   mieux, sans inversion. Le ms reste lisible au survol. */
export function hrvSpec(baseline: (WellnessBaselineResult | null)[], dates: string[]): ChartSpec {
  const values = baseline.map(b => b?.hrv?.z ?? null);
  return {
    values, dates, kind: "line", lo: -2.5, hi: 2.5, showTicks: false,
    zones: [
      { from: Z_SWC, to: 2.5, color: WELLNESS_RAMP[WELLNESS_RAMP.length - 1].hex, label: "AU-DESSUS" },
      { from: -Z_SWC, to: Z_SWC, color: WELLNESS_RAMP[2].hex, label: "DANS MA NORME" },
      { from: -2.5, to: -Z_SWC, color: WELLNESS_RAMP[0].hex, label: "EN DESSOUS" },
    ],
    boundaryLines: [0],
    fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}`,
    colorAt: v => rampAt(0.5 + v / 5),
    tooltipExtra: i => {
      const h = baseline[i]?.hrv;
      return h ? `${Math.round(h.ms)} ms · norme ${Math.round(h.norm)}` : null;
    },
  };
}
