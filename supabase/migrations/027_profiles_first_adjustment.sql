-- Onboarding in-app (2026-10-01) : moment de la 1re décision d'autorégulation prise (Appliquer ou
-- Maintenir, sur sa séance ou celle d'un de ses sportifs). Coche l'étape "Ajuste" de la checklist
-- coach et déclenche une seule fois le priming après la 1re décision.
alter table profiles add column if not exists first_adjustment_at timestamptz;
