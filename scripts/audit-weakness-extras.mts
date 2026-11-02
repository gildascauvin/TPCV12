/* Audit des points faibles du générateur de programmes (2026-11-02).
   Pour chaque sport du catalogue × chaque point faible proposé (seul et par paires) × plusieurs
   jeux de jours/objectifs/durées, compare la séance générée AVEC le point faible à la même séance
   SANS, et relève :
   - doublon : une ligne ajoutée dont le mouvement est déjà dans la séance (même famille) ;
   - nue : une ligne ajoutée en séries×reps sans charge ni réserve sur une séance chargée ;
   - invisible : le point faible n'ajoute rien de toute la semaine.
   Lancer (Node 22) : npx -y tsx scripts/audit-weakness-extras.mts */
import { POST } from "../src/app/api/programs/generate/route.ts";
import { SPORT_CATALOG, weaknessKeyFor } from "../src/lib/sportCatalog.ts";
import { WEAKNESSES_BY_SPORT } from "../src/lib/sportCategories.ts";
import { movementFamily } from "../src/lib/movementFamily.ts";

const SPORTS: string[] = [
  ...SPORT_CATALOG.map((e: any) => e.value),
  "Powerlifting — Spécialisation Squat", "Powerlifting — Spécialisation Bench", "Powerlifting — Spécialisation Deadlift",
];
const DAY_SETS = [["Lun"], ["Lun", "Jeu"], ["Lun", "Mer", "Ven"], ["Lun", "Mar", "Jeu", "Ven"], ["Lun", "Mar", "Mer", "Ven", "Sam"], ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"], ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]];
const FOCUS = ["mixte", "volume", "intensite", "competition"];
const DURATIONS = [6, 16];

async function gen(sport: string, days: string[], focus: string, duration: number, weaknesses: string[]) {
  const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ sport, level: "intermediaire", days, duration, focus, weaknesses }) }));
  return ((await res.json()) as any).template;
}
const lines = (notes: string) => notes.split("\n").map(l => l.trim()).filter(Boolean);
const LOADED = /@\d+%|en réserve|effort|\(/;

type Issue = { kind: string; sport: string; weak: string; ctx: string; line: string; session: string };
const issues: Issue[] = [];
let combos = 0;

for (const sport of SPORTS) {
  const opts: string[] = (WEAKNESSES_BY_SPORT[weaknessKeyFor(sport)] ?? []).map((o: any) => o.key);
  const sets: string[][] = [...opts.map(k => [k]), ...opts.flatMap((a, i) => opts.slice(i + 1).map(b => [a, b]))];
  for (const days of DAY_SETS) for (const focus of FOCUS) for (const duration of DURATIONS) {
    const base = await gen(sport, days, focus, duration, []);
    for (const weak of sets) {
      combos++;
      const t = await gen(sport, days, focus, duration, weak);
      const ctx = `${days.length}j ${focus} ${duration}s`;
      let addedAnywhere = 0;
      t.weeks.forEach((week: any, w: number) => {
        let addedThisWeek = 0;
        for (const day of Object.keys(week)) {
          const s = week[day][0], b = base.weeks[w][day]?.[0];
          const l = lines(s.notes);
          // Lignes ajoutées = lignes en plus en fin de séance par rapport à la même séance sans point faible.
          // Si le point faible a changé l'archétype du jour (niveau 1), on ne compare pas les lignes.
          if (!b || b.name !== s.name) continue;
          const bl = lines(b.notes);
          if (l.slice(0, bl.length).join("\n") !== bl.join("\n")) continue;
          const extra = l.slice(bl.length);
          addedThisWeek += extra.length;
          const fam = new Set(bl.map(movementFamily));
          for (const e of extra) {
            if (fam.has(movementFamily(e))) issues.push({ kind: "doublon", sport, weak: weak.join("+"), ctx, line: e, session: `${s.name} [${s.type}] S${w + 1}: ${bl.join(" | ")}` });
            fam.add(movementFamily(e));
            if ((s.type === "volume" || s.type === "intensite") && !/jump|saut|bond|sprint/i.test(e) && /—\s*\d+×\d+\s*(par .*)?$/.test(e) && !LOADED.test(e))
              issues.push({ kind: "nue", sport, weak: weak.join("+"), ctx, line: e, session: `${s.name} [${s.type}] S${w + 1}` });
          }
        }
        addedAnywhere += addedThisWeek;
      });
      if (!addedAnywhere && JSON.stringify(t) === JSON.stringify(base))
        issues.push({ kind: "invisible", sport, weak: weak.join("+"), ctx, line: "", session: "" });
    }
  }
}

const by = (k: string) => issues.filter(i => i.kind === k);
console.log(`${combos} combinaisons générées`);
for (const kind of ["doublon", "nue", "invisible"]) {
  const list = by(kind);
  const uniq = new Map<string, Issue>();
  for (const i of list) uniq.set(`${i.sport}|${i.weak}|${i.line.split(" — ")[0]}`, i);
  console.log(`\n== ${kind} : ${list.length} séances, ${uniq.size} cas distincts sport×point faible×mouvement`);
  for (const i of [...uniq.values()].slice(0, Number(process.env.SHOW ?? 40))) console.log(`- ${i.sport} / ${i.weak} (${i.ctx}) → « ${i.line} » dans ${i.session}`);
}
