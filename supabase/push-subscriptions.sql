-- Web Push subscriptions for closed-app alerts (choir devices)
-- Run in Supabase SQL Editor.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null default '',
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists push_subscriptions_device_idx
  on public.push_subscriptions (device_id);

alter table public.push_subscriptions enable row level security;

-- Choir app uses the anon key (no login) — same pattern as lyrics/schedule.
drop policy if exists "Public read push subscriptions" on public.push_subscriptions;
drop policy if exists "Public insert push subscriptions" on public.push_subscriptions;
drop policy if exists "Public update push subscriptions" on public.push_subscriptions;
drop policy if exists "Public delete push subscriptions" on public.push_subscriptions;

create policy "Public read push subscriptions"
  on public.push_subscriptions for select
  using (true);

create policy "Public insert push subscriptions"
  on public.push_subscriptions for insert
  with check (true);

create policy "Public update push subscriptions"
  on public.push_subscriptions for update
  using (true);

create policy "Public delete push subscriptions"
  on public.push_subscriptions for delete
  using (true);
