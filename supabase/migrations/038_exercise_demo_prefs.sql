-- Choix d'un coach (ou d'un sportif) sur la démo d'un exercice (2026-10-22) :
-- « Changer de démo » (autre vidéo Catalyst) ou « Masquer ». Clé = id de la démo proposée par
-- défaut (src/data/catalystDemos.json) ou "img:<nom>" pour une illustration.
create table if not exists public.exercise_demo_prefs (
  owner_id uuid not null references auth.users(id) on delete cascade,
  demo_key text not null,
  entry_id integer,
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner_id, demo_key)
);
alter table public.exercise_demo_prefs enable row level security;
create policy "demo prefs owner" on public.exercise_demo_prefs
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
