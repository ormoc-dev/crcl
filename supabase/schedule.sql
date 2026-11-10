-- Choir service + practice schedule
-- Run in the Supabase SQL editor.

create table if not exists public.schedule (
  id text primary key,
  type text not null check (type in ('service', 'practice')),
  day text not null default '',
  title text not null,
  time text not null default '',
  note text not null default '',
  documents jsonb not null default '[]'::jsonb,
  songs jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Existing projects: add columns if missing
alter table public.schedule
  add column if not exists documents jsonb not null default '[]'::jsonb;

alter table public.schedule
  add column if not exists songs jsonb not null default '[]'::jsonb;

create index if not exists schedule_type_idx on public.schedule (type);

alter table public.schedule enable row level security;

drop policy if exists "Public read schedule" on public.schedule;
drop policy if exists "Public insert schedule" on public.schedule;
drop policy if exists "Public update schedule" on public.schedule;
drop policy if exists "Public delete schedule" on public.schedule;

create policy "Public read schedule"
  on public.schedule for select
  using (true);

create policy "Public insert schedule"
  on public.schedule for insert
  with check (true);

create policy "Public update schedule"
  on public.schedule for update
  using (true);

create policy "Public delete schedule"
  on public.schedule for delete
  using (true);
