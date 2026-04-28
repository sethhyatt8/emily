-- One-time setup for a no-auth shared calendar.
-- This opens read/write access to anyone with the app URL.

alter table public.events alter column created_by drop not null;
alter table public.events drop constraint if exists events_created_by_fkey;

drop policy if exists "allowed users can read events" on public.events;
drop policy if exists "allowed users can insert events" on public.events;
drop policy if exists "allowed users can update events" on public.events;
drop policy if exists "allowed users can delete events" on public.events;
drop policy if exists "authenticated users can read events" on public.events;
drop policy if exists "authenticated users can insert events" on public.events;
drop policy if exists "authenticated users can update events" on public.events;
drop policy if exists "authenticated users can delete events" on public.events;

create policy "public can read events"
on public.events
for select
to anon, authenticated
using (true);

create policy "public can insert events"
on public.events
for insert
to anon, authenticated
with check (true);

create policy "public can update events"
on public.events
for update
to anon, authenticated
using (true)
with check (true);

create policy "public can delete events"
on public.events
for delete
to anon, authenticated
using (true);
