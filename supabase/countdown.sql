alter table public.events
add column if not exists countdown boolean not null default false;
