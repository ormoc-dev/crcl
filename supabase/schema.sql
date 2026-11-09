-- Run this in the Supabase SQL editor once.

create table if not exists public.lyrics (
  id text primary key,
  title text not null,
  artist text not null default '',
  key text not null default '',
  body text not null,
  updated_at timestamptz not null default now()
);

create index if not exists lyrics_title_idx on public.lyrics (title);

alter table public.lyrics enable row level security;

drop policy if exists "Public read lyrics" on public.lyrics;
drop policy if exists "Public insert lyrics" on public.lyrics;
drop policy if exists "Public update lyrics" on public.lyrics;
drop policy if exists "Public delete lyrics" on public.lyrics;

create policy "Public read lyrics"
  on public.lyrics for select
  using (true);

create policy "Public insert lyrics"
  on public.lyrics for insert
  with check (true);

create policy "Public update lyrics"
  on public.lyrics for update
  using (true);

create policy "Public delete lyrics"
  on public.lyrics for delete
  using (true);
