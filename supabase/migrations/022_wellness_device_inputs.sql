-- Données montre appliquées à la wellness du jour (2026-09-30) : copiées depuis health_daily au moment
-- du calcul pour que base_score/score (et donc tout ce qui les lit : ring, Coach Control, charts)
-- intègrent le sommeil mesuré et la FC au repos. Les curseurs subjectifs (sleep/stress/recovery/
-- motivation) restent intacts : le score se recalcule toujours à partir d'eux + ces colonnes.
-- NULL = pas de montre ce jour-là, le score reste 100% subjectif.
alter table wellness_daily add column if not exists device_sleep_minutes integer;
alter table wellness_daily add column if not exists device_resting_hr numeric;
alter table wellness_daily add column if not exists device_rhr_baseline numeric;
