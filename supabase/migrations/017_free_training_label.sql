-- Label éditable pour un sportif sans programme actif ("Séances libres" par défaut côté UI) —
-- valable par semaine (clé = lundi "yyyy-MM-dd"), pas globalement : {"2026-08-25": "Bloc perso"}.
-- Éditable par le sportif lui-même (profiles) ou par son coach (coach_athletes pour les
-- sportifs démo, profiles pour les vrais sportifs — voir /api/coach/free-label).
alter table profiles add column if not exists free_training_label jsonb not null default '{}'::jsonb;
alter table coach_athletes add column if not exists free_training_label jsonb not null default '{}'::jsonb;
