-- Notifications push natives iOS + heure choisie + journal d'envoi (2026-10-14).
-- push_subscriptions accueille aussi les jetons APNs (kind = 'apns', endpoint = jeton, sans clés web).
alter table push_subscriptions add column if not exists kind text not null default 'web';
alter table push_subscriptions alter column p256dh drop not null;
alter table push_subscriptions alter column auth drop not null;

-- Heure du rappel du matin choisie par l'utilisateur (heure locale) et son fuseau.
alter table profiles add column if not exists push_hour smallint not null default 8;
alter table profiles add column if not exists push_tz text not null default 'Europe/Paris';

-- Une notif d'un type donné au plus une fois par clé (ex. jour local) : le passage horaire peut
-- tourner plusieurs fois sans jamais renvoyer, et le plafond quotidien se compte ici.
create table if not exists push_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind    text not null,
  ref     text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table push_log enable row level security;
create index if not exists push_log_user_sent on push_log (user_id, sent_at desc);
