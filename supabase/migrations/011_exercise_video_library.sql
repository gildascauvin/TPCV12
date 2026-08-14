-- Bibliothèque vidéo par nom d'exercice (le token "nom", pas la ligne entière) — pour proposer de
-- réutiliser une démo déjà ajoutée ailleurs plutôt que de la recoller à chaque occurrence.
-- Une bibliothèque par personne (coach ou sportif en auto-édition) : auth.uid() = owner_id, aucune
-- distinction supplémentaire nécessaire côté RLS.

create table exercise_video_library (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  exercise_name_key text not null,
  video_url text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, exercise_name_key)
);

alter table exercise_video_library enable row level security;

create policy "exercise_video_library: proprietaire uniquement"
on exercise_video_library for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);
