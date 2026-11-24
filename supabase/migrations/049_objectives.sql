-- Objectifs (23/11/2026) : jusqu'à 3 objectifs par sportif, chacun = un test ou une mesure de l'app
-- (objective_id, ex. "metric:backSquat", "regularity") avec un départ et une échéance. Remplace
-- user_metadata.objectives (v1 locale). Le coach lit et écrit ceux de ses sportifs via /api/coach/objectives
-- (service role), jamais depuis le client : RLS = propriétaire uniquement.
create table if not exists public.objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  objective_id text not null,
  start_date date not null default current_date,
  deadline date not null,
  set_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, objective_id)
);
create index if not exists objectives_user_id_idx on public.objectives(user_id);
alter table public.objectives enable row level security;
create policy "objectives: proprietaire lecture" on public.objectives for select using ((select auth.uid()) = user_id);
create policy "objectives: proprietaire ajout" on public.objectives for insert with check ((select auth.uid()) = user_id);
create policy "objectives: proprietaire modif" on public.objectives for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "objectives: proprietaire suppression" on public.objectives for delete using ((select auth.uid()) = user_id);
