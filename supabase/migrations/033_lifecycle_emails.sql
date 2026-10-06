-- Emails déclenchés par l'activité (2026-10-06) : un envoi par (utilisateur, type, référence).
-- `ref` distingue les envois répétables : id du sportif pour « 1er check-in d'un sportif » côté coach,
-- date du dernier check-in pour la relance « 3 jours sans check-in ». Vide pour les envois uniques.
-- Écrit uniquement par le cron (service role) : RLS activée sans policy.
create table if not exists lifecycle_emails (
  user_id uuid not null,
  kind text not null,
  ref text not null default '',
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table lifecycle_emails enable row level security;
