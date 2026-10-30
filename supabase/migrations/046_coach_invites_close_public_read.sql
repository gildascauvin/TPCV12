-- Fuite (2026-10-30) : la policy "public read by token" (002) laissait n'importe quel détenteur de la clé
-- anon lire toutes les invitations (emails des sportifs invités + tokens). Plus aucun code ne lit
-- coach_invites côté navigateur : toutes les lectures passent par le client admin des routes serveur
-- (/api/invite/*, /coach/athletes, suppressions de compte), qui ignore la RLS. Le coach garde l'accès
-- à ses propres invitations.
drop policy if exists "public read by token" on public.coach_invites;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coach_invites' and policyname = 'coaches read own invites') then
    create policy "coaches read own invites" on public.coach_invites for select using (coach_id = auth.uid());
  end if;
end $$;
