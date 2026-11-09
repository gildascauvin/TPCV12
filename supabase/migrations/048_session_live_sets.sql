-- Séance en direct, ressenti par série (2026-11-09) : journal des séries (prévu, fait, ressenti, repos)
-- écrit à chaque tap, y compris hors ligne via la file d'attente. La ligne de notes reste la source
-- de vérité du prévu restant ; ce journal garde ce qui a été fait et pourquoi.
alter table public.sessions add column if not exists live_sets jsonb;
