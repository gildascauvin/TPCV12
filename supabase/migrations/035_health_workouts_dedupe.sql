-- Doublons d'entraînements (2026-10-11) : Garmin réécrit la même séance dans Apple Santé avec un nouvel
-- UUID à chaque synchro (jusqu'à 14 lignes pour une séance). On garde une ligne par début de séance,
-- puis l'unicité porte sur (user_id, start_at) : la synchro met à jour au lieu d'empiler.
-- À APPLIQUER APRÈS ACCORD (supprime des lignes en prod).
delete from health_workouts a
  using health_workouts b
  where a.user_id = b.user_id and a.start_at = b.start_at and a.ctid < b.ctid;
create unique index if not exists health_workouts_user_start on health_workouts (user_id, start_at);
