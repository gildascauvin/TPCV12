/* Audit des démos/illustrations sur les programmes générés (2026-10-22).
   Appelle le VRAI générateur (POST de src/app/api/programs/generate/route.ts, importé tel quel)
   sur toutes les catégories de sport × focus × nombre de jours × durées, puis passe chaque ligne
   de notes dans mediaForLine() (src/lib/exerciseDemos.ts) : demo / image / none.
   Lecture seule, aucune écriture en base.

   Usage : PATH=~/.nvm/versions/node/v22.23.3/bin:$PATH npx -y tsx scripts/audit-library-demos.mts [--out=fichier.txt]
*/
import { writeFileSync } from "fs";
import { POST, getSportCategory } from "../src/app/api/programs/generate/route";
import { mediaForLine } from "../src/lib/exerciseDemos";
import { parseLine } from "../src/lib/exerciseParser";

const OUT = process.argv.find(a => a.startsWith("--out="))?.slice(6);

// Un libellé de sport par catégorie du générateur (vérifié via getSportCategory ci-dessous).
const SPORTS = [
  "Haltérophilie", "Haltérophilie — Spécialisation Arraché", "Force/Powerlifting",
  "Powerlifting — Spécialisation Squat", "Powerlifting — Spécialisation Bench", "Powerlifting — Spécialisation Deadlift",
  "Musculation/Hypertrophie", "Explosivité", "Perte de poids", "Sprint", "Athlétisme — Sauts",
  "Sports de combat", "Fitness/CrossFit", "Fitness/Hyrox", "Calisthenics", "Football",
  "Course à pied", "Course à pied — 10k", "Course à pied — Semi-marathon", "Course à pied — Marathon",
  "Trail", "Triathlon", "Cyclisme", "Natation", "Ski", "Aviron", "Gymnastique",
  "Prevention/Reeducation — Cheville", "Prevention/Reeducation — Épaule", "Prevention/Reeducation — Genou",
  "Prevention/Reeducation — Genou rotulien", "Prevention/Reeducation — Genou LCA", "Prevention/Reeducation — Lombaire",
  "Prevention/Reeducation — Tendon d'Achille", "Prevention/Reeducation — Périostite", "Prevention/Reeducation",
  "Concours Gendarmerie", "Sapeur-pompier", "Armée TAP", "Police nationale", "GIGN",
  "Escalade", "Pliométrie", "Golf", "Équitation", "Hockey sur glace", "Baseball", "Voile", "BMX", "Tennis",
];
const FOCUSES = ["volume", "intensite", "competition", "mixte"];
const DURATIONS = [4, 6, 8, 12];
// Jours étalés et jours collés (les collés déclenchent la Phase B → repli sur les banques génériques).
const DAY_SETS: string[][] = [
  ["Mar", "Jeu"], ["Lun", "Mar"],
  ["Lun", "Mer", "Ven"], ["Lun", "Mar", "Mer"],
  ["Lun", "Mar", "Jeu", "Sam"], ["Lun", "Mer", "Ven", "Dim"],
  ["Lun", "Mar", "Mer", "Ven", "Sam"], ["Lun", "Mer", "Jeu", "Sam", "Dim"],
  ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"], ["Lun", "Mar", "Jeu", "Ven", "Sam", "Dim"],
];
const WEAKNESSES = ["jambes", "dos_bras", "pecs_epaules", "dos", "pectoraux", "epaules", "bras", "arrache", "epaule_jete",
  "mobilite", "vitesse", "endurance_vitesse", "endurance_fond", "explosivite", "technique", "technique_course",
  "recuperation", "cardio", "force_generale", "puissance", "gainage", "frappe"];

const cats = new Map<string, string>();
for (const s of SPORTS) cats.set(s, getSportCategory(s));

type Cls = "demo" | "image" | "none";
const memo = new Map<string, { cls: Cls; why: string }>();
function classify(line: string): { cls: Cls; why: string } {
  let r = memo.get(line);
  if (r) return r;
  const m = mediaForLine(line);
  if (m) r = { cls: m.kind === "demo" ? "demo" : "image", why: "" };
  else {
    const p = parseLine(line);
    r = { cls: "none", why: p.kind === "note" ? "note" : p.header ? "header" : "" };
  }
  memo.set(line, r);
  return r;
}

const counts: Record<Cls, number> = { demo: 0, image: 0, none: 0 };
const noneLines = new Map<string, { n: number; why: string; cats: Set<string> }>();
let programs = 0;

async function run(sport: string, focus: string, days: string[], duration: number, weaknesses: string[] = []) {
  const req = new Request("http://local/api/programs/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sport, level: "intermediaire", days, duration, focus, weaknesses }),
  });
  const res = await POST(req);
  if (!res.ok) throw new Error(`${sport} ${focus} ${duration} → ${res.status}`);
  const { template } = await res.json() as { template: { weeks: Record<string, { notes: string }[]>[] } };
  programs++;
  for (const week of template.weeks) for (const sessions of Object.values(week)) for (const s of sessions) {
    for (const raw of (s.notes ?? "").split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const c = classify(line);
      counts[c.cls]++;
      if (c.cls === "none") {
        const key = line.replace(/\d+/g, "#"); // regroupe les variantes de prescription
        const e = noneLines.get(key) ?? { n: 0, why: c.why, cats: new Set<string>() };
        e.n++; e.cats.add(cats.get(sport)!);
        noneLines.set(key, e);
      }
    }
  }
}

for (const sport of SPORTS) for (const focus of FOCUSES) for (const days of DAY_SETS) for (const d of DURATIONS) await run(sport, focus, days, d);
// Faiblesses : chaque faiblesse sur un échantillon de sports (ligne ajoutée = même banque partout).
for (const w of WEAKNESSES) for (const sport of ["Football", "Musculation/Hypertrophie", "Haltérophilie", "Tennis"]) await run(sport, "mixte", ["Lun", "Mer", "Ven"], 4, [w]);

const total = counts.demo + counts.image + counts.none;
const pct = (n: number) => (100 * n / total).toFixed(1) + " %";
const out: string[] = [];
out.push(`Audit démos — ${new Date().toISOString()}`);
out.push(`${programs} programmes générés, ${total} lignes, ${memo.size} lignes distinctes`);
out.push(`Catégories couvertes (${new Set(cats.values()).size}) : ${[...new Set(cats.values())].join(", ")}`);
out.push("");
out.push(`demo  : ${counts.demo} (${pct(counts.demo)})`);
out.push(`image : ${counts.image} (${pct(counts.image)})`);
out.push(`none  : ${counts.none} (${pct(counts.none)})`);
const distinctCls = { demo: 0, image: 0, none: 0 } as Record<Cls, number>;
for (const v of memo.values()) distinctCls[v.cls]++;
out.push(`(lignes distinctes : demo ${distinctCls.demo}, image ${distinctCls.image}, none ${distinctCls.none})`);
out.push("");
out.push(`Lignes "none" distinctes (chiffres → #), triées par occurrences : ${noneLines.size}`);
for (const [k, v] of [...noneLines.entries()].sort((a, b) => b[1].n - a[1].n)) {
  out.push(`${String(v.n).padStart(7)}  ${v.why ? `[${v.why}] ` : ""}${k}   {${[...v.cats].slice(0, 4).join(",")}${v.cats.size > 4 ? ",…" : ""}}`);
}
const text = out.join("\n");
if (OUT) writeFileSync(OUT, text);
console.log(text.split("\n").slice(0, 12).join("\n"));
