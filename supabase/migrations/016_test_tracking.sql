-- Suivi de tests physiques (résultat + historique) — même pattern que exercise_video_library :
-- une table de tests scopée par owner_id (coach ou sportif solo), pas de catalogue global partagé.
-- Le nom résolu de la ligne d'exercice (resolveExerciseName) sert de clé, un test devient
-- réutilisable dès qu'un même nom réapparaît chez ce owner.

create table if not exists tests (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  name_key    text not null,
  unit        text not null default 'kg',
  created_at  timestamptz not null default now(),
  unique (owner_id, name_key)
);

alter table tests enable row level security;

create policy "tests: proprietaire uniquement"
on tests for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- Résultats datés — un point par (test, date, sujet). `subject_user_id` = un sportif qui enregistre
-- son propre résultat (owner_id = lui-même) ; `subject_coach_athlete_id` = un athlète du roster d'un
-- coach, démo ou réel (owner_id = le coach). Exactement un des deux, jamais les deux ni aucun.
-- Portée MVP assumée : chaque source (sportif solo, coach) ne voit que ce qu'elle a elle-même
-- enregistré — fusionner "résultat tapé par le sportif" et "résultat tapé par son coach pour lui"
-- nécessiterait une route admin (comme /api/coach/session-history), pas construite dans cette passe.

create table if not exists test_results (
  id                        uuid primary key default gen_random_uuid(),
  owner_id                  uuid not null references auth.users(id) on delete cascade,
  test_id                   uuid not null references tests(id) on delete cascade,
  subject_user_id           uuid references auth.users(id) on delete cascade,
  subject_coach_athlete_id  uuid references coach_athletes(id) on delete cascade,
  date                      date not null,
  value                     numeric not null,
  unit                      text not null,
  video_url                 text,
  created_at                timestamptz not null default now(),
  check ((subject_user_id is not null) <> (subject_coach_athlete_id is not null)),
  subject_key text generated always as (coalesce(subject_user_id::text, subject_coach_athlete_id::text)) stored,
  unique (test_id, date, subject_key)
);

alter table test_results enable row level security;

create policy "test_results: proprietaire uniquement"
on test_results for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create index if not exists test_results_owner_test_date_idx on test_results (owner_id, test_id, date);
create index if not exists test_results_subject_coach_athlete_idx on test_results (subject_coach_athlete_id) where subject_coach_athlete_id is not null;
