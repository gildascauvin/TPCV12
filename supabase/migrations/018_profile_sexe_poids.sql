-- Sexe et poids de corps — nécessaires pour situer un test de performance sur les repères de la
-- littérature (force relative, W/kg...) sans jamais les rendre obligatoires : un repère qui en a
-- besoin reste simplement grisé tant qu'ils ne sont pas renseignés (voir testNorms.ts).
-- Sur profiles (sportif/coach réel) ET coach_athletes (sportif démo, pas de ligne profiles) — les
-- deux vivent indépendamment, jamais synchronisés entre eux.

alter table profiles add column if not exists sexe text check (sexe in ('homme','femme'));
alter table profiles add column if not exists poids_kg numeric;

alter table coach_athletes add column if not exists sexe text check (sexe in ('homme','femme'));
alter table coach_athletes add column if not exists poids_kg numeric;
