-- Freemium coach (2026-10-01) : chaque sportif apporte sa 1re décision en clair au coach gratuit
-- (jour de son 1er affichage), floutée dès le lendemain — au lieu d'une seule décision sur la carte
-- du coach lui-même.
alter table coach_athletes add column if not exists first_decision_on date;
