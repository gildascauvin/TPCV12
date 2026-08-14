-- Horodatage "vu" par rôle, pour le point de notification sur les lignes d'exercice (disparaît une
-- fois la séance rouverte par le rôle concerné). Colonnes additives, nullable.

alter table sessions add column if not exists viewed_by_athlete_at timestamptz;
alter table sessions add column if not exists viewed_by_coach_at timestamptz;
alter table coach_sessions add column if not exists viewed_by_athlete_at timestamptz;
alter table coach_sessions add column if not exists viewed_by_coach_at timestamptz;
