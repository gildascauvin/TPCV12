-- Entraînements lus dans Apple Santé (app iOS Capacitor, 2026-09-30) : une ligne par entraînement
-- enregistré par la montre (Garmin, Apple Watch...). Sert à pré-remplir la durée quand le sportif
-- termine une séance (RPE × durée). platform_id = UUID HealthKit, stable d'une synchro à l'autre.
create table if not exists health_workouts (
  user_id       uuid not null references auth.users(id) on delete cascade,
  platform_id   text not null,
  date          date not null,
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  duration_min  integer not null,
  workout_type  text not null,
  energy_kcal   numeric,
  source        text,
  updated_at    timestamptz not null default now(),
  primary key (user_id, platform_id)
);

create index if not exists health_workouts_user_date on health_workouts (user_id, date);

alter table health_workouts enable row level security;

create policy "users_own_health_workouts"
  on health_workouts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
