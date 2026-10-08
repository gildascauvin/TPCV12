// Correction ponctuelle 08/10/2026 : séances générées avant d729a34 qui empilaient les variantes
// d'une même séance (2 sorties longues, 4 benchmarks WOD...) ou affichaient "8×3@75% min".
// Garde UNE ligne par groupe interchangeable, ne touche à rien d'autre (modifs manuelles préservées).
// Usage : node scripts/fix-stacked-sessions-202610.mjs [--apply]
const GROUPS = [
  // Archétypes course
  ["Endurance fondamentale", "Sortie facile Z2", "Footing fondamental"],
  ["Seuil lactique", "Tempo au seuil", "Côtes au seuil"],
  ["Sortie longue endurance fondamentale", "Sortie longue progressive"],
  ["Fractionné 400m allure 5km", "Fractionné 1000m", "Fractionné 200m rapide"],
  ["Footing très facile", "Marche active", "Vélo doux"],
  // Banques génériques course / distances
  ["Sortie longue en endurance fondamentale", "Fartlek progressif"],
  ["Intervalles 400m allure 5km", "Seuil lactique : 20 min continu", "Côtes longues 6%", "Tempo run"],
  ["Endurance fondamentale Zone 2", "Sortie longue"],
  ["Fractionné 400m allure 10k", "Fractionné 1000m allure 10k", "Seuil : 15 min continu allure semi", "Tempo run allure 10k"],
  ["Fractionné 1000m allure semi", "Fractionné 2000m allure semi", "Seuil : 25 min continu allure semi", "Tempo run allure semi"],
  ["Fractionné 2000m allure marathon", "Tempo run allure marathon", "Seuil : 35 min continu", "Bloc marathon : 3×20 min allure cible (récup 3 min)"],
  ["Test VMA : demi-Cooper ou 6 min", "Course sur distance cible", "Test de seuil lactique", "Test : 5km chronométré", "Course sur 10k (objectif du bloc)",
   "Test : 10km chronométré", "Sortie longue à allure semi cible", "Sortie longue à allure marathon cible", "Test : semi-marathon chronométré"],
  // Vélo
  ["Sortie endurance Z2 (60-70% FCmax)", "Travail en côte progressive", "Intervalles doux : 2×20 min Z2/Z3"],
  ["Intervalles VO2max : 5×4 min à 110% FTP (récup 4 min)", "Montée longue : 2×15 min au seuil", "Pyramide puissance : 3-4-5-4-3 min"],
  ["Test FTP : 20 min à puissance max", "VO2max indirect : test 5 min"],
  // Natation
  ["Série de fond : 10×100m (récup 15s)", "Pyramide : 200-400-600-400-200m", "Nage alternée 4 nages"],
  ["Test 400m allure compétition", "Test VO2 : 3×300m progressif"],
  // Trail
  ["Sortie longue trail avec dénivelé modéré", "Sortie vallonnée D+400m", "Marche active en côte"],
  ["Répétitions de côtes : montée rapide", "Côtes longues D+ soutenu", "Descente technique rapide", "Fractionné vallonné"],
  ["Simulation course trail : distance + dénivelé cible", "Test : montée chronométrée sur une côte de référence"],
  // Triathlon
  ["Sortie vélo endurance Z2", "Sortie course endurance fondamentale", "Nage continue 4 nages"],
  ["Fractionné natation : 10×100m (récup 20s)", "Fractionné vélo : 6×4 min à 105% FTP (récup 3 min)", "Fractionné course : 6×1000m allure 10k (récup 2 min)", "Brick (enchaînement) : vélo 30 min + course 15 min"],
  ["Simulation triathlon format court (natation+vélo+course enchaînés)", "Test : 1000m natation chronométré", "Test FTP vélo : 20 min à puissance max", "Test : 5km course chronométré"],
  // Tests
  ["Simulation Hyrox complète : 8km course + 8 stations", "Test : 1km course chronométré"],
  ["Benchmark WOD : Fran (21-15-9 thrusters + tractions, for time)", "Benchmark WOD : Cindy (AMRAP 20 min : 5 tractions + 10 pompes + 15 squats)",
   "Benchmark WOD : Murph (1 mile course + 100 tractions + 200 pompes + 300 squats + 1 mile course)", "Benchmark WOD : Grace (30 épaulé-jeté for time)"],
  ["Simulation TAP : les 6 épreuves enchaînées", "Test Luc Léger : palier atteint"],
  ["Simulation SOG : Luc Léger + tractions + parcours Killy enchaînés", "Test Luc Léger : palier atteint"],
  ["Simulation PHM + TECR enchaînés", "Test TECR : palier atteint"],
  ["Simulation complète : natation 50m + PPA + Luc Léger", "Luc Léger : palier atteint"],
  ["Simulation sélection : parcours + natation contrainte + Luc Léger", "Test tractions/pompes max en 2 min"],
  ["Match de préparation", "Yo-Yo test ou équivalent"],
  ["Assaut de qualification", "Test endurance spécifique (rounds enchaînés)"],
];

const lineName = l => l.split(" — ")[0].trim();

export function fixNotes(notes, pick) {
  if (!notes) return notes;
  let lines = notes.split("\n").map(l => l
    .replace(/(\d+×\d+)@\d+% (min\b)/, "$1 $2")      // "8×3@75% min" → "8×3 min"
    .replace(/(\d+)×\d+@\d+% -20s/, "$1×15-20s"));    // "3×12@75% -20s" → "3×15-20s" (plage d'origine du L-sit)
  for (const g of GROUPS) {
    const idx = lines.map((l, i) => (g.includes(lineName(l)) ? i : -1)).filter(i => i >= 0);
    if (idx.length < 2) continue;
    const keep = idx[pick % idx.length];
    lines = lines.filter((_, i) => !idx.includes(i) || i === keep);
  }
  return lines.join("\n");
}

const isoWeek = d => Math.floor((Date.parse(d) / 86400000 + 3) / 7);

async function main() {
  const fs = await import("fs");
  const { createClient } = await import("@supabase/supabase-js");
  const env = Object.fromEntries(fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const apply = process.argv.includes("--apply");
  const today = new Date().toISOString().slice(0, 10);
  const backup = { programs: [], sessions: [], coach_sessions: [] };
  const samples = [];

  const all = async (q) => { const out = []; for (let f = 0; ; f += 1000) { const { data, error } = await q().range(f, f + 999); if (error) throw error; out.push(...data); if (data.length < 1000) return out; } };

  const programs = await all(() => db.from("programs").select("id, name, is_official_template, template"));
  for (const p of programs) {
    if (!p.template?.weeks) continue;
    let changed = false;
    const weeks = p.template.weeks.map((w, wi) => Object.fromEntries(Object.entries(w).map(([day, ss]) => [day, ss.map(s => {
      const notes = fixNotes(s.notes, wi);
      if (notes !== s.notes) { changed = true; if (samples.length < 12) samples.push([p.name, s.notes, notes]); }
      return { ...s, notes };
    })])));
    if (!changed) continue;
    backup.programs.push({ id: p.id, template: p.template });
    if (apply) { const { error } = await db.from("programs").update({ template: { ...p.template, weeks } }).eq("id", p.id); if (error) throw error; }
  }

  for (const table of ["sessions", "coach_sessions"]) {
    const rows = await all(() => db.from(table).select("id, date, notes, done").gte("date", today).eq("done", false));
    for (const r of rows) {
      const notes = fixNotes(r.notes, isoWeek(r.date));
      if (notes === r.notes) continue;
      backup[table].push({ id: r.id, notes: r.notes });
      if (apply) { const { error } = await db.from(table).update({ notes }).eq("id", r.id); if (error) throw error; }
    }
  }

  fs.writeFileSync(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "/tmp/fix-stacked-backup.json", JSON.stringify(backup));
  console.log(apply ? "APPLIQUÉ" : "DRY RUN", { programs: backup.programs.length, official: backup.programs.filter(b => programs.find(p => p.id === b.id)?.is_official_template).length, sessions: backup.sessions.length, coach_sessions: backup.coach_sessions.length });
  for (const [n, a, b] of samples.slice(0, 6)) console.log("\n#", n, "\n  AVANT:", a.replace(/\n/g, " / "), "\n  APRÈS:", b.replace(/\n/g, " / "));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
