-- Semaine 0 d'acclimatation (onboarding post-signup, 2026-10-05) : l'assignment démarre le lundi
-- suivant, et les jours d'entraînement restants de la semaine en cours portent la S1 allégée.
-- Le drapeau permet aux bandeaux programme d'afficher « S0 · Acclimatation » sur la semaine qui
-- précède start_date.
alter table program_assignments add column if not exists acclimatation boolean not null default false;
