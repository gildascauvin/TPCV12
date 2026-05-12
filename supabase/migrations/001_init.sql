-- ============================================================
-- ThePerfClub — initial schema
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- profiles
-- ────────────────────────────────────────────────────────────
create table if not exists profiles (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text,
  sport               text,
  objective           text,       -- performance | longevite | stress | composition | equilibre | rehab
  freq_target         int,        -- sessions per week
  mode                text default 'athlete', -- athlete | coach
  subscription_status text not null default 'free', -- free | athlete | coach | expired
  stripe_customer_id  text,
  onboarding_done     boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id)
);

-- ────────────────────────────────────────────────────────────
-- wellness_daily
-- ────────────────────────────────────────────────────────────
create table if not exists wellness_daily (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  sleep       int not null check (sleep between 1 and 10),
  stress      int not null check (stress between 1 and 10),
  recovery    int not null check (recovery between 1 and 10),
  motivation  int not null check (motivation between 1 and 10),
  base_score  int,
  score       int,
  behaviors   text[] not null default '{}',
  bedtime     text,
  created_at  timestamptz not null default now(),
  unique (user_id, date)
);

-- ────────────────────────────────────────────────────────────
-- sessions
-- ────────────────────────────────────────────────────────────
create table if not exists sessions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  name        text not null,
  notes       text,
  duration    int,  -- minutes
  rpe         int check (rpe between 1 and 10),
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- fatigue_log
-- ────────────────────────────────────────────────────────────
create table if not exists fatigue_log (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  total_impact  int not null default 0,
  created_at    timestamptz not null default now(),
  unique (user_id, date)
);

-- ────────────────────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────────────────────
alter table profiles      enable row level security;
alter table wellness_daily enable row level security;
alter table sessions       enable row level security;
alter table fatigue_log    enable row level security;

-- profiles
create policy "users_own_profile"
  on profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- wellness_daily
create policy "users_own_wellness"
  on wellness_daily for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- sessions
create policy "users_own_sessions"
  on sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- fatigue_log
create policy "users_own_fatigue"
  on fatigue_log for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- Auto-create profile on sign-up (trigger)
-- ────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- updated_at auto-bump
-- ────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure public.set_updated_at();
