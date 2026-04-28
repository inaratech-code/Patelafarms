-- Run this in Supabase SQL Editor.

create table if not exists public.events (
  id uuid primary key,
  farm_id uuid,
  device_id text not null,
  created_at timestamptz not null default now(),
  entity_type text not null,
  entity_id text not null,
  op text not null check (op in ('create','update','delete')),
  payload jsonb not null
);

create index if not exists events_created_at_idx on public.events(created_at);
create index if not exists events_entity_idx on public.events(entity_type, entity_id);
create index if not exists events_device_created_idx on public.events(device_id, created_at);
create index if not exists events_farm_created_idx on public.events(farm_id, created_at);

-- Minimal policy (dev): allow all authenticated + anon to read/write.
-- Tighten this later with per-farm tenancy + RLS.
alter table public.events enable row level security;

drop policy if exists "events_read_all" on public.events;
create policy "events_read_all" on public.events
for select using (true);

drop policy if exists "events_insert_all" on public.events;
create policy "events_insert_all" on public.events
for insert with check (true);

