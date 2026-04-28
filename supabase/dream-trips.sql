-- Shared no-auth persistence for dream trip board.
-- Run this once in Supabase SQL editor.

create table if not exists public.dream_trips (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  link_text text,
  color text not null default '#fef3c7',
  created_at timestamptz not null default now()
);

alter table public.dream_trips
add column if not exists color text not null default '#fef3c7';

alter table public.dream_trips enable row level security;

drop policy if exists "public can read dream trips" on public.dream_trips;
drop policy if exists "public can insert dream trips" on public.dream_trips;
drop policy if exists "public can update dream trips" on public.dream_trips;
drop policy if exists "public can delete dream trips" on public.dream_trips;

create policy "public can read dream trips"
on public.dream_trips
for select
to anon, authenticated
using (true);

create policy "public can insert dream trips"
on public.dream_trips
for insert
to anon, authenticated
with check (true);

create policy "public can update dream trips"
on public.dream_trips
for update
to anon, authenticated
using (true)
with check (true);

create policy "public can delete dream trips"
on public.dream_trips
for delete
to anon, authenticated
using (true);
