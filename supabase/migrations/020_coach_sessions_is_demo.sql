-- Distingue les coach_sessions synthétiques (seedées à l'invitation via buildCoachDemoSessions)
-- des vraies séances (assignation réelle de programme, ajout manuel par le coach). Nécessaire
-- pour que /api/invite/join et /api/invite/link puissent supprimer uniquement le démo au moment
-- où le sportif rejoint réellement, sans plus jamais effacer un vrai programme déjà construit
-- pour lui — bug corrigé le 2026-09-16 (voir migratePlaceholderSessions.ts).
alter table coach_sessions add column if not exists is_demo boolean not null default false;
