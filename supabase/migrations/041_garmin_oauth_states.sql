-- Connexion Garmin depuis l'app iPhone (2026-10-23) : l'app n'ouvre que go.theperfclub.com, la page
-- Garmin part donc dans Safari, qui n'a ni la session ni le cookie PKCE de l'app. Le state et le
-- verifier vivent ici, liés au sportif à la création du lien (requête authentifiée) : le retour de
-- Garmin retrouve le sportif sans session. Usage unique (ligne supprimée au retour), 10 minutes.
-- RLS sans policy : client admin côté serveur seulement.
create table if not exists garmin_oauth_states (
  state       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  verifier    text not null,
  next        text not null default '/today',
  expires_at  timestamptz not null
);

alter table garmin_oauth_states enable row level security;
