-- Stress et Body Battery de la journée (Garmin, Health API Daily Summaries, 2026-10-23) : affichés en
-- sous-indicateurs de la carte Récupération, n'entrent pas dans le score. Stress 1-100 (moyenne et max
-- de la journée, -1/-2 = pas de mesure, jamais écrits), Body Battery = recharge et dépense de la journée.
alter table health_daily
  add column if not exists stress_avg smallint,
  add column if not exists stress_max smallint,
  add column if not exists body_battery_charged smallint,
  add column if not exists body_battery_drained smallint;
