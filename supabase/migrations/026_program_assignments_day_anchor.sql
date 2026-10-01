-- Onboarding in-app (2026-10-01) : "Démarrer aujourd'hui" décale la semaine type pour que la 1re
-- séance tombe sur start_date. On mémorise le jour du template qui sert d'ancre (ex. "Lun") pour
-- pouvoir recalculer exactement les mêmes dates plus tard (mise à jour des séances à venir après
-- édition du programme). NULL = ancien comportement : chaque jour du template garde son jour de
-- semaine réel (ancre = jour de semaine de start_date).
alter table program_assignments add column if not exists day_anchor text;
