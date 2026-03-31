-- Supabase → SQL Editor → ausführen (nach 001_cms_state.sql).
-- Öffentlicher Lesezugriff auf den Bucket „cms“, damit <img src="…publicUrl…"> auf der Website funktioniert.
-- Hochladen/Löschen nur über euren Node-Server mit Service-Role-Key.

insert into storage.buckets (id, name, public, file_size_limit)
values ('cms', 'cms', true, 157286400)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "Public read cms objects" on storage.objects;
create policy "Public read cms objects"
on storage.objects for select
to public
using (bucket_id = 'cms');
