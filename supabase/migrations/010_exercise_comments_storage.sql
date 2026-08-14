-- Bucket pour les vidéos uploadées directement dans un commentaire d'exercice (ex: un sportif qui
-- se filme pour montrer son exécution). Public en lecture (URL non devinable, même principe que
-- les programmes publics existants) — uniquement l'auteur authentifié peut écrire dans son propre
-- dossier (path préfixé par son user_id).

insert into storage.buckets (id, name, public, file_size_limit)
values ('exercise-comments', 'exercise-comments', true, 52428800) -- 50 Mo
on conflict (id) do nothing;

create policy "exercise-comments: lecture publique"
on storage.objects for select
using (bucket_id = 'exercise-comments');

create policy "exercise-comments: ecriture dans son propre dossier"
on storage.objects for insert
with check (bucket_id = 'exercise-comments' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "exercise-comments: suppression de son propre dossier"
on storage.objects for delete
using (bucket_id = 'exercise-comments' and (storage.foldername(name))[1] = auth.uid()::text);
