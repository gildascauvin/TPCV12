// One-off : régénère les 6 templates (Gendarmerie/Pompier/Armée TAP/Police/GIGN/Escalade) après le
// fix de réordonnancement des priorités (l'archétype technique-signature — Killy, natation... —
// disparaissait systématiquement de la semaine 1, écrasé par la Phase A2). Cible les 6 lignes par
// leur id retourné par create-new-library-programs.mjs — pas de sélection dynamique, one-off.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEN_URL = "http://localhost:3000/api/programs/generate";
const DAYS = ["Lun", "Mer", "Ven", "Dim"];

const TARGETS = [
  { id: "c387814e-0122-4707-9b4e-3a11f1d8b5b6", sport: "Gendarmerie", focus: "competition" },
  { id: "23261348-c05a-4dd6-9dc4-bb90566b3c1d", sport: "Sapeur-Pompier", focus: "competition" },
  { id: "1df0afcc-6dfd-4c02-aa6e-c150800560f1", sport: "Armée de Terre — TAP", focus: "competition" },
  { id: "a7a01a22-5875-41bb-a649-c628cdbd678a", sport: "Police Nationale", focus: "competition" },
  { id: "ea957672-faec-4f2f-8aad-a18827eed028", sport: "GIGN", focus: "competition" },
  { id: "26f9aa29-47b3-4049-9392-b2ee05a69f40", sport: "Escalade", focus: "mixte" },
];

async function main() {
  for (const t of TARGETS) {
    const genRes = await fetch(GEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sport: t.sport, level: "intermediaire", days: DAYS, duration: 8, focus: t.focus }),
    });
    const { template } = await genRes.json();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/programs?id=eq.${t.id}`, {
      method: "PATCH",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ template }),
    });
    console.log(t.sport, res.status);
  }
}
main();
