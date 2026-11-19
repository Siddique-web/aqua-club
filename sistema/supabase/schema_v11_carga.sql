-- ============================================================================
-- Aqua Club — v11: heartbeat mais leve com muita gente ao mesmo tempo
-- SQL Editor → New query → colar TUDO → Run.
-- Evita gravar presença a cada milissegundo; o site já espera ~20 s.
-- ============================================================================

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
        last_seen = now()
    where public.presence.last_seen < now() - interval '12 seconds';
end $$;

revoke all on function public.heartbeat() from public;
grant execute on function public.heartbeat() to authenticated;
notify pgrst, 'reload schema';
