-- Grössere Dateien (z. B. Video in der Medienbibliothek), einmal im SQL Editor ausführen.

update storage.buckets
set file_size_limit = 157286400
where id = 'cms';
