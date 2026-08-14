-- Vidéo/photo + commentaires attachés à une ligne d'exercice précise, dans l'éditeur de séance
-- (Modifier la séance). Clé = index de ligne dans `notes` (pas d'ID d'exercice stable ailleurs
-- dans le repo — même contrainte documentée pour le drag & drop des exercices).
-- Colonne additive, nullable, défaut '{}' : aucun lecteur existant de `notes` n'est impacté.

alter table sessions add column if not exists exercise_media jsonb not null default '{}'::jsonb;
alter table coach_sessions add column if not exists exercise_media jsonb not null default '{}'::jsonb;
