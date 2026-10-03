import { WEAKNESSES_BY_SPORT, guessSportChip } from "@/lib/sportCategories";

/* Catalogue des sports proposés par les générateurs de séance et de programme (2026-10-03, POC
   https://claude.ai/artifact/RdwmSKtebsstSN4P1bwNzK). Une entrée = un contenu réellement différent
   côté générateur : `value` est envoyé tel quel à /api/programs/generate et doit router vers le bon
   curriculum via getSportCategory(). D'où une seule entrée « Sports collectifs » (foot, rugby…
   partagent le même curriculum, ils sont des synonymes) et pas de Tennis/Padel (aucun contenu dédié :
   la recherche les envoie à l'analyse IA). `aka` = synonymes trouvés par la recherche. */
export type SportEntry = { value: string; label: string; icon: string; fam: string; aka: string[] };

const E = (fam: string, value: string, label: string, icon: string, aka: string[] = []): SportEntry => ({ value, label, icon, fam, aka });

export const SPORT_CATALOG: SportEntry[] = [
  E("Force", "Haltérophilie", "Haltérophilie", "🏋️", ["arraché", "épaulé", "snatch", "clean"]),
  E("Force", "Powerlifting", "Powerlifting", "🦍", ["squat", "bench", "deadlift", "développé couché", "soulevé de terre"]),
  E("Force", "Musculation / Hypertrophie", "Musculation / Hypertrophie", "💪", ["prise de masse", "bodybuilding", "muscu"]),
  E("Force", "Calisthenics", "Calisthenics", "🤸", ["street workout", "tractions", "poids du corps"]),
  E("Force", "Puissance & explosivité", "Puissance & explosivité", "⚡", ["détente", "explosif"]),
  E("Force", "Pliométrie", "Pliométrie", "🦘", ["plyo", "pliometrie"]),
  E("Force", "Perte de poids", "Perte de poids", "🔥", ["sèche", "recomposition", "maigrir"]),
  E("Fitness", "Fitness / CrossFit", "Fitness / CrossFit", "🔥", ["crossfit", "wod", "cross-training", "fitness"]),
  E("Fitness", "Hyrox", "Hyrox", "🏁"),
  E("Endurance", "Endurance", "Course à pied", "👟", ["running", "10k", "semi", "marathon", "footing", "course"]),
  E("Endurance", "Trail", "Trail", "⛰️", ["ultra"]),
  E("Endurance", "Triathlon", "Triathlon", "🏊", ["ironman"]),
  E("Endurance", "Vélo / Cyclisme", "Vélo", "🚴", ["cyclisme", "vtt", "vélo de route"]),
  E("Endurance", "Natation", "Natation", "🏊", ["nage", "piscine"]),
  E("Endurance", "Aviron", "Aviron", "🚣", ["rameur"]),
  E("Endurance", "Ski", "Ski", "⛷️", ["ski de fond", "snowboard"]),
  E("Athlétisme", "Athlétisme & vitesse", "Athlétisme & vitesse", "🏃", ["sprint", "100m", "vitesse"]),
  E("Athlétisme", "Athlétisme — Sauts", "Sauts", "🦵", ["saut en longueur", "saut en hauteur", "triple saut"]),
  E("Sports collectifs", "Sports collectifs", "Sports collectifs", "👥", ["football", "foot", "rugby", "basket", "basketball", "handball", "volley", "volleyball"]),
  E("Sports collectifs", "Hockey sur glace", "Hockey sur glace", "🏒", ["hockey"]),
  E("Sports collectifs", "Baseball", "Baseball", "⚾", ["softball"]),
  E("Combat", "Arts martiaux & combat", "Arts martiaux & combat", "🥋", ["boxe", "mma", "judo", "karaté", "lutte", "jiu-jitsu", "kickboxing"]),
  E("Outdoor & précision", "Escalade", "Escalade", "🧗", ["bloc", "grimpe"]),
  E("Outdoor & précision", "Golf", "Golf", "⛳"),
  E("Outdoor & précision", "Voile", "Voile", "⛵", ["régate"]),
  E("Outdoor & précision", "BMX", "BMX", "🚲"),
  E("Outdoor & précision", "Équitation", "Équitation", "🏇", ["cheval", "cso"]),
  E("Outdoor & précision", "Gymnastique", "Gymnastique", "🤸", ["gym", "agrès"]),
  E("Rééducation", "Prevention/Reeducation — Cheville", "Cheville", "🦶", ["entorse"]),
  E("Rééducation", "Prevention/Reeducation — Genou", "Genou", "🦵", ["valgus"]),
  E("Rééducation", "Prevention/Reeducation — Genou LCA", "Genou · LCA", "🦵", ["ligament croisé", "croisé"]),
  E("Rééducation", "Prevention/Reeducation — Genou Rotulien", "Genou · rotulien", "🦵", ["tendinite rotulienne"]),
  E("Rééducation", "Prevention/Reeducation — Lombaire", "Lombaires", "🦴", ["dos", "lombalgie"]),
  E("Rééducation", "Prevention/Reeducation — Épaule", "Épaule", "🤷", ["coiffe des rotateurs"]),
  E("Rééducation", "Prevention/Reeducation — Tendon Achille", "Tendon d'Achille", "🩹", ["achille"]),
  E("Rééducation", "Prevention/Reeducation — Périostite", "Périostite", "🩹", ["tibia"]),
  E("Concours", "Police Nationale", "Police nationale", "👮", ["police"]),
  E("Concours", "Gendarmerie", "Gendarmerie", "🎖️", ["gendarme"]),
  E("Concours", "Sapeur-Pompier", "Sapeur-pompier", "🚒", ["pompier", "spp"]),
  E("Concours", "GIGN", "GIGN", "🎯"),
  E("Concours", "Armée de Terre — TAP", "Armée de terre · TAP", "🪖", ["armée", "militaire"]),
];

// Familles à 2 niveaux : leur entrée du panneau ouvre un 2e choix (la zone, le concours).
export const GROUPED_FAMILIES: Record<string, { icon: string; sub: string }> = {
  "Rééducation": { icon: "🩹", sub: "Zone" },
  "Concours": { icon: "🎖️", sub: "Concours" },
};

export const SPORT_FAMILIES = SPORT_CATALOG.map(s => s.fam).filter((f, i, a) => a.indexOf(f) === i);

// Les 8 cartes affichées par défaut (les plus fréquentes).
export const TOP_SPORTS = [
  "Haltérophilie", "Powerlifting", "Musculation / Hypertrophie", "Fitness / CrossFit",
  "Athlétisme & vitesse", "Sports collectifs", "Endurance", "Arts martiaux & combat",
];

export const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function catalogEntry(value: string | null | undefined): SportEntry | null {
  return value ? SPORT_CATALOG.find(s => s.value === value) ?? null : null;
}

/* Libellé affiché d'une entrée : « Rééducation · Genou », « Concours · GIGN », sinon son nom. */
export function entryLabel(e: SportEntry): string {
  return GROUPED_FAMILIES[e.fam] ? `${e.fam} · ${e.label}` : e.label;
}

/* Rattache un texte (sport du profil, programme…) à une entrée du catalogue : nom ou synonyme exact
   d'abord, puis contenu. null = aucune entrée, le texte reste du sport libre. */
export function findCatalogEntry(text: string | null | undefined): SportEntry | null {
  const f = fold(text ?? "").trim();
  if (f.length < 2) return null;
  const names = (s: SportEntry) => [s.value, s.label, ...s.aka].map(fold);
  return SPORT_CATALOG.find(s => names(s).includes(f))
    ?? SPORT_CATALOG.find(s => names(s).some(n => n.length >= 3 && (f.includes(n) || n.includes(f))))
    ?? null;
}

export type SportHit = { entry: SportEntry; hit: string };

/* Recherche instantanée (sans IA) : nom puis synonymes, début de mot avant milieu. */
export function searchSports(query: string, limit = 6): SportHit[] {
  const f = fold(query).trim();
  if (f.length < 2) return [];
  const out: (SportHit & { score: number })[] = [];
  for (const entry of SPORT_CATALOG) {
    let best: { hit: string; score: number } | null = null;
    for (const nm of [entry.label, ...entry.aka]) {
      const at = fold(nm).indexOf(f);
      if (at < 0) continue;
      const score = (fold(nm) === f ? -1 : 0) + (nm === entry.label ? 0 : 2) + (at === 0 ? 0 : 1);
      if (!best || score < best.score) best = { hit: nm, score };
    }
    if (best) out.push({ entry, ...best });
  }
  return out.sort((a, b) => a.score - b.score || a.entry.label.localeCompare(b.entry.label)).slice(0, limit);
}

/* Clé du menu « Points à travailler » pour une valeur du catalogue (les sports hors des 8 familles
   historiques prennent le menu de la famille la plus proche, sinon le générique). */
export function weaknessKeyFor(value: string | null | undefined): string {
  if (!value) return "Autre";
  if (WEAKNESSES_BY_SPORT[value]) return value;
  return guessSportChip(value) ?? "Autre";
}
