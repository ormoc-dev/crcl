-- Practice document storage bucket + policies (PDF / Word / Excel, max 20 MB)
-- Run in the Supabase SQL editor after schedule.sql (schedule.documents references these files).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'practice-docs',
  'practice-docs',
  true,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read practice docs" on storage.objects;
drop policy if exists "Public upload practice docs" on storage.objects;
drop policy if exists "Public update practice docs" on storage.objects;
drop policy if exists "Public delete practice docs" on storage.objects;

create policy "Public read practice docs"
  on storage.objects for select
  using (bucket_id = 'practice-docs');

create policy "Public upload practice docs"
  on storage.objects for insert
  with check (bucket_id = 'practice-docs');

create policy "Public update practice docs"
  on storage.objects for update
  using (bucket_id = 'practice-docs');

create policy "Public delete practice docs"
  on storage.objects for delete
  using (bucket_id = 'practice-docs');
