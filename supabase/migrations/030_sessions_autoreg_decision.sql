-- Décision d'autorégulation persistée sur la séance (2026-10-04) : la reco proposée (sens + zone),
-- la difficulté d'origine, la difficulté appliquée, qui a décidé. Avant, la décision ne vivait qu'en
-- localStorage du jour : perdue le lendemain, sur un autre appareil et côté coach.
-- Valide seulement si decision.date = date de la séance (une séance déplacée repart de zéro).
alter table public.sessions add column if not exists autoreg_decision jsonb;
alter table public.coach_sessions add column if not exists autoreg_decision jsonb;
