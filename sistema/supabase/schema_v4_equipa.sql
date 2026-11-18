-- ============================================================================
-- Aqua Club — v4: equipa da casa (caixa / gerente / IT) no PostgreSQL (Supabase)
-- SQL Editor → New query → colar → Run.
-- Correr DEPOIS de schema.sql + schema_v2_pedidos.sql + schema_v3_garcons.sql.
--
-- Login: telemóvel Moçambique + código (bootstrap 123456, depois só o IT altera).
-- ============================================================================

create extension if not exists pgcrypto;

alter table staff add column if not exists job text not null default 'cashier';
alter table staff add column if not exists title text;
alter table staff add column if not exists perms jsonb not null default '[]'::jsonb;
alter table staff add column if not exists can_change_passwords boolean not null default false;
alter table staff add column if not exists pin_hash text;
alter table staff add column if not exists login_fails int not null default 0;
alter table staff add column if not exists locked_until timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'staff_job_chk') then
    alter table staff add constraint staff_job_chk
      check (job in ('cashier','manager','it'));
  end if;
end $$;

create unique index if not exists staff_phone_uq
  on staff (regexp_replace(coalesce(phone, ''), '\D', '', 'g'))
  where phone is not null and length(regexp_replace(phone, '\D', '', 'g')) >= 8;

create table if not exists staff_login_log (
  id uuid primary key default gen_random_uuid(),
  phone_tail text not null,
  ok boolean not null,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists staff_login_log_idx on staff_login_log (created_at desc);

create or replace function mz_phone(p text)
returns text language sql immutable as $$
  select case
    when d like '258%' then substr(d, 4)
    when d like '0%' then substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s;
$$;

create or replace function is_it()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff
     where user_id = auth.uid() and active and can_change_passwords and job = 'it'
  );
$$;

grant execute on function is_it() to authenticated;

-- Só o IT (Siddique) pode gravar um novo código (hash bcrypt/blowfish).
create or replace function it_set_staff_code(p_phone text, p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare digits text := mz_phone(p_phone);
begin
  if not is_it() then
    raise exception 'Só o IT pode alterar códigos de acesso.' using errcode = '42501';
  end if;
  if p_code is null or char_length(p_code) < 5 then
    raise exception 'O código precisa de pelo menos 5 caracteres.' using errcode = '22023';
  end if;
  update staff
     set pin_hash = crypt(p_code, gen_salt('bf', 12)),
         login_fails = 0,
         locked_until = null
   where mz_phone(phone) = digits;
  return found;
end $$;

revoke all on function it_set_staff_code(text, text) from public, anon;
grant execute on function it_set_staff_code(text, text) to authenticated;

-- Verificação local do código (o login de sessão continua no Auth / API).
create or replace function staff_check_code(p_phone text, p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare s staff%rowtype;
        digits text := mz_phone(p_phone);
begin
  if digits is null or char_length(digits) < 8 then return false; end if;
  select * into s from staff where mz_phone(phone) = digits and active limit 1;
  if not found then return false; end if;
  if s.locked_until is not null and s.locked_until > now() then
    raise exception 'Conta temporariamente bloqueada. Aguarde 15 minutos.' using errcode = 'P0001';
  end if;
  if s.pin_hash is null or s.pin_hash = '' then return false; end if;
  if crypt(p_code, s.pin_hash) = s.pin_hash then
    update staff set login_fails = 0, locked_until = null where id = s.id;
    insert into staff_login_log (phone_tail, ok) values (right(digits, 4), true);
    return true;
  end if;
  update staff
     set login_fails = login_fails + 1,
         locked_until = case when login_fails + 1 >= 8 then now() + interval '15 minutes' else locked_until end
   where id = s.id;
  insert into staff_login_log (phone_tail, ok) values (right(digits, 4), false);
  return false;
end $$;

revoke all on function staff_check_code(text, text) from public;
grant execute on function staff_check_code(text, text) to anon, authenticated;

alter table staff_login_log enable row level security;
drop policy if exists staff_login_log_it on staff_login_log;
create policy staff_login_log_it on staff_login_log for select to authenticated using (is_it());
