// Régénère les modèles OFFICIELS de la bibliothèque (programs.is_official_template = true) avec le
// VRAI générateur (src/app/api/programs/generate/route.ts, mode `libraryShape`), au lieu de la
// copie scripts/regenerate-library-periodization.mjs (en retard et qui ciblait is_public, donc
// aussi les programmes partagés par les utilisateurs). 2026-10-22, chantier démos d'exercices.
//
// sport / level / weeks_count lus en base, jours = clés de la semaine 1 actuelle. Rapport : part de
// lignes avec démo / image avant → après, et un extrait avant/après par programme.
//
//   PATH=~/.nvm/versions/node/v22.23.3/bin:$PATH npx -y tsx --env-file=.env.local scripts/regenerate-library-from-generator.mts            (dry-run)
//   ... --apply      (écrit, après sauvegarde JSON des templates actuels dans scripts/)
//   ... --only=Hyrox (filtre sur le nom)
import { writeFileSync } from "fs";
import { POST } from "../src/app/api/programs/generate/route.ts";
import { mediaForLine } from "../src/lib/exerciseDemos.ts";

const APPLY = process.argv.includes("--apply");
const ONLY = process.argv.find(a => a.startsWith("--only="))?.slice(7).toLowerCase();
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const DAY_ORDER = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type Sess = { name?: string; notes?: string | null };
type Tpl = { weeks: Record<string, Sess[]>[] };

function lines(t: Tpl): string[] {
  return t.weeks.flatMap(w => Object.values(w).flat()).flatMap(s => (s.notes ?? "").split("\n")).map(l => l.trim()).filter(Boolean);
}
function stats(t: Tpl) {
  const ls = lines(t); let demo = 0, image = 0;
  for (const l of ls) { const m = mediaForLine(l); if (m?.kind === "demo") demo++; else if (m?.kind === "image") image++; }
  return { n: ls.length, demo, image };
}
const pct = (a: number, n: number) => n ? Math.round(100 * a / n) + "%" : "-";

const res = await fetch(`${URL_}/rest/v1/programs?is_official_template=eq.true&select=id,name,sport,level,weeks_count,template&order=name`, { headers: H });
const programs = (await res.json()) as { id: string; name: string; sport: string; level: string; weeks_count: number; template: Tpl }[];
const todo = programs.filter(p => !ONLY || p.name.toLowerCase().includes(ONLY));
console.log(`${programs.length} modèles officiels, ${todo.length} traités${APPLY ? " — ÉCRITURE" : " — dry-run"}\n`);

if (APPLY) {
  const file = `scripts/library-templates-backup-demos-${Date.now()}.json`;
  writeFileSync(file, JSON.stringify(todo.map(p => ({ id: p.id, name: p.name, template: p.template }))));
  console.log(`Sauvegarde : ${file}\n`);
}

let before = { n: 0, demo: 0, image: 0 }, after = { n: 0, demo: 0, image: 0 };
const skipped: string[] = [];
for (const p of todo) {
  const ok = p.weeks_count && (p.weeks_count === 6 || p.weeks_count % 4 === 0);
  const days = Object.keys(p.template?.weeks?.[0] ?? {}).filter(d => DAY_ORDER.includes(d)).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  if (!ok || !days.length) { skipped.push(`${p.name} (${p.weeks_count} sem., ${days.length} j)`); continue; }
  const r = await POST(new Request("http://local/api/programs/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sport: p.sport, level: p.level || "intermediaire", days, duration: p.weeks_count, focus: "mixte", libraryShape: true }),
  }));
  if (!r.ok) { skipped.push(`${p.name} : générateur ${r.status} ${await r.text()}`); continue; }
  const json = await r.json() as { template?: Tpl } & Tpl;
  const tpl: Tpl = json.template ?? json;
  const b = stats(p.template), a = stats(tpl);
  for (const k of ["n", "demo", "image"] as const) { before[k] += b[k]; after[k] += a[k]; }
  console.log(`- ${p.name} [${p.sport}] ${p.weeks_count} sem. ${days.join("/")} : démo ${pct(b.demo, b.n)} → ${pct(a.demo, a.n)}, image ${pct(b.image, b.n)} → ${pct(a.image, a.n)}`);
  const s0 = Object.values(p.template.weeks[0]).flat()[0], s1 = Object.values(tpl.weeks[0]).flat()[0];
  if (s0 && s1) console.log(`    avant : ${s0.name} | ${(s0.notes ?? "").split("\n").slice(0, 4).join(" · ")}\n    après : ${s1.name} | ${(s1.notes ?? "").split("\n").slice(0, 4).join(" · ")}`);
  if (APPLY) {
    const w = await fetch(`${URL_}/rest/v1/programs?id=eq.${p.id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ template: tpl }) });
    if (!w.ok) console.log(`    ÉCHEC écriture ${w.status} ${await w.text()}`);
  }
}
console.log(`\nTotal lignes : démo ${pct(before.demo, before.n)} → ${pct(after.demo, after.n)} · image ${pct(before.image, before.n)} → ${pct(after.image, after.n)} · rien ${pct(before.n - before.demo - before.image, before.n)} → ${pct(after.n - after.demo - after.image, after.n)}`);
if (skipped.length) console.log(`Non traités (${skipped.length}) :\n  ` + skipped.join("\n  "));
