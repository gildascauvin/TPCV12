// One-off : crée les 9 nouveaux programmes publics de bibliothèque (4 sports manquants + 5 pages
// concours/tests physiques de sélection) décidés dans l'analyse SEO du 2026-08-11. Appelle le
// générateur live (localhost:3000, dev server) pour produire le template, puis insère directement
// via l'API REST Supabase (service role) — même owner_id que les 48 autres programmes publics.
//
// Usage : node --env-file=.env.local scripts/create-new-library-programs.mjs

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_ID = "8d73ebd5-f200-4d09-af0c-707fd223836a"; // détenteur de 48/49 programmes publics existants
const GEN_URL = "http://localhost:3000/api/programs/generate";
const DAYS = ["Lun", "Mer", "Ven", "Dim"]; // zéro adjacence calendaire -> préserve les archétypes du curriculum

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Variables Supabase manquantes (.env.local)");
  process.exit(1);
}

const PROGRAMS = [
  { sport: "Rugby", name: "Programme Rugby — Préparation Physique 8 Semaines", focus: "mixte" },
  { sport: "Volleyball", name: "Programme Volleyball — Préparation Physique 8 Semaines", focus: "mixte" },
  { sport: "Boxe", name: "Programme Boxe — Préparation Physique 8 Semaines", focus: "mixte" },
  { sport: "Escalade", name: "Programme Escalade — Préparation Physique 8 Semaines", focus: "mixte" },
  { sport: "Gendarmerie", name: "Programme Préparation Concours Gendarmerie — 8 Semaines", focus: "competition" },
  { sport: "Sapeur-Pompier", name: "Programme Préparation Concours Sapeur-Pompier — 8 Semaines", focus: "competition" },
  { sport: "Armée de Terre — TAP", name: "Programme Préparation TAP Armée de Terre — 8 Semaines", focus: "competition" },
  { sport: "Police Nationale", name: "Programme Préparation Concours Police Nationale — 8 Semaines", focus: "competition" },
  { sport: "GIGN", name: "Programme Préparation Sélection GIGN — 8 Semaines", focus: "competition" },
];

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function main() {
  const results = [];
  for (const p of PROGRAMS) {
    const genRes = await fetch(GEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sport: p.sport, level: "intermediaire", days: DAYS, duration: 8, focus: p.focus }),
    });
    if (!genRes.ok) {
      console.error(`ÉCHEC génération ${p.sport}:`, await genRes.text());
      continue;
    }
    const { template } = await genRes.json();

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/programs`, {
      method: "POST",
      headers: restHeaders,
      body: JSON.stringify({
        owner_id: OWNER_ID,
        name: p.name,
        sport: p.sport,
        level: "intermediaire",
        focus: p.focus,
        weeks_count: 8,
        sessions_per_week: DAYS.length,
        template,
        is_public: true,
      }),
    });
    if (!insertRes.ok) {
      console.error(`ÉCHEC insertion ${p.sport}:`, await insertRes.text());
      continue;
    }
    const [row] = await insertRes.json();
    results.push({ sport: p.sport, name: p.name, id: row.id, url: `https://go.theperfclub.com/p/${row.id}` });
    console.log(`OK — ${p.name} — ${row.id}`);
  }
  console.log("\n=== Récapitulatif ===");
  console.log(JSON.stringify(results, null, 2));
}

main();
