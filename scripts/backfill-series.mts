/* Rattrapage des séries (2026-11-01) : les programmes et Planning d'avant la fonctionnalité sont
   marqués UNE FOIS avec la même règle que le générateur (sessionSeries.seriesFromRepeats) :
   même nom + même jour dans au moins 2 semaines = une série.
   - programs.template : series_id posé sur les séances qui reviennent (modèles publics compris).
   - sessions / coach_sessions d'un programme assigné, non faites : regroupées par assignation +
     jour de la semaine + nom ; series_id = `<série du modèle>:<assignation>` (même forme que
     l'assignation et la resynchro), ou un nouvel identifiant si le modèle n'en a pas.
   Dry-run par défaut ; --apply écrit, après sauvegarde JSON dans ~/Desktop/theperfclub-backups/.
   Usage : PATH=~/.nvm/versions/node/v22.23.3/bin:$PATH npx -y tsx --env-file=.env.local scripts/backfill-series.mts [--apply] */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { seriesFromRepeats, newSeriesId } from "../src/lib/sessionSeries.ts";
import { sessionKey } from "../src/lib/propagateSessionEdit.ts";
import type { ProgramTemplate, SessionTemplate } from "../src/types/index.ts";

const APPLY = process.argv.includes("--apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const dayOf = (iso: string) => DAYS[new Date(iso + "T12:00:00Z").getUTCDay()];

async function readAll<T>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await q(a, a + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function main() {
  // ── 1. Programmes ──────────────────────────────────────────────────────────
  const programs = await readAll<{ id: string; name: string; is_public: boolean | null; template: ProgramTemplate }>((a, b) =>
    db.from("programs").select("id, name, is_public, template").order("id").range(a, b) as never);
  const progChanges: { id: string; name: string; isPublic: boolean; before: ProgramTemplate; after: ProgramTemplate; series: number }[] = [];
  // (programme, jour, nom) → série du modèle, pour relier ensuite les Planning
  const tplSeries = new Map<string, string>();
  for (const p of programs) {
    if (!p.template?.weeks?.length) continue;
    const after = seriesFromRepeats(p.template);
    const ids = new Set<string>();
    after.weeks.forEach(w => Object.entries(w).forEach(([day, list]) => ((list ?? []) as SessionTemplate[]).forEach(s => {
      if (!s.series_id) return;
      ids.add(s.series_id);
      tplSeries.set(`${p.id}|${day}|${sessionKey(s.name)}`, s.series_id);
    })));
    if (after !== p.template && ids.size) progChanges.push({ id: p.id, name: p.name, isPublic: !!p.is_public, before: p.template, after, series: ids.size });
  }

  // ── 2. Planning (séances non faites issues d'un programme assigné) ─────────
  const assignments = await readAll<{ id: string; program_id: string }>((a, b) => db.from("program_assignments").select("id, program_id").order("id").range(a, b) as never);
  const progOf = new Map(assignments.map(a => [a.id, a.program_id]));
  type Row = { id: string; date: string; name: string; program_assignment_id: string; series_id: string | null };
  const planChanges: { table: "sessions" | "coach_sessions"; seriesId: string; ids: string[]; label: string }[] = [];
  for (const table of ["sessions", "coach_sessions"] as const) {
    const rows = await readAll<Row>((a, b) => db.from(table).select("id, date, name, program_assignment_id, series_id")
      .not("program_assignment_id", "is", null).eq("done", false).is("series_id", null).order("id").range(a, b) as never);
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const k = `${r.program_assignment_id}|${dayOf(r.date)}|${sessionKey(r.name)}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    for (const [k, list] of groups) {
      if (list.length < 2) continue;
      const [aid, day, nk] = k.split("|");
      const tpl = tplSeries.get(`${progOf.get(aid)}|${day}|${nk}`);
      planChanges.push({ table, seriesId: `${tpl ?? newSeriesId()}:${aid}`, ids: list.map(r => r.id), label: `${list[0].name} · ${day} ×${list.length}` });
    }
  }

  // ── Rapport ─────────────────────────────────────────────────────────────────
  const seriesCount = progChanges.reduce((a, c) => a + c.series, 0);
  console.log(`Programmes : ${progChanges.length}/${programs.length} modifiés (${progChanges.filter(c => c.isPublic).length} modèles publics), ${seriesCount} séries`);
  progChanges.slice(0, 8).forEach(c => console.log(`  - ${c.isPublic ? "[public] " : ""}${c.name} : ${c.series} séries`));
  for (const table of ["sessions", "coach_sessions"] as const) {
    const ch = planChanges.filter(c => c.table === table);
    console.log(`${table} : ${ch.length} séries, ${ch.reduce((a, c) => a + c.ids.length, 0)} séances`);
    ch.slice(0, 6).forEach(c => console.log(`  - ${c.label}`));
  }

  if (!APPLY) { console.log("\nDry-run : rien n'a été écrit. Relancer avec --apply."); return; }

  // ── Sauvegarde puis écriture ─────────────────────────────────────────────────
  const dir = join(homedir(), "Desktop", "theperfclub-backups");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `series-backfill-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({
    programs: progChanges.map(c => ({ id: c.id, template: c.before })),
    sessions: planChanges.filter(c => c.table === "sessions").flatMap(c => c.ids),
    coach_sessions: planChanges.filter(c => c.table === "coach_sessions").flatMap(c => c.ids),
  }));
  console.log(`Sauvegarde : ${file}`);

  let okP = 0, okS = 0;
  for (const c of progChanges) {
    const { error } = await db.from("programs").update({ template: c.after }).eq("id", c.id);
    if (error) { console.error("programme", c.id, error.message); continue; }
    okP++;
  }
  for (const c of planChanges) {
    const { error } = await db.from(c.table).update({ series_id: c.seriesId }).in("id", c.ids).eq("done", false);
    if (error) { console.error(c.table, c.label, error.message); continue; }
    okS += c.ids.length;
  }
  console.log(`Écrit : ${okP} programmes, ${okS} séances.`);
}

main().catch(e => { console.error(e); process.exit(1); });
