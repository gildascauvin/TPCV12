/* Parseur de ligne d'exercice — source unique pour l'affichage enrichi, les pastilles de l'éditeur
   et les leviers de décision (sessionLevers.ts). Remplace la lecture de lignes de loadAdjust.ts
   pour l'autorégulation (2026-10-07, POC « Séances, exos et ajustements »).

   Principe : la ligne tapée reste la source de vérité (rien n'est stocké en structuré). Chaque
   token garde sa position exacte dans le texte, le nom = tout ce qui n'est pas un token (préfixe
   « A - », emojis, notes entre parenthèses compris). Un ajustement modifie des valeurs de tokens
   puis réécrit la ligne (rewriteLine), en recopiant tout le reste à l'identique.

   Couvre les conventions courantes : NxM, 3x(1+1+1), montées « 75kg -95kg 3x75kg », @ 80 %,
   RPE 7-8, RIR, tempo 3-1-X-0, 5/3/1, A1/A2, EMOM/E2MOM/OTM, AMRAP, 21-15-9, 30/30, × 4 tours,
   zones Z1-Z5, % FTP/VMA/FCmax, allure 5'00/km, récup r 1'30, 1h30, 60-90 min, max, 8+3+2,
   /côté, +10kg, @ 2x16kg. Mesuré sur toute la base le 2026-10-07 : texte brut sur 0,1 % des
   lignes tapées, 0,7 % des templates, 0 des 75 conventions de référence.

   Une ligne non comprise (kind "fallback") s'affiche telle quelle et n'est jamais ajustée. Une
   ligne ambiguë (ambiguous) s'affiche enrichie mais n'est jamais ajustée non plus. */

const NUM = "\\d+(?:[.,]\\d+)?";
const toN = (s: string | number) => parseFloat(String(s).replace(",", "."));
const SIDE = "\\s*\\/\\s*(?:côtés?|cotés?|side|jambe|bras)";
const TIME = "\\d+\\s*h\\s*\\d{0,2}|\\d+\\s*'\\s*\\d{0,2}|\\d+\\s*(?:\"|'')|\\d+(?:[.,]\\d+)?\\s*(?:min|sec|s)(?![a-zà-ÿ])";

type TokKind =
  | "complex" | "wendler" | "ladder" | "tempo" | "interval" | "scheme" | "series" | "otm" | "mult" | "count"
  | "rpe" | "pct" | "zone" | "pace" | "rest" | "side" | "reps" | "trange" | "time" | "dist" | "load" | "atload" | "bare";

const RULES: [TokKind, string][] = [
  ["complex", `(\\d+)\\s*[x×]\\s*\\(\\s*(\\d+(?:\\s*\\+\\s*\\d+)+)\\s*\\)`],
  ["wendler", `(\\d+\\s*\\/\\s*\\d+\\s*\\/\\s*\\d+)(?![\\d\\/])`],
  ["ladder",  `(${NUM}(?:\\s*-\\s*${NUM}){2,})\\s*(kg|min|m|s|')?(?![a-zà-ÿ\\d])`],
  ["tempo",   `tempo\\s*([0-9X](?:\\s*[-.]?\\s*[0-9X]){3})(?![\\d])`],
  ["interval",`(\\d+)\\s*(?:s|"|'')?\\s*\\/\\s*(\\d+)\\s*(?:s|"|'')?(?![\\d\\/a-zà-ÿ])`],
  ["scheme",  `(\\d+)\\s*[x×]\\s*(?:@\\s*)?(${NUM}|max)(?:\\s*-\\s*(\\d+)(?![.,\\d]))?((?:\\s*\\+\\s*\\d+(?![\\d.,]*\\s*kg))*)\\s*(kg|km|min|m|s|"|')?(?![a-zà-ÿ\\d.,])((?:${SIDE})?)`],
  ["series",  `(\\d+)\\s*(?:séries|series|sets|rounds|tours)\\b`],
  ["otm",     `(?:(\\d+)\\s*)?(?:E\\d?MOM|OTM)\\b`],
  ["mult",    `[x×]\\s?(\\d+)(?![\\d.,]|\\s*[x×])(?:\\s*(?:tours|rounds|sets|séries)\\b)?`],
  ["count",   `(\\d+)\\s*[x×](?![\\d(])`],
  ["rpe",     `\\b(RPE|RIR)\\s*(${NUM})(?:\\s*-\\s*(${NUM}))?`],
  ["pct",     `@?\\s*(${NUM})(?:\\s*-\\s*(${NUM}))?\\s*%\\s*(1\\s?RM|RM|FC\\s?max|FCM|FTP|VMA|PMA|MAS|CP)?`],
  ["zone",    `\\b(Z[1-5](?:\\s*[\\/-]\\s*Z?[1-5])?|zone\\s*[1-5](?:\\s*[\\/-]\\s*[1-5])?)\\b`],
  ["pace",    `(\\d+)\\s*[':](\\d{2})\\s*(?:\\/\\s*km|min\\/km)`],
  ["rest",    `(?:\\br|\\bR|récup|recup|rest|repos)\\s*[=:]?\\s*(${TIME})`],
  ["side",    `(\\d+)\\s*(?:reps?)?(${SIDE})`],
  ["reps",    `(\\d+)\\s*(?:reps?|répétitions?)\\b`],
  ["trange",  `(\\d+)\\s*-\\s*(\\d+)\\s*(min|sec|s|h|')(?![a-zà-ÿ])`],
  ["time",    `(${TIME})(?:\\s*-\\s*(${TIME}))?((?:${SIDE})?)`],
  ["dist",    `(${NUM})\\s*(km|m|k)(?![a-zà-ÿ])`],
  ["load",    `(\\+)?@?\\s*(${NUM})\\s*kg\\b(\\+?)`],
  ["atload",  `@\\s*(${NUM})(\\+?)(?![\\d.,]*\\s*(?:kg|%|[x×]))`],
  ["bare",    `(${NUM})(\\+?)(?!\\d|[.,]\\d)`],
];
const RX: [TokKind, RegExp][] = RULES.map(([k, r]) => [k, new RegExp(r, "iyd")]);
const EMOJI_RE = new RegExp("[\\p{Extended_Pictographic}\\uFE0F\\u200D]", "gu");
const NOTE_RE = /^\s*(?:[-•*]\s*)?(note[sz]?|focus|objectifs?|difficulté|difficulte|comparer|compare|bilan|debrief|debriefing|mesurer?|analyse[rz]?|consignes?|rappel|conseils?|attention|remarques?|nb|important|qualité|qualite|priorité|priorite|astuce|idée|idee|pense|penser|noter|compter|pas de|si possible|récup|recup|repos|volume|pace|garder|partitionner)(?=[\s:.,!?]|$)/i;
const FORMAT_RE = /(AMRAP|E\d?MOM|For time|Tabata|Circuit|Superset|Drop set|Rest-pause|Cluster|Pyramide|WOD|Metcon|HIIT|tours?|rounds?)/i;

export interface Token {
  k: TokKind;
  start: number;
  end: number;
  /** Groupes capturés de la règle (undefined quand absents). */
  g: (string | undefined)[];
  /** Bornes de chaque groupe, relatives au début du token. */
  gi: ([number, number] | undefined)[];
  src: string;
  before: string;
  dash: boolean;
}
/** Un chiffre précis dans un token : ce que les leviers modifient. */
export interface TokRef { t: Token; gi: number }

export interface LoadItem {
  kind: "single" | "sub";
  v: number;
  plus?: boolean;
  lest?: boolean;
  /** « @ 2x16kg » : paire d'haltères, pas des séries. */
  pair?: number;
  /** "sub" : « 3x75kg » = 3 séries à 75 kg. */
  n?: number;
  reps?: string;
  nRef?: TokRef;
  ref: TokRef | null;
  rangeStart?: boolean;
  rangeEnd?: boolean;
  scheme?: Scheme;
  nFromScheme?: boolean;
}
export interface Scheme {
  sets: number | null;
  reps?: string | null;
  dist?: number;
  sec?: number | null;
  sec2?: number | null;
  ladder?: string;
  unit?: string;
  work?: number;
  rest?: number;
  rounds?: number;
  tok: Token | null;
  setsRef?: TokRef;
  secRef?: TokRef | null;
  items: LoadItem[];
  range?: LoadItem[];
}
export interface Extra { k: "tempo" | "zone" | "pace" | "rest"; t: string; ref?: TokRef; ref2?: TokRef; raw?: string; sec?: number }
export interface Entry { n: number; load: number; plus?: boolean; item: LoadItem }
export interface ParsedLine {
  raw: string;
  /** full = lue en entier · nameOnly = juste un nom · note = consigne · fallback = non comprise. */
  kind: "full" | "nameOnly" | "note" | "fallback";
  toks: Token[];
  name: string;
  schemes: Scheme[];
  /** Série par série, dans l'ordre écrit (montées en charge). */
  entries: Entry[];
  pct: number | null;
  pct2?: number | null;
  pctRef?: string | null;
  pctRefs?: [TokRef, TokRef | null];
  rpe: { k: string; v: number; v2: number | null; ref: TokRef } | null;
  otm: string | false;
  perSide: boolean;
  extras: Extra[];
  ok: boolean;
  /** En-tête de bloc (« 3 tours : », « AMRAP 12 min : ») : les lignes suivantes sans séries en dépendent. */
  header: boolean;
  /** Lecture incertaine : jamais ajustée par une décision. */
  ambiguous: boolean;
}

/* Durée écrite → secondes. */
function timeSec(s: string): number | null {
  s = s.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+)\s*h\s*(\d{0,2})$/i))) return +m[1] * 3600 + (m[2] ? +m[2] * 60 : 0);
  if ((m = s.match(/^(\d+)\s*'\s*(\d{0,2})$/))) return +m[1] * 60 + (m[2] ? +m[2] : 0);
  if ((m = s.match(/^(\d+)\s*(?:"|'')$/))) return +m[1];
  if ((m = s.match(/^([\d.,]+)\s*(min|sec|s)$/i))) return toN(m[1]) * (/min/i.test(m[2]) ? 60 : 1);
  return null;
}

const VOLUME_KINDS: TokKind[] = ["scheme", "complex", "series", "otm", "count", "mult", "ladder", "time", "interval", "wendler"];

function scan(raw: string): { toks: Token[]; masked: string } {
  let m = raw.replace(EMOJI_RE, c => "\u0001".repeat(c.length));
  m = m.replace(/\(([^()]*)\)/g, (all, inner: string) => /^\s*\d+(\s*\+\s*\d+)+\s*$/.test(inner) ? all : "(" + "\u0002".repeat(inner.length) + ")");
  // parties de nom qui contiennent des chiffres : fractions, 4vs4, S3, VO2max, 1RM, préfixe A1 -, 60cm, allure 10k
  const hide = (s: string) => s.replace(/[0-9]/g, "\u0003");
  m = m.replace(/\b[13]\/[24]\b/g, hide).replace(/\b\d+\s*vs\s*\d+\b/gi, hide).replace(/\bS\d+\b/g, hide).replace(/\bVO2(?:\s?max)?\b/gi, hide)
    .replace(/\b\d+\s?RM\b/g, hide).replace(/^\s*[A-H]\d?\s*[-–:.)]/, hide).replace(/\b\d+\s*cm\b/g, hide)
    .replace(/(allure\s+)(\d+\s*k)\b/gi, (_a, x: string, y: string) => x + hide(y));
  const toks: Token[] = [];
  let i = 0;
  while (i < m.length) {
    const prev = i ? m[i - 1] : " ";
    let hit: Token | null = null;
    if (!/[a-zà-ÿ0-9.,\u0003]/i.test(prev) || /[x×@]/i.test(m[i])) {
      for (const [k, rx] of RX) {
        rx.lastIndex = i;
        const mm = rx.exec(m);
        if (mm && mm[0].trim()) {
          const ind = (mm as RegExpExecArray & { indices?: ([number, number] | undefined)[] }).indices ?? [];
          hit = { k, start: i, end: i + mm[0].length, g: mm.slice(1), gi: ind.slice(1).map(x => x && [x[0] - i, x[1] - i] as [number, number]), src: "", before: "", dash: false };
          break;
        }
      }
    }
    if (hit && (hit.k === "count" || hit.k === "scheme" || hit.k === "mult") && /[a-zà-ÿ]/i.test(prev)) hit = null;
    if (hit && hit.k === "bare") {
      const v = toN(hit.g[0]!), after = m.slice(hit.end), before = m.slice(0, i);
      const wordAfter = /^\s+[a-zà-ÿ]/i.test(after);
      // « 3 position snatch », « 1 pieds », « 3 steps » : le nombre compte quelque chose du nom
      if (/^\s+(positions?|temps|steps?|marches?|pieds?|appuis?|directions?|vitesses?|jambes?|bras|mains?|côtés?|angles?|hauteurs?|variantes?|plots?|cônes?|cones?)\b/i.test(after) && v < 20) hit = null;
      const volume = toks.some(t => VOLUME_KINDS.includes(t.k));
      const lastTok = toks[toks.length - 1];
      const inLoadList = !hit || /[.,]/.test(hit.g[0]!) || (lastTok && ["load", "atload", "bare"].includes(lastTok.k) && /^\s*$/.test(m.slice(lastTok.end, i)));
      // « 5 power clean », « 20 air squats », « 1 leg RDL » : un nombre suivi d'un mot fait partie du nom
      if (hit && wordAfter && !inLoadList && !/@\s*$/.test(before) && (volume || /[:,]/.test(before) || (v < 20 && !/[.,]/.test(hit.g[0]!) && toks.length))) hit = null;
    }
    if (hit) {
      const lead = raw.slice(hit.start, hit.end).match(/^\s*/)![0].length;
      if (lead) { hit.start += lead; hit.gi = hit.gi.map(x => x && [x[0] - lead, x[1] - lead] as [number, number]); }
      hit.src = raw.slice(hit.start, hit.end);
      hit.before = raw.slice(0, hit.start);
      hit.dash = /-\s*$/.test(hit.before);
      toks.push(hit);
      i = hit.end;
    } else i++;
  }
  return { toks, masked: m };
}

export function parseLine(input: string): ParsedLine {
  const raw = input.normalize("NFC");
  const out: ParsedLine = { raw, kind: "full", toks: [], name: "", schemes: [], entries: [], pct: null, rpe: null, otm: false, perSide: false, ok: true, extras: [], header: false, ambiguous: false };
  if (NOTE_RE.test(raw) || (/\?\s*$/.test(raw) && !/\d\s*[x×]/.test(raw))) { out.kind = "note"; out.name = raw.trim(); return out; }
  const { toks, masked } = scan(raw);
  if (toks.length > 1 && toks[0].k === "bare" && toN(toks[0].g[0]!) < 20 && /^\s+[a-zà-ÿ]/i.test(raw.slice(toks[0].end))
    && toks.slice(1).some(t => ["series", "scheme", "complex", "count", "otm", "mult"].includes(t.k))) toks.shift();
  out.toks = toks;

  // nom = trous entre tokens ; un trou qui n'est que séparateurs devient un espace (ou « + »)
  const SEP = "[\\s@;,\\/\\-–—:]";
  const gap = (t: string) => {
    if (new RegExp(`^${SEP}*$`).test(t)) return " ";
    if (/^\s*[A-H]\d?\s*[-–:.)]\s*$/.test(t)) return t.trim() + " ";
    const lead = new RegExp(`^${SEP}*\\+`).test(t), trail = new RegExp(`\\+${SEP}*$`).test(t);
    const core = t.replace(/^[\s@;,/\-–—:+]+|[\s@;,/\-–—:+]+$/g, "").replace(/\s+à$/, "");
    return !core ? " + " : (lead ? " + " : " ") + core + (trail ? " + " : " ");
  };
  let name = "", nameM = "", last = 0;
  for (const t of toks) { name += gap(raw.slice(last, t.start)); nameM += gap(masked.slice(last, t.start)); last = t.end; }
  name += gap(raw.slice(last)); nameM += gap(masked.slice(last));
  const tidy = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s@;,/\-–—:+]+|[\s@;,/\-–—:+]+$/g, "").replace(/\s+à$/, "").trim();
  out.name = tidy(name);
  if (/\d/.test(tidy(nameM).replace(/\([^)]*\)/g, "").replace(/\b\d+ (?=[a-zà-ÿ])/gi, ""))) out.ok = false;

  let cur: Scheme | null = null;
  const ref = (t: Token, gi: number): TokRef => ({ t, gi });
  const newScheme = (sc: Omit<Scheme, "tok" | "items">, t: Token | null): Scheme => { cur = { ...sc, tok: t, items: [] }; out.schemes.push(cur); return cur; };
  const ensure = (): Scheme => cur || newScheme({ sets: null, reps: null }, null);
  const addLoad = (t: Token, gi: number, v: string, plus?: string, lest?: string) => {
    const c = ensure(), prev = c.items[c.items.length - 1];
    const it: LoadItem = { kind: "single", v: toN(v), plus: !!plus, lest: !!lest, ref: ref(t, gi) };
    if (t.dash && prev && prev.kind === "single" && !prev.rangeStart) { prev.rangeStart = true; it.rangeEnd = true; }
    c.items.push(it);
  };

  for (const t of toks) {
    const g = t.g;
    const c = cur as Scheme | null;
    switch (t.k) {
      case "complex": newScheme({ sets: +g[0]!, reps: g[1]!.replace(/\s/g, ""), setsRef: ref(t, 0) }, t); break;
      case "wendler": newScheme({ sets: null, reps: g[0]!.replace(/\s/g, "") }, t); break;
      case "ladder": {
        const vals = g[0]!.split("-").map(s => s.trim()), unit = (g[1] || "").toLowerCase();
        if (unit === "kg") { const sc = ensure(); vals.forEach(v => sc.items.push({ kind: "single", v: toN(v), ref: null })); }
        else if (unit === "min" || unit === "'") newScheme({ sets: null, ladder: vals.join("-"), unit: "min" }, t);
        else if (unit === "s" || unit === "m") newScheme({ sets: null, ladder: vals.join("-"), unit }, t);
        else newScheme({ sets: null, reps: vals.join("-") }, t);
        break;
      }
      case "tempo": out.extras.push({ k: "tempo", t: "tempo " + g[0]!.replace(/\s/g, ""), ref: ref(t, 0) }); break;
      case "interval": newScheme({ sets: null, work: +g[0]!, rest: +g[1]! }, t); break;
      case "scheme": {
        const sets = +g[0]!, val = g[1]!, unit = (g[4] || "").toLowerCase();
        if (g[5]) out.perSide = true;
        const spaced = /^\d+\s*[x×]\s+\d/i.test(t.src);
        if (unit === "kg" && /@\s*$/.test(t.before)) { ensure().items.push({ kind: "single", v: toN(val), pair: sets, ref: ref(t, 1) }); break; }
        if (/^max$/i.test(val)) { newScheme({ sets, reps: "max", setsRef: ref(t, 0) }, t); break; }
        if (unit === "kg" || (!unit && /[.,]/.test(val)) || (!unit && spaced && toN(val) >= 40)) {
          ensure().items.push({ kind: "sub", n: sets, v: toN(val), nRef: ref(t, 0), ref: ref(t, 1) });
        } else if (!unit && sets >= 20) {
          ensure().items.push({ kind: "sub", n: 1, reps: val, v: sets, ref: ref(t, 0) });
        } else if (unit === "m" || unit === "km") newScheme({ sets, dist: toN(val) * (unit === "km" ? 1000 : 1), setsRef: ref(t, 0) }, t);
        else if (unit === "s" || unit === '"') newScheme({ sets, sec: toN(val), setsRef: ref(t, 0) }, t);
        else if (unit === "min" || unit === "'") newScheme({ sets, sec: toN(val) * 60, setsRef: ref(t, 0) }, t);
        else newScheme({ sets, reps: (g[2] ? `${val}-${g[2]}` : val) + (g[3] ? g[3].replace(/\s/g, "") : ""), setsRef: ref(t, 0) }, t);
        break;
      }
      case "series":
        if (c && c.sets == null) { c.sets = +g[0]!; c.setsRef = ref(t, 0); } else newScheme({ sets: +g[0]!, reps: null, setsRef: ref(t, 0) }, t);
        break;
      case "otm":
        out.otm = (t.src.match(/E\d*MOM|OTM/i) || ["OTM"])[0].toUpperCase();
        if (g[0]) { if (c && c.sets == null) { c.sets = +g[0]; c.setsRef = ref(t, 0); } else if (!c) newScheme({ sets: +g[0], reps: null, setsRef: ref(t, 0) }, t); }
        break;
      case "mult":
        if (c && c.sets == null) { c.sets = +g[0]!; c.setsRef = ref(t, 0); } else if (c) c.rounds = +g[0]!; else newScheme({ sets: +g[0]!, reps: null, setsRef: ref(t, 0) }, t);
        break;
      case "count":
        if (!c) newScheme({ sets: +g[0]!, reps: null, setsRef: ref(t, 0) }, t); else if (c.sets == null) { c.sets = +g[0]!; c.setsRef = ref(t, 0); }
        break;
      case "rpe": out.rpe = { k: g[0]!.toUpperCase(), v: toN(g[1]!), v2: g[2] ? toN(g[2]) : null, ref: ref(t, 1) }; break;
      case "pct": out.pct = toN(g[0]!); out.pct2 = g[1] ? toN(g[1]) : null; out.pctRef = g[2] ? g[2].replace(/\s/g, "") : null; out.pctRefs = [ref(t, 0), g[1] ? ref(t, 1) : null]; break;
      case "zone": out.extras.push({ k: "zone", t: g[0]!.toUpperCase().replace(/\s/g, "").replace("ZONE", "Z"), ref: ref(t, 0), raw: g[0] }); break;
      case "pace": out.extras.push({ k: "pace", t: `${g[0]}'${g[1]}/km`, sec: +g[0]! * 60 + +g[1]!, ref: ref(t, 0), ref2: ref(t, 1) }); break;
      case "rest": out.extras.push({ k: "rest", t: "récup " + g[0]!.replace(/\s/g, ""), ref: ref(t, 0) }); break;
      case "side": out.perSide = true; if (c && c.reps == null) c.reps = g[0]; else newScheme({ sets: null, reps: g[0] }, t); break;
      case "reps": if (c && c.reps == null) c.reps = g[0]; else newScheme({ sets: null, reps: g[0] }, t); break;
      case "time": {
        if (g[2]) out.perSide = true;
        const sec = timeSec(g[0]!), sec2 = g[1] ? timeSec(g[1]) : null;
        const simple = /^\d+(?:[.,]\d+)?\s*(?:min|s|sec|')$/i.test(g[0]!.trim()) && !sec2;
        // une durée après un « + » appartient au mouvement suivant (« 1/2 FS + 5s rack hold »)
        const afterPlus = !!(c && c.tok && /\+/.test(raw.slice(c.tok.end, t.start)));
        if (c && !afterPlus && c.sec == null && c.reps == null && !c.work) { c.sec = sec; c.sec2 = sec2; if (simple) c.secRef = ref(t, 0); }
        else newScheme({ sets: null, sec, sec2, secRef: simple ? ref(t, 0) : null }, t);
        break;
      }
      case "trange": {
        const u = g[2]!.toLowerCase(), f = u === "h" ? 3600 : (u === "min" || u === "'") ? 60 : 1;
        if (c && c.sec == null && c.reps == null && !c.work) { c.sec = +g[0]! * f; c.sec2 = +g[1]! * f; } else newScheme({ sets: null, sec: +g[0]! * f, sec2: +g[1]! * f }, t);
        break;
      }
      case "dist": {
        const d = toN(g[0]!) * (/k/i.test(g[1]!) ? 1000 : 1);
        if (c && c.dist == null && c.reps == null) c.dist = d; else newScheme({ sets: null, dist: d }, t);
        break;
      }
      case "load": addLoad(t, 1, g[1]!, g[2], g[0]); break;
      case "atload": addLoad(t, 0, g[0]!, g[1]); break;
      case "bare": {
        const v = toN(g[0]!);
        const atStart = !c && /^\s*(?:[A-H]\d?\s*[-–:.)]\s*)?$/.test(raw.slice(0, t.start)) && /^\s+[a-zà-ÿ]/i.test(raw.slice(t.end)) && !/[.,]/.test(g[0]!);
        if (atStart) newScheme({ sets: null, reps: g[0] }, t); // « 20 crunchs » : des reps, pas une charge
        else if (v >= 20 || /[.,]/.test(g[0]!) || (c && c.items.length)) addLoad(t, 0, g[0]!, g[1]);
        else if (!c) newScheme({ sets: null, reps: g[0] }, t);
        else if (c.reps == null && c.sec == null && c.dist == null) c.reps = g[0];
        else out.ok = false;
        break;
      }
    }
  }

  // série par série, dans l'ordre écrit
  for (const sc of out.schemes) {
    const range = sc.items.filter(x => x.rangeStart || x.rangeEnd);
    if (range.length === 2) sc.range = range;
    const rest = sc.items.filter(x => !x.rangeStart && !x.rangeEnd);
    const singles = rest.filter(x => x.kind === "single"), used = rest.filter(x => x.kind === "sub").reduce((a, x) => a + (x.n ?? 0), 0);
    const left = Math.max(singles.length, (sc.sets || 0) - used);
    let seen = 0;
    for (const x of rest) {
      x.scheme = sc;
      if (x.kind === "sub") { out.entries.push({ n: x.n ?? 1, load: x.v, item: x }); continue; }
      seen++;
      const whole = singles.length === 1 && !used && !!sc.sets;
      x.n = whole ? sc.sets! : (seen === singles.length ? Math.max(1, left - (singles.length - 1)) : 1);
      x.nFromScheme = whole;
      out.entries.push({ n: x.n, load: x.v, plus: x.plus, item: x });
    }
  }

  const bareName = out.name.replace(/^[A-H]\d?\s*[-–:.)]\s*/, "").replace(new RegExp(FORMAT_RE.source, "gi"), "").replace(/[\s:,-]/g, "");
  out.header = out.ok && (/:\s*$/.test(raw) || (FORMAT_RE.test(raw) && !bareName && !out.entries.length && out.schemes.length > 0));
  // deux exos collés sans « + » (« Hs FS 120 Back Squat - 3x3 ») : on ne sait pas à quoi appliquer la décision
  const glued = out.schemes.some((sc, i) => {
    const prev = out.schemes[i - 1];
    if (i === 0 || !sc.tok || !sc.sets || prev.sets || !prev.items.length) return false;
    const lastRef = prev.items[prev.items.length - 1].ref;
    return /[a-zà-ÿ]{3,}/i.test(raw.slice(lastRef ? lastRef.t.end : 0, sc.tok.start)) && !/[+,]/.test(raw.slice(0, sc.tok.start));
  });
  out.ambiguous = !out.ok || glued || (!/[:,]/.test(out.name) && /\b([2-9]\d|\d{3,})\s+[a-zà-ÿ]/i.test(out.name.replace(/\([^)]*\)/g, "")));
  out.kind = !out.ok ? "fallback" : (out.schemes.length || out.rpe || out.pct != null || out.extras.length ? "full" : "nameOnly");
  return out;
}

/** Modifications à appliquer : par token, soit « remove », soit { index de groupe → nouveau texte }. */
export type LineEdits = Map<Token, "remove" | Record<number, string>>;

/** Réécrit la ligne en ne touchant qu'aux chiffres modifiés ; tout le reste est recopié tel quel. */
export function rewriteLine(p: ParsedLine, edits: LineEdits): string {
  let s = "", last = 0;
  for (const t of p.toks) {
    s += p.raw.slice(last, t.start);
    last = t.end;
    const e = edits.get(t);
    if (e === "remove") { s = s.replace(/[\s,;]*$/, ""); continue; }
    if (!e) { s += t.src; continue; }
    let src = t.src;
    Object.keys(e).map(Number)
      .filter(gi => t.gi[gi])
      .sort((a, b) => t.gi[b]![0] - t.gi[a]![0])
      .forEach(gi => { const [a, b] = t.gi[gi]!; src = src.slice(0, a) + e[gi] + src.slice(b); });
    s += src;
  }
  s += p.raw.slice(last);
  return s.replace(/[ \t]{2,}/g, " ").replace(/^\s+|\s+$/g, "").replace(/\s*\+\s*$/, "").replace(/\+\s*\+/g, "+");
}
