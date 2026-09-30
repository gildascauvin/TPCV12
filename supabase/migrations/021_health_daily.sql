-- Données de santé lues sur le téléphone (Apple Santé via l'app iOS Capacitor, 2026-09-30) :
-- une ligne par jour et par sportif, agrégée côté client (FC au repos moyenne, VFC moyenne,
-- minutes de sommeil de la nuit qui se termine ce jour-là). Alimentée par n'importe quelle
-- montre qui écrit dans Santé (Garmin, WHOOP, Oura, Apple Watch). Garmin n'écrit pas la VFC.
create table if not exists health_daily (
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  resting_hr    numeric,
  hrv_ms        numeric,
  sleep_minutes integer,
  sources       text[] not null default '{}',
  updated_at    timestamptz not null default now(),
  primary key (user_id, date)
);

alter table health_daily enable row level security;

create policy "users_own_health"
  on health_daily for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
