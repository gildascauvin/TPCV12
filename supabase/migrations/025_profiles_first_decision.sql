-- Freemium (2026-09-30) : jour où un compte gratuit a vu sa 1re vraie décision en clair
-- (sportif : 1er check-in + séance à ajuster sur /today ; coach : 1er passage sur Coach Control).
-- Ce jour-là tout reste lisible, dès le lendemain les sorties sont floutées.
alter table profiles add column if not exists first_decision_on date;
