/* Démos et illustrations des lignes d'exercice (2026-10-22).
   - Démo = vidéo YouTube de la bibliothèque Catalyst Athletics (src/data/catalystDemos.json : 624
     exercices scrapés sur catalystathletics.com/exercises/, noms traduits en FR + alias). Un
     complexe (« Arraché + Épaulé-jeté ») donne une démo par mouvement, sauf si Catalyst a le
     complexe entier (« Clean & Jerk »).
   - Illustration = image fixe (clips du TPC Studio et couvertures des programmes, réduites dans
     public/illustrations) pour ce qui n'est pas un mouvement à montrer : endurance, pratique du
     sport, mobilité, récupération.
   Règles : le terme le plus long gagne (comme exerciseBank) ; jamais de démo sur une ligne
   d'échauffement/cardio/technique/test sauf si le nom de la démo y est écrit en entier (sinon
   « Mobilité épaules » prenait la démo du Hip Clean, épaule/épaulé se confondant sans accents). */
import data from "@/data/catalystDemos.json";
import { parseLine } from "@/lib/exerciseParser";
import { bestExerciseMatch } from "@/lib/exerciseBank";

export interface DemoEntry { id: number; en: string; fr: string; aliases: string[]; base: boolean; yt: string; section: string | null }
export interface DemoItem { label: string; yt: string; title: string; entryId: number; /** Démo proposée par défaut quand la personne en a choisi une autre (clé du choix). */ defaultId?: number }
export type LineMedia =
  | { kind: "demo"; items: DemoItem[]; key: string }
  | { kind: "image"; src: string; label: string; key: string };

const ENTRIES = data as DemoEntry[];

const norm = (s: string) => " " + s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9&]+/g, " ").trim()
  .split(" ").map(w => w.length > 3 && /[sx]$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w).join(" ") + " ";

const TERMS: { t: string; e: DemoEntry }[] = [];
for (const e of ENTRIES) for (const a of [e.en, e.fr, ...e.aliases]) {
  const t = norm(a);
  if (t.trim().length >= 2) TERMS.push({ t, e });
}
TERMS.sort((a, b) => b.t.length - a.t.length);

/* Illustrations : mots-clés (normalisés) → image. Le mot-clé le plus long gagne. */
const ILLUS: { keys: string[]; src: string; label: string }[] = [
  { keys: ["footing", "course a pied", "course", "jogging", "run", "endurance fondamentale", "zone 2", "z2", "sortie longue", "fractionne", "vma", "seuil", "allure", "fartlek", "tempo run", "marche active", "marche"], src: "course", label: "Course à pied" },
  { keys: ["trail", "en cote", "denivele"], src: "trail", label: "Trail" },
  { keys: ["echauffement", "warm up", "activation", "gamme"], src: "echauffement", label: "Échauffement" },
  { keys: ["sprint", "acceleration", "depart", "vitesse", "lance", "montee de genou", "talons fesse", "skipping", "changement de direction", "navette", "agilite", "echelle"], src: "sprint", label: "Sprint" },
  { keys: ["velo", "cyclisme", "home trainer", "spinning", "assault bike", "air bike", "bike"], src: "velo", label: "Vélo" },
  { keys: ["natation", "nage", "crawl", "brasse", "piscine"], src: "natation", label: "Natation" },
  { keys: ["rameur", "aviron", "ergo", "rower", "rowing machine"], src: "aviron", label: "Rameur" },
  { keys: ["ski", "skierg"], src: "ski", label: "Ski" },
  { keys: ["escalade", "grimpe", "bloc", "voie", "pan", "poutre", "hangboard", "suspension"], src: "escalade", label: "Escalade" },
  { keys: ["boxe", "sparring", "shadow", "sac de frappe", "pao", "assaut", "frappe"], src: "boxe", label: "Boxe" },
  { keys: ["mma", "grappling", "lutte"], src: "mma", label: "Combat" },
  { keys: ["judo", "randori", "uchi komi", "kata", "jjb"], src: "judo", label: "Judo" },
  { keys: ["golf", "swing de golf"], src: "golf", label: "Golf" },
  { keys: ["voile", "navigation", "regate"], src: "voile", label: "Voile" },
  { keys: ["equitation", "cheval"], src: "equitation", label: "Équitation" },
  { keys: ["rugby", "placage", "melee"], src: "rugby", label: "Rugby" },
  { keys: ["handball"], src: "handball", label: "Handball" },
  { keys: ["basket", "basketball", "shoot", "dribble"], src: "basket", label: "Basket" },
  { keys: ["volley", "volleyball", "smash", "service"], src: "volley", label: "Volley" },
  { keys: ["hockey"], src: "hockey", label: "Hockey" },
  { keys: ["football", "foot", "passe", "jeu reduit", "jeux reduit", "match", "opposition", "effectif reduit", "tactique", "pressing", "conservation", "rondo", "toro", "finition", "atelier"], src: "collectif", label: "Sport collectif" },
  { keys: ["gymnastique", "acrobatie", "agre"], src: "gym", label: "Gymnastique" },
  { keys: ["wod", "metcon", "hyrox", "crossfit", "amrap", "emom", "for time", "chipper"], src: "crossfit", label: "Metcon" },
  { keys: ["circuit", "hiit", "tabata", "conditioning", "battle rope"], src: "circuit", label: "Circuit" },
  { keys: ["pliometrie", "plyo", "bondissement", "foulee bondissante", "rebond"], src: "pliometrie", label: "Pliométrie" },
  { keys: ["mobilite", "foam", "foam roller", "rouleau", "auto massage", "massage"], src: "mobilite", label: "Mobilité" },
  { keys: ["etirement", "stretching", "souplesse", "retour au calme"], src: "etirements", label: "Étirements" },
  { keys: ["yoga", "respiration", "relaxation", "meditation"], src: "yoga", label: "Yoga" },
  { keys: ["recuperation", "recup", "recup active", "hydratation"], src: "recuperation", label: "Récupération" },
  { keys: ["repos", "off"], src: "repos", label: "Repos" },
];
const ILLUS_TERMS = ILLUS.flatMap(il => il.keys.map(k => ({ t: norm(k), il }))).sort((a, b) => b.t.length - a.t.length);

const BLOCKED = new Set(["warm", "cardio", "skill", "test"]);

function cleanName(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/^\s*[A-H]\d?\s*[-–:.)]\s*/, "")
    .replace(/^(AMRAP|E\d?MOM|For time|Tabata|Superset|Drop set|Rest-pause|Cluster|Pyramide|Complexe?)\b\s*:?\s*/i, "")
    .trim();
}

/* « épaule » (l'articulation) et « épaulé » (le mouvement) s'écrivent pareil sans accents : on
   tranche sur l'accent quand il est tapé, sinon sur le contexte (rotation, mobilité, élastique…). */
const SHOULDER_CONTEXT = /(rotation|mobilit|etir|étir|elast|élast|externe|interne|coiffe|stretch|massage|amplitude|souplesse|ouverture)/i;
function disambiguateShoulder(name: string): string {
  return name.replace(/(?<![a-zà-ÿ])([eé])paules?(?![a-zà-ÿ])/gi, (m, e1) => {
    const anatomical = e1.toLowerCase() === "é" || SHOULDER_CONTEXT.test(name);
    return anatomical ? "shoulder" : m;
  });
}

export function bestDemo(raw: string): { t: string; e: DemoEntry } | null {
  const name = disambiguateShoulder(raw);
  const n = norm(name);
  const hit = TERMS.find(x => n.includes(x.t));
  if (!hit) return null;
  // Variante sans démo Catalyst : ne pas montrer le mouvement de base à la place.
  if (/ (gobelet|goblet) /.test(n) && !hit.t.includes("goblet") && !hit.t.includes("gobelet")) return null;
  if (/ (leg press|presse a cuisse|presse) /.test(n) && !/leg press|presse/.test(hit.t)) return null;
  const bank = bestExerciseMatch(name);
  if (bank && BLOCKED.has(bank.cat) && hit.t.trim().length < norm(bank.key).trim().length) return null;
  return hit;
}

function itemOf(e: DemoEntry): DemoItem {
  return { label: e.fr, yt: e.yt, title: e.en, entryId: e.id };
}

/** Démo(s) ou illustration d'une ligne d'exercice, ou null (picto). */
export function mediaForLine(text: string): LineMedia | null {
  if (!text.trim()) return null;
  const p = parseLine(text);
  if (p.kind === "note") return null;
  const name = cleanName(p.name || text);
  if (!name) return null;
  const parts = name.split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);

  const whole = bestDemo(name);
  if (parts.length > 1) {
    const each = parts.map(bestDemo);
    // Catalyst a le complexe entier (alias qui couvre plus que chaque mouvement seul) : une seule démo.
    const wholeCovers = whole && each.every(x => !!x && whole.t.includes(x.t) && whole.t.length > x.t.length);
    if (whole && wholeCovers) return { kind: "demo", items: [itemOf(whole.e)], key: norm(name).trim() };
    const items = each.filter((x): x is { t: string; e: DemoEntry } => !!x).map(x => itemOf(x.e));
    if (items.length) return { kind: "demo", items, key: norm(name).trim() };
  } else if (whole) {
    return { kind: "demo", items: [itemOf(whole.e)], key: norm(name).trim() };
  }

  const n = norm(name);
  const il = ILLUS_TERMS.find(x => n.includes(x.t));
  if (il) return { kind: "image", src: `/illustrations/${il.il.src}.jpg`, label: il.il.label, key: norm(name).trim() };
  return null;
}

/** Autres démos du même mouvement (même nom de base, variantes Catalyst) pour « Changer de démo ». */
export function alternativesFor(item: DemoItem, limit = 6): DemoItem[] {
  const self = ENTRIES.find(e => e.id === item.entryId);
  if (!self) return [item];
  const head = norm(self.en).trim().split(" ").slice(-2).join(" ");
  const alts = ENTRIES.filter(e => e.id !== self.id && norm(e.en).includes(" " + head + " "))
    .sort((a, b) => a.en.length - b.en.length).slice(0, limit - 1).map(itemOf);
  return [item, ...alts];
}

export function demoById(entryId: number): DemoItem | null {
  const e = ENTRIES.find(x => x.id === entryId);
  return e ? itemOf(e) : null;
}

export const ytThumb = (yt: string) => `https://i.ytimg.com/vi/${yt}/2.jpg`;
export const ytFrame = (yt: string) => `https://i.ytimg.com/vi/${yt}/hq2.jpg`;
