-- Partage générique WhatsApp/Web Share : snapshot figé au moment du partage (jamais un pointeur
-- live) pour Wellness, Séance, Programme, Charge, Récupération, Coach Control. Aucune notion de
-- connecté/non-connecté ni de donnée sensible — lecture publique volontaire (décision explicite,
-- voir CLAUDE.md).

create table if not exists shares (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('wellness', 'session', 'programme', 'charge', 'recuperation', 'coach_athlete')),
  snapshot jsonb not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table shares enable row level security;

create policy "shares_public_read" on shares for select using (true);
create policy "shares_insert_own" on shares for insert with check (auth.uid() = created_by);
