-- Étend la bibliothèque vidéo par nom d'exercice pour couvrir aussi la photo, et passe les deux
-- colonnes en nullable (une ligne peut n'avoir que l'un des deux) — remplace le mécanisme de copie
-- figée par ligne (exercise_media.videoUrl/photoUrl) par une vraie source unique lue en live à
-- chaque rendu, plutôt qu'un simple pré-remplissage une fois pour toutes.

alter table exercise_video_library alter column video_url drop not null;
alter table exercise_video_library add column if not exists photo_url text;

alter table exercise_video_library
  add constraint exercise_video_library_has_media
  check (video_url is not null or photo_url is not null);
