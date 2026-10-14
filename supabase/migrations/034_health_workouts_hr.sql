-- Fréquence cardiaque des entraînements (2026-10-11) : moyenne, max et TRIMP (Banister) calculés à la
-- synchro Apple Santé (healthSync.ts), pour comparer le ressenti (RPE) à ce que dit le cœur.
alter table health_workouts
  add column if not exists avg_hr numeric,
  add column if not exists max_hr numeric,
  add column if not exists trimp numeric;
