// One-off : crée les 7 nouveaux programmes publics de bibliothèque (pliométrie, golf, équitation,
// hockey sur glace, baseball, voile, BMX) décidés le 2026-08-20. Même pattern que
// create-new-library-programs.mjs (batch précédent, 9 programmes).
//
// Usage : node --env-file=.env.local scripts/create-batch2-library-programs.mjs

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_ID = "8d73ebd5-f200-4d09-af0c-707fd223836a"; // détenteur de tous les programmes publics existants
const GEN_URL = "http://localhost:3000/api/programs/generate";
const DAYS = ["Lun", "Mer", "Ven", "Dim"]; // zéro adjacence calendaire -> préserve les archétypes du curriculum

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Variables Supabase manquantes (.env.local)");
  process.exit(1);
}

const PROGRAMS = [
  { sport: "Pliométrie", name: "Programme Pliométrie — Explosivité 8 Semaines", focus: "mixte" },
  { sport: "Golf", name: "Programme Golf — Préparation Physique 8 Semaines", focus: "mixte" },
  { sport: "Équitation", name: "Programme Équitation — Préparation Physique 8 Semaines", focus: "mixte" },
  { sport: "Hockey sur glace", name: "Programme Hockey sur Glace — Préparation Physique 8 Semaines", focus: "mixte" },
  { sport: "Baseball", name: "Programme Baseball — Préparation Physique 8 Semaines", focus: "mixte" },
  { sport: "Voile", name: "Programme Voile — Préparation Physique 8 Semaines", focus: "mixte" },
  { sport: "BMX", name: "Programme BMX — Préparation Physique 8 Semaines", focus: "mixte" },
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
