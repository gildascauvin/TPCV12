-- Séance en direct (2026-10-02) : chrono stocké en base pour survivre au rechargement, à la
-- fermeture de l'app et passer d'un appareil à l'autre. Séance "en cours" = started_at non null
-- et done = false. Durée = (paused_at ?? maintenant) - started_at - paused_ms.
alter table sessions add column if not exists started_at timestamptz;
alter table sessions add column if not exists paused_at timestamptz;
alter table sessions add column if not exists paused_ms integer not null default 0;
