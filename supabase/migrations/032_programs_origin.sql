-- Origine d'un programme (2026-10-05) : les programmes faits par ThePerfClub (modèle de la
-- bibliothèque ou généré) se dévoilent à J+7 côté sportif ; importés et vierges restent en clair.
-- null = programme antérieur à la colonne, traité comme non ThePerfClub (rien de masqué).
alter table programs add column if not exists origin text check (origin in ('template','generated','imported','blank'));
update programs set origin = 'template' where is_official_template = true and origin is null;
-- Rattrapage (2026-10-05, demandé par Gildas) : copies existantes des modèles officiels (même nom),
-- y compris celles déjà assignées et en cours.
update programs set origin = 'template' where origin is null and is_official_template = false and name in (select name from programs where is_official_template);
