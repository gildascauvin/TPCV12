-- Recalage automatique (2026-10-24) : historique des recalages (date, sens, seuil avant/après, taux,
-- annulé ou non). Sert à rejouer chaque jour avec le seuil en vigueur (courbe du taux honnête) et à ne
-- pas réappliquer un recalage annulé. Les seuils déjà recalés à la main reçoivent un événement « seed ».
alter table public.profiles add column if not exists autoreg_recal_events jsonb not null default '[]'::jsonb;
update public.profiles set autoreg_recal_events = jsonb_build_array(jsonb_build_object('at','2026-10-23','dir','low','from',0,'to',autoreg_shift,'source','seed'))
where autoreg_shift > 0 and autoreg_recal_events = '[]'::jsonb;
