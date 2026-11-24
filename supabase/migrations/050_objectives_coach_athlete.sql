-- Objectifs d'un sportif SANS compte (24/11/2026) : rattachés à sa fiche coach (coach_athletes.id).
-- Lus / écrits uniquement par /api/coach/objectives (client admin après vérification du lien) :
-- les policies propriétaire (auth.uid() = user_id) restent inchangées.
alter table public.objectives alter column user_id drop not null;
alter table public.objectives add column if not exists coach_athlete_id uuid references public.coach_athletes(id) on delete cascade;
alter table public.objectives add constraint objectives_owner_check check (user_id is not null or coach_athlete_id is not null);
create unique index if not exists objectives_coach_athlete_objective_idx on public.objectives (coach_athlete_id, objective_id) where coach_athlete_id is not null;
