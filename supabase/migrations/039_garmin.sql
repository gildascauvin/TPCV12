-- Garmin Connect Developer Program (2026-10-23) : liaison OAuth2 PKCE d'un sportif à son compte Garmin.
-- Garmin pousse ensuite les données (Health API : dailies/sleeps/hrv, Activity API : activities/
-- activityDetails) vers /api/garmin/webhook, qui retrouve le sportif par garmin_user_id.
-- Les jetons ne sont lus et écrits que côté serveur (client admin) : RLS activée SANS policy, donc
-- aucune lecture possible depuis le navigateur. Le statut de connexion passe par GET /api/garmin/status.
-- Appliquée en prod le 2026-10-23.
create table if not exists garmin_connections (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  garmin_user_id      text not null unique,
  access_token        text not null,
  refresh_token       text not null,
  access_expires_at   timestamptz not null,
  refresh_expires_at  timestamptz,
  scope               text,
  permissions         text[] not null default '{}',
  connected_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table garmin_connections enable row level security;
