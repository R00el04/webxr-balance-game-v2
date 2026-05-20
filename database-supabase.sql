-- Configuracion previa en Supabase:
-- 1. Auth > Providers > Email: habilitar Email/Password.
-- 2. Auth > Email: desactivar confirmacion de email para esta demo.
-- 3. Ejecuta este script en el SQL Editor. Si ya tienes datos, haz respaldo:
--    la tabla players se recrea para alinearla con auth.users.

drop view if exists public.active_players;
drop table if exists public.players cascade;

create table public.players (
  id uuid primary key references auth.users (id) on delete cascade,
  alias text not null,
  side text check (side in ('LEFT', 'RIGHT')),
  is_active boolean not null default false,
  last_seen_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index players_alias_unique_idx on public.players (lower(alias));
create index players_is_active_idx on public.players (is_active);
create index players_last_seen_idx on public.players (last_seen_at desc);
create index players_active_last_seen_idx on public.players (is_active, last_seen_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_players_set_updated_at
before update on public.players
for each row
execute function public.set_updated_at();

alter table public.players enable row level security;

grant select, insert, update on public.players to authenticated;

create policy "Authenticated users can read players"
on public.players
for select
to authenticated
using (true);

create policy "Authenticated users can insert own player"
on public.players
for insert
to authenticated
with check (auth.uid() = id);

create policy "Authenticated users can update own player"
on public.players
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace view public.active_players
with (security_invoker = true) as
select
  id,
  alias,
  side,
  last_seen_at
from public.players
where is_active = true
  and last_seen_at > now() - interval '15 seconds';

grant select on public.active_players to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
end;
$$;
