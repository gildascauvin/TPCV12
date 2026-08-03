// One-off : recalcule target_difficulty par séance (selon son type) pour les programmes publics
// (bibliothèque, is_public = true). Corrige le même bug que le fix de generate/route.ts, mais sur
// les templates déjà en base : avant ça, toutes les séances d'une même semaine partageaient
// exactement le même target_difficulty quel que soit leur type ("Récupération" = "Séance
// intensive" = même jauge). Ne touche jamais aux exercices/noms/notes, ni aux séances déjà
// assignées à de vrais sportifs (sessions/coach_sessions) — seulement programs.template pour
// is_public = true.
//
// Usage :
//   node --env-file=.env.local scripts/patch-library-difficulty.mjs            (dry-run, aucune écriture)
//   node --env-file=.env.local scripts/patch-library-difficulty.mjs --apply    (écrit réellement en base)
//
// Écrit toujours une sauvegarde horodatée des templates d'origine avant tout --apply.

import { writeFileSync, existsSync, readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");
const MARKER_FILE = "scripts/.library-difficulty-patched";

// Mêmes valeurs que TYPE_DIFF_OFFSET dans src/app/api/programs/generate/route.ts — à garder en synchro.
const TYPE_DIFF_OFFSET = {
  recuperation: -2,
  technique: -1,
  volume: 0,
  intensite: 1,
  test: 1,
};

function clamp(n) {
  return Math.max(1, Math.min(10, n));
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Variables manquantes — lance avec : node --env-file=.env.local scripts/patch-library-difficulty.mjs");
  process.exit(1);
}

// Appels REST directs (PostgREST) plutôt que le SDK @supabase/supabase-js : évite son client
// realtime, qui exige un WebSocket natif absent en Node 20 (voir erreur "Node.js 20 detected
// without native WebSocket support" sinon) — inutile de toute façon pour un simple select/update.
const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function fetchPublicPrograms() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/programs?is_public=eq.true&select=id,name,template`, {
    headers: restHeaders,
  });
  if (!res.ok) throw new Error(`Lecture échouée (${res.status}) : ${await res.text()}`);
  return res.json();
}

async function updateProgramTemplate(id, template) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/programs?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...restHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ template }),
  });
  if (!res.ok) throw new Error(`Écriture échouée (${res.status}) : ${await res.text()}`);
}

function patchTemplate(template) {
  let changed = 0;
  let skipped = 0;
  const examples = [];

  const weeks = (template.weeks || []).map((week) => {
    const newWeek = {};
    Object.keys(week).forEach((day) => {
      newWeek[day] = week[day].map((session) => {
        if (!session.type || !(session.type in TYPE_DIFF_OFFSET)) {
          skipped++;
          return session;
        }
        // La valeur actuelle est aujourd'hui identique pour toutes les séances de la semaine
        // (c'est le bug) — on la prend donc comme base ("weekDiff" d'origine) pour cette séance.
        const weekBase = session.target_difficulty;
        const next = clamp(weekBase + TYPE_DIFF_OFFSET[session.type]);
        if (next !== session.target_difficulty) {
          changed++;
          if (examples.length < 3) {
            examples.push(`${session.name} (${session.type}) : ${session.target_difficulty} → ${next}`);
          }
        }
        return { ...session, target_difficulty: next };
      });
    });
    return newWeek;
  });

  return { template: { ...template, weeks }, changed, skipped, examples };
}

async function main() {
  let programs;
  try {
    programs = await fetchPublicPrograms();
  } catch (e) {
    console.error("Erreur de lecture :", e.message);
    process.exit(1);
  }
  if (!programs || programs.length === 0) {
    console.log("Aucun programme public (is_public = true) trouvé.");
    return;
  }

  // Garde-fou : ce script N'EST PAS idempotent (il recalcule à partir de la valeur ACTUELLEMENT
  // stockée, donc le relancer sur des données déjà patchées décale une seconde fois — déjà arrivé
  // par erreur le 2026-08-03, corrigé via restore-from-backup.mjs). On refuse --apply si un marqueur
  // de patch déjà appliqué existe.
  if (APPLY && existsSync(MARKER_FILE)) {
    console.error(
      `\n⚠️  ${MARKER_FILE} existe déjà — ce script a déjà été appliqué le ${readFileSync(MARKER_FILE, "utf-8").trim()}.\n` +
      `Le relancer avec --apply décalerait une seconde fois des données déjà patchées. Supprime ce fichier volontairement si tu es sûr de vouloir forcer un nouveau passage.\n`
    );
    process.exit(1);
  }

  console.log(`${programs.length} programme(s) public(s) trouvé(s). Mode : ${APPLY ? "APPLY (écriture réelle en base)" : "DRY-RUN (aucune écriture)"}\n`);

  const backup = programs.map((p) => ({ id: p.id, name: p.name, template: p.template }));
  const backupFile = `scripts/library-templates-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`Sauvegarde des templates d'origine écrite dans ${backupFile}\n`);

  let totalChanged = 0;
  let totalSkipped = 0;

  for (const p of programs) {
    const { template: newTemplate, changed, skipped, examples } = patchTemplate(p.template);
    totalChanged += changed;
    totalSkipped += skipped;
    console.log(`- ${p.name} (${p.id})`);
    console.log(`  ${changed} séance(s) à modifier, ${skipped} ignorée(s) (type manquant/inconnu)`);
    examples.forEach((ex) => console.log(`  · ${ex}`));

    if (APPLY && changed > 0) {
      try {
        await updateProgramTemplate(p.id, newTemplate);
        console.log(`  ✓ Écrit en base.`);
      } catch (e) {
        console.error(`  ✗ Échec écriture pour ${p.id} :`, e.message);
      }
    }
  }

  console.log(`\nTotal : ${totalChanged} séance(s) ${APPLY ? "modifiée(s)" : "à modifier"}, ${totalSkipped} ignorée(s) sur ${programs.length} programme(s).`);
  if (!APPLY) {
    console.log("Relance avec --apply pour écrire réellement en base.");
  } else {
    writeFileSync(MARKER_FILE, new Date().toISOString());
    console.log(`Marqueur écrit dans ${MARKER_FILE} — un futur --apply sera bloqué tant qu'il existe.`);
  }
}

main();
