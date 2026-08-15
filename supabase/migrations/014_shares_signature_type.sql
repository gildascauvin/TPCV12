-- Ajoute "signature" à shares.resource_type — carte combinée Charge+Récupération (insight croisé
-- global + les 2 charts), remplace les 2 partages séparés Charge/Récupération sur /conseils et
-- /coach/athletes. "charge"/"recuperation" restent acceptés pour ne pas casser d'anciens liens.
alter table shares drop constraint shares_resource_type_check;
alter table shares add constraint shares_resource_type_check
  check (resource_type = any (array['wellness', 'session', 'programme', 'charge', 'recuperation', 'coach_athlete', 'signature']));
