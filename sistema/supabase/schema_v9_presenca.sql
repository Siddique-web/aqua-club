-- ============================================================================
-- Aqua Club — v9: presença (online / offline) de clientes e da equipa
-- SQL Editor → New query → colar TUDO → Run.
-- O administrador vê quem está ligado em tempo real.
-- ============================================================================

create table if not exists public.presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kind text not null check (kind in ('staff', 'customer')),
  name text,
  email text,
  phone text,
  last_seen timestamptz not null default now()
);
create index if not exists presence_kind_seen_idx on public.presence (kind, last_seen desc);

alter table public.presence enable row level security;
drop policy if exists presence_own_ups on public.presence;
drop policy if exists presence_own_upd on public.presence;
drop policy if exists presence_staff_read on public.presence;
create policy presence_own_ups on public.presence for insert to authenticated with check (user_id = auth.uid());
create policy presence_own_upd on public.presence for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy presence_staff_read on public.presence for select to authenticated using (is_staff() or is_admin());

drop policy if exists customers_staff_read on public.customers;
create policy customers_staff_read on public.customers for select to authenticated using (is_admin() or is_staff());

create or replace function public.heartbeat()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
        k text := 'customer';
        n text := ''; e text := ''; p text := '';
begin
  if uid is null then return; end if;
  if exists (select 1 from staff s where s.user_id = uid) then
    k := 'staff';
    select s.name, s.email, s.phone into n, e, p from staff s where s.user_id = uid;
  else
    k := 'customer';
    select c.name, c.email, c.phone into n, e, p from customers c where c.user_id = uid;
  end if;
  insert into presence (user_id, kind, name, email, phone, last_seen)
  values (uid, k, coalesce(n, ''), coalesce(e, ''), coalesce(p, ''), now())
  on conflict (user_id) do update
    set kind = excluded.kind,
        name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        last_seen = now();
end $$;

revoke all on function public.heartbeat() from public;
grant execute on function public.heartbeat() to authenticated;
grant select on public.presence to authenticated;

alter table public.presence replica identity full;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'presence'
  ) then
    execute 'alter publication supabase_realtime add table public.presence';
  end if;
end $$;

notify pgrst, 'reload schema';
