-- Rattrapage (2026-10-30) : coach_athletes et coach_sessions ont été créées hors du repo (dashboard),
-- seules des ALTER les touchaient ici. Ce fichier reproduit leur état en prod à cette date (colonnes,
-- contraintes, RLS) pour pouvoir recréer la base depuis le repo. Déjà en place en prod : idempotent,
-- rien à appliquer.

create table if not exists public.coach_athletes (
  id                  uuid        primary key default gen_random_uuid(),
  coach_id            uuid        not null references auth.users(id) on delete cascade,
  name                text        not null,
  sport               text,
  wellness_score      integer     default 75 check (wellness_score >= 0 and wellness_score <= 100),
  created_at          timestamptz default now(),
  user_id             uuid        references public.profiles(user_id) on delete set null,
  invite_email        text,
  free_training_label jsonb       not null default '{}'::jsonb,
  sexe                text        check (sexe = any (array['homme'::text, 'femme'::text])),
  poids_kg            numeric,
  first_decision_on   date
);

alter table public.coach_athletes enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coach_athletes' and policyname = 'coach_athletes_policy') then
    create policy coach_athletes_policy on public.coach_athletes for all using (auth.uid() = coach_id);
  end if;
end $$;

create table if not exists public.coach_sessions (
  id                    uuid        primary key default gen_random_uuid(),
  coach_id              uuid        not null references auth.users(id) on delete cascade,
  athlete_id            uuid        not null references public.coach_athletes(id) on delete cascade,
  date                  date        not null,
  name                  text        not null,
  notes                 text,
  done                  boolean     default false,
  rpe                   integer     check (rpe >= 1 and rpe <= 10),
  duration              integer,
  target_difficulty     integer     default 6 check (target_difficulty >= 1 and target_difficulty <= 10),
  created_at            timestamptz default now(),
  program_assignment_id uuid        references public.program_assignments(id) on delete set null,
  exercise_media        jsonb       not null default '{}'::jsonb,
  viewed_by_athlete_at  timestamptz,
  viewed_by_coach_at    timestamptz,
  is_demo               boolean     not null default false,
  autoreg_decision      jsonb,
  autoreg_proposal      jsonb
);

alter table public.coach_sessions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coach_sessions' and policyname = 'coach_sessions_policy') then
    create policy coach_sessions_policy on public.coach_sessions for all using (auth.uid() = coach_id);
  end if;
end $$;
