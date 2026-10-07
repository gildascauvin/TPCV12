/* Nettoyage des notes de séance (2026-10-07, chantier parseur + leviers) :
   1. supprime les lignes « Difficulté cible : N » (ancien OnboardingFlow, la valeur est déjà dans
      target_difficulty) ;
   2. réécrit les blocs génériques des anciens historiques de démo en lignes lisibles, les consignes
      étant rattachées à leur exercice entre parenthèses (affichées comme notes, jamais ajustées) ;
   3. corrige une ligne de modèle mal lue (médecine-ball).
   Tables : sessions, coach_sessions, programs (template JSON). Une séance qui a des médias attachés
   (exercise_media indexé par numéro de ligne) n'est JAMAIS touchée si son nombre de lignes change.
   Usage : node scripts/migrate-session-notes-cleanup.mjs [--apply]  (sans --apply : dry run)
   Sauvegarde écrite avant toute écriture : scripts/backup-session-notes-<date>.json (gitignored). */
import fs from "node:fs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=") && !l.startsWith("#")).map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) throw new Error("clés Supabase manquantes");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const APPLY = process.argv.includes("--apply");

const DIFF_RE = /^\s*difficult[ée] cible\s*:\s*\d+\s*$/i;
const BLOCKS = [
  [["Bloc principal technique", "3–5 séries propres", "Difficulté maîtrisée"], ["Bloc principal technique (3–5 séries propres, difficulté maîtrisée)"]],
  [["Travail continu modéré", "Volume progressif", "Respiration contrôlée", "Récupération active entre séries"], ["Travail continu modéré (volume progressif, respiration contrôlée, récupération active entre séries)"]],
  [["Travail continu modéré", "Volume progressif", "Respiration contrôlée"], ["Travail continu modéré (volume progressif, respiration contrôlée)"]],
  [["Mouvements de base", "Core 3 séries", "Prévention blessures", "Band work mobilité"], ["Mouvements de base (prévention blessures)", "Gainage 3 séries", "Mobilité avec élastique"]],
  [["Mouvements de base", "Core", "Prévention blessures"], ["Mouvements de base (prévention blessures)", "Gainage"]],
  [["4x30m lancé", "Récup complète 4–5 min", "Qualité > volume", "Analyse foulée si possible"], ["Sprint lancé 4x30m (récup complète 4–5 min, qualité > volume, analyse de foulée si possible)"]],
  [["4x30m lancé", "Récup complète 4–5 min", "Qualité > volume"], ["Sprint lancé 4x30m (récup complète 4–5 min, qualité > volume)"]],
  [["Front squat 3x3", "Difficulté cible contrôlée"], ["Front squat 3x3 (difficulté contrôlée)"]],
];
const LINE_FIX = { "Lancer médecine-ball 3kg assis technique — 4×8": "Lancer médecine-ball assis technique — 4×8 @ 3kg" };

function transform(notes) {
  if (!notes) return notes;
  let lines = notes.split("\n").filter(l => !DIFF_RE.test(l)).map(l => LINE_FIX[l.trim()] ?? l);
  for (const [from, to] of BLOCKS) {
    for (let i = 0; i + from.length <= lines.length; i++) {
      if (from.every((f, k) => lines[i + k].trim() === f)) { lines.splice(i, from.length, ...to); i += to.length - 1; }
    }
  }
  return lines.join("\n");
}
const hasMedia = m => m && typeof m === "object" && Object.keys(m).length > 0;
const nLines = s => (s ?? "").split("\n").length;

async function get(path) { const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H }); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); }
async function patch(table, id, body) {
  const r = await fetch(`${URL}/rest/v1/${table}?id=eq.${id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${table} ${id}: ${r.status} ${await r.text()}`);
}
const OR = "or=(notes.ilike.*Difficult*cible*,notes.ilike.*Bloc principal technique*,notes.ilike.*Travail continu modéré*,notes.ilike.*Mouvements de base*,notes.ilike.*4x30m lancé*,notes.ilike.*médecine-ball 3kg*)";
async function all(table, select) {
  const out = []; for (let from = 0; ; from += 1000) { const rows = await get(`${table}?select=${select}&${OR}&order=id&offset=${from}&limit=1000`); out.push(...rows); if (rows.length < 1000) break; } return out;
}

const report = { sessions: 0, coach_sessions: 0, programs: 0, skippedMedia: [] };
const backup = { sessions: [], coach_sessions: [], programs: [] };
const plan = [];
for (const table of ["sessions", "coach_sessions"]) {
  for (const r of await all(table, "id,notes,exercise_media")) {
    const next = transform(r.notes);
    if (next === r.notes) continue;
    if (hasMedia(r.exercise_media) && nLines(next) !== nLines(r.notes)) { report.skippedMedia.push(`${table}:${r.id}`); continue; }
    backup[table].push({ id: r.id, notes: r.notes }); plan.push([table, r.id, { notes: next }]); report[table]++;
  }
}
// programs : toutes les séances de tous les modèles (filtre texte côté JS, template JSON)
const progs = []; for (let from = 0; ; from += 500) { const rows = await get(`programs?select=id,name,template&order=id&offset=${from}&limit=500`); progs.push(...rows); if (rows.length < 500) break; }
for (const p of progs) {
  if (!p.template?.weeks) continue;
  let changed = false, blocked = false;
  const weeks = p.template.weeks.map(w => Object.fromEntries(Object.entries(w).map(([day, list]) => [day, Array.isArray(list) ? list.map(s => {
    const next = transform(s.notes);
    if (next === s.notes) return s;
    if (hasMedia(s.exercise_media) && nLines(next) !== nLines(s.notes)) { blocked = true; return s; }
    changed = true; return { ...s, notes: next };
  }) : list])));
  if (blocked) report.skippedMedia.push(`programs:${p.id}`);
  if (!changed) continue;
  backup.programs.push({ id: p.id, template: p.template }); plan.push(["programs", p.id, { template: { ...p.template, weeks } }]); report.programs++;
}

console.log(APPLY ? "APPLY" : "DRY RUN", JSON.stringify(report));
const ex = plan.find(([t]) => t === "sessions"); if (ex) console.log("ex. sessions →", JSON.stringify(ex[2].notes));
const exc = plan.find(([t]) => t === "coach_sessions"); if (exc) console.log("ex. coach →", JSON.stringify(exc[2].notes));
if (process.argv.includes("--samples")) { const seen = new Set(); for (const [t, , b] of plan) { const k = (b.notes ?? "").split("\n")[0]; if (b.notes && /\(/.test(b.notes) && !seen.has(t + k)) { seen.add(t + k); console.log(t, "→", JSON.stringify(b.notes)); } } }
if (!APPLY) process.exit(0);
const file = `scripts/backup-session-notes-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`;
fs.writeFileSync(file, JSON.stringify(backup)); console.log("sauvegarde :", file);
let done = 0, failed = 0;
for (let i = 0; i < plan.length; i += 20) {
  const res = await Promise.allSettled(plan.slice(i, i + 20).map(([t, id, body]) => patch(t, id, body)));
  res.forEach(r => r.status === "fulfilled" ? done++ : (failed++, console.error(r.reason.message)));
}
console.log(`écrit ${done}, échecs ${failed}`);
