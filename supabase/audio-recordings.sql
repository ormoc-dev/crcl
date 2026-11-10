-- Choir audio recordings by voice part (Soprano / Alto / Tenor / Bass / Mixed)
-- Run in the Supabase SQL editor after app-settings.sql.

create table if not exists public.audio_recordings (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('soprano', 'alto', 'tenor', 'bass', 'mixed')),
  title text not null default 'Recording',
  path text not null unique,
  mime text not null default 'audio/webm',
  size bigint not null default 0,
  url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audio_recordings_category_idx
  on public.audio_recordings (category, updated_at desc);

alter table public.audio_recordings enable row level security;

drop policy if exists "Public read audio recordings" on public.audio_recordings;
drop policy if exists "Public insert audio recordings" on public.audio_recordings;
drop policy if exists "Public update audio recordings" on public.audio_recordings;
drop policy if exists "Public delete audio recordings" on public.audio_recordings;

create policy "Public read audio recordings"
  on public.audio_recordings for select
  using (true);

create policy "Public insert audio recordings"
  on public.audio_recordings for insert
  with check (true);

create policy "Public update audio recordings"
  on public.audio_recordings for update
  using (true);

create policy "Public delete audio recordings"
  on public.audio_recordings for delete
  using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio-recordings',
  'audio-recordings',
  true,
  31457280,
  array[
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/x-m4a',
    'audio/aac',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read audio files" on storage.objects;
drop policy if exists "Public upload audio files" on storage.objects;
drop policy if exists "Public update audio files" on storage.objects;
drop policy if exists "Public delete audio files" on storage.objects;

create policy "Public read audio files"
  on storage.objects for select
  using (bucket_id = 'audio-recordings');

create policy "Public upload audio files"
  on storage.objects for insert
  with check (bucket_id = 'audio-recordings');

create policy "Public update audio files"
  on storage.objects for update
  using (bucket_id = 'audio-recordings');

create policy "Public delete audio files"
  on storage.objects for delete
  using (bucket_id = 'audio-recordings');
