-- Boucle de vérification (2026-10-24) : le réalisé corrigé par le sportif ou le coach
-- (« J'ai allégé sans le noter »), et un curseur « pousser » séparé du recalage « alléger ».
alter table public.sessions add column if not exists autoreg_followed boolean;
alter table public.profiles add column if not exists autoreg_shift_high smallint not null default 0;
