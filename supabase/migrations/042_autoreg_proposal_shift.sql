-- Autorégulation qui se juge (2026-10-23, POC Qx548NQG7ZrWgwQA28DYpp).
-- autoreg_proposal : la reco du matin, figée au check-in, que le sportif clique ou non
--   ({ proposed, reco, zoneLow, zoneHigh, original_difficulty, personal: { shift, penalty, dim, family }, date, recorded_at }).
--   Distincte d'autoreg_decision (qui reste « le sportif ou le coach a décidé ») : verdict de fin de
--   séance, bilan de justesse et « suivre ou pas » se calculent dessus.
-- autoreg_shift : seuil personnel accepté via « Me recaler » (points ajoutés à la récupération
--   effective avant le calcul de la reco ; 0 = moteur générique).
alter table public.sessions add column if not exists autoreg_proposal jsonb;
alter table public.coach_sessions add column if not exists autoreg_proposal jsonb;
alter table public.profiles add column if not exists autoreg_shift smallint not null default 0;
