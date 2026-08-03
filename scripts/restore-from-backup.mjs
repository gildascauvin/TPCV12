// Restaure programs.template depuis un fichier de sauvegarde produit par patch-library-difficulty.mjs.
// Usage : node --env-file=.env.local scripts/restore-from-backup.mjs <fichier-backup.json>

import { readFileSync } from "fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage : node --env-file=.env.local scripts/restore-from-backup.mjs <fichier-backup.json>");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function main() {
  const programs = JSON.parse(readFileSync(file, "utf-8"));
  console.log(`Restauration de ${programs.length} programme(s) depuis ${file}...`);

  for (const p of programs) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/programs?id=eq.${p.id}`, {
      method: "PATCH",
      headers: { ...restHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({ template: p.template }),
    });
    if (!res.ok) {
      console.error(`✗ Échec pour ${p.name} (${p.id}) :`, await res.text());
    } else {
      console.log(`✓ ${p.name} (${p.id})`);
    }
  }
  console.log("Terminé.");
}

main();
