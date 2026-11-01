-- Séances en série dans le Planning (2026-11-01), façon événement récurrent Google Agenda.
-- series_id : séances créées ensemble par « Répéter chaque semaine » (ou issues d'une série de
-- programme). series_step : progression par semaine { inten, vol } en %. Colonnes vides par
-- défaut : aucune séance existante n'est une série.
alter table public.sessions add column if not exists series_id text;
alter table public.sessions add column if not exists series_step jsonb;
alter table public.coach_sessions add column if not exists series_id text;
alter table public.coach_sessions add column if not exists series_step jsonb;
create index if not exists sessions_series_id_idx on public.sessions (series_id) where series_id is not null;
create index if not exists coach_sessions_series_id_idx on public.coach_sessions (series_id) where series_id is not null;
