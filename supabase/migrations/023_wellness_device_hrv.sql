-- VFC (variabilité cardiaque) de la montre dans la récupération (2026-09-30) : même principe que la FC
-- au repos (022) — valeur du jour + norme perso (moyenne des 28 jours précédents). WHOOP/Oura/Apple
-- Watch l'écrivent dans Apple Santé ; Garmin non (sauf via une app tierce de synchro).
alter table wellness_daily add column if not exists device_hrv_ms numeric;
alter table wellness_daily add column if not exists device_hrv_baseline numeric;
