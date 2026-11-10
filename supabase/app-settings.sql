-- App security settings (PIN gate + Manage Choir password)
-- Run in the Supabase SQL editor.

create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "Public read app settings" on public.app_settings;
drop policy if exists "Public insert app settings" on public.app_settings;
drop policy if exists "Public update app settings" on public.app_settings;

-- Choir app uses anon key (no login). Treat these as shared choir secrets.
create policy "Public read app settings"
  on public.app_settings for select
  using (true);

create policy "Public insert app settings"
  on public.app_settings for insert
  with check (true);

create policy "Public update app settings"
  on public.app_settings for update
  using (true);

-- Defaults (change later in Table Editor if needed)
insert into public.app_settings (key, value)
values
  ('app_pin', '2026'),
  ('store_password', 'crcormoc2026')
on conflict (key) do nothing;
