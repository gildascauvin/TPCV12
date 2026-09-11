-- Qualité(s) physique(s) d'un test créé librement (2026-09, demande de Gildas : "il faut sûrement
-- aussi pouvoir ajouter une catégorie/qualité physique quand on créer un test"). Un test recommandé
-- (testBattery.ts) a déjà la sienne via BATTERY_TEST_QUALITY, un test résolu (canonicalMetricKey) via
-- METRIC_QUALITY (testQualities.ts) — les deux ignorent ce champ. Seul un test entièrement libre (nom
-- non reconnu) n'avait jusqu'ici aucun moyen d'être tagué, donc jamais filtré par qualité dans
-- TestsPanel.tsx (toujours affiché, quel que soit le filtre actif) — voir le tableau `Quality` dans
-- src/lib/testQualities.ts pour les valeurs valides (pas de contrainte CHECK ici, la validation se
-- fait côté app comme le reste de ce fichier).
alter table tests add column if not exists qualities text[];
