-- ============================================================================
-- Aqua Club — v3: contas dos garçons, papéis, chamados seguros
-- Supabase → SQL Editor → New query → colar tudo → Run.
-- Correr DEPOIS de schema.sql e schema_v2_pedidos.sql. Pode correr-se várias vezes.
--
-- O que faz:
--   1. Cada garçom tem conta pessoal (Supabase Auth) + perfil na tabela staff.
--      Quem se regista fica PENDENTE até um administrador aprovar.
--   2. Dois papéis: 'waiter' (garçom) e 'admin' (gere a equipa e vê tudo).
--   3. Os chamados passam a ser feitos por funções (RPC) validadas no servidor:
--      o cliente não escreve nas tabelas, o garçom só aceita/conclui pelas funções.
--   4. FECHA o acesso anónimo de escrita (dev_all) a tables, menu_items, staff
--      e waiter_calls, e restringe pedidos/eventos a equipa ATIVA (não a
--      qualquer utilizador autenticado).
--   5. set_payment passa a aceitar apenas métodos conhecidos (local/mpesa/emola).
-- ============================================================================

-- 1) Perfil da equipa --------------------------------------------------------
alter table staff add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table staff add column if not exists email text;
alter table staff add column if not exists phone text;
alter table staff add column if not exists color text;
alter table staff add column if not exists created_at timestamptz not null default now();
create unique index if not exists staff_user_uq on staff (user_id) where user_id is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'staff_role_chk') then
    alter table staff add constraint staff_role_chk check (role in ('waiter','admin'));
  end if;
end $$;

-- Contas que já existiam (ex.: quem usa o painel.html) passam a administradores ativos.
-- Corre só para utilizadores ainda sem perfil: candidaturas novas NÃO são promovidas.
insert into staff (user_id, name, email, role, active, color)
select u.id,
       coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), split_part(u.email, '@', 1)),
       u.email, 'admin', true, '#00A8FF'
  from auth.users u
 where not exists (select 1 from staff s where s.user_id = u.id);

-- Cada novo registo cria um perfil PENDENTE (active = false).
create or replace function handle_new_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare cores text[] := array['#00A8FF','#FFB400','#16A34A','#E11D48','#7C3AED','#0891B2','#EA580C','#DB2777'];
begin
  insert into staff (user_id, name, email, phone, role, active, color)
  values (new.id,
          left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)), 60),
          new.email,
          nullif(left(trim(coalesce(new.raw_user_meta_data->>'phone', '')), 20), ''),
          'waiter', false,
          cores[1 + floor(random() * array_length(cores, 1))::int])
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_staff on auth.users;
create trigger on_auth_user_created_staff after insert on auth.users
  for each row execute function handle_new_staff();

-- 2) Funções de papel ---------------------------------------------------------
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and active);
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and active and role = 'admin');
$$;

-- 3) Colunas novas nos chamados ------------------------------------------------
alter table waiter_calls add column if not exists accepted_by_user uuid;
alter table waiter_calls add column if not exists device_id text;
alter table waiter_calls add column if not exists rating smallint;
alter table waiter_calls add column if not exists rating_comment text;
alter table waiter_calls add column if not exists released_count int not null default 0;
create index if not exists waiter_calls_user_idx on waiter_calls (accepted_by_user, created_at desc);
create index if not exists waiter_calls_created_idx on waiter_calls (created_at desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'waiter_calls_rating_chk') then
    alter table waiter_calls add constraint waiter_calls_rating_chk check (rating is null or rating between 1 and 5);
  end if;
end $$;

-- 4) Segurança por linha (RLS) ---------------------------------------------------
alter table tables       enable row level security;
alter table menu_items   enable row level security;
alter table staff        enable row level security;
alter table orders       enable row level security;
alter table order_events enable row level security;
alter table waiter_calls enable row level security;

-- tables / menu_items: leitura pública, escrita só do administrador
drop policy if exists dev_all on tables;
drop policy if exists tables_read on tables;
drop policy if exists tables_admin on tables;
create policy tables_read  on tables for select to anon, authenticated using (true);
create policy tables_admin on tables for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists dev_all on menu_items;
drop policy if exists menu_read on menu_items;
drop policy if exists menu_admin on menu_items;
create policy menu_read  on menu_items for select to anon, authenticated using (true);
create policy menu_admin on menu_items for all to authenticated using (is_admin()) with check (is_admin());

-- staff: cada um vê o seu perfil; o admin vê todos. Escritas só por funções.
drop policy if exists dev_all on staff;
drop policy if exists staff_read on staff;
create policy staff_read on staff for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- pedidos: equipa ATIVA lê/atualiza; só admin apaga; o cliente continua a inserir (v2)
drop policy if exists dev_all on orders;
drop policy if exists staff_orders_all on orders;
drop policy if exists staff_orders_read on orders;
drop policy if exists staff_orders_update on orders;
drop policy if exists staff_orders_delete on orders;
create policy staff_orders_read   on orders for select to authenticated using (is_staff());
create policy staff_orders_update on orders for update to authenticated using (is_staff()) with check (is_staff());
create policy staff_orders_delete on orders for delete to authenticated using (is_admin());

drop policy if exists staff_events_read on order_events;
create policy staff_events_read on order_events for select to authenticated using (is_staff());

-- chamados: só a equipa ativa lê; ninguém escreve direto (tudo por funções)
drop policy if exists dev_all on waiter_calls;
drop policy if exists calls_staff_read on waiter_calls;
create policy calls_staff_read on waiter_calls for select to authenticated using (is_staff());

-- 5) Funções do CLIENTE (anónimo) ---------------------------------------------------
create or replace function create_call(p_table text, p_reason text, p_note text default null, p_device text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t tables%rowtype; existing uuid; new_id uuid; dev text := left(nullif(trim(coalesce(p_device, '')), ''), 64);
begin
  if p_reason is null or p_reason not in ('request_bill','menu_question','new_order','urgent_other') then
    raise exception 'Motivo inválido.' using errcode = '22023';
  end if;
  select * into t from tables where code = p_table;
  if not found then raise exception 'Esta mesa não existe no sistema.' using errcode = '22023'; end if;

  -- já há um chamado ativo desta mesa com o mesmo motivo? devolve esse (evita duplicados)
  select id into existing from waiter_calls
   where table_id = t.id and reason = p_reason and status in ('pending','accepted')
   order by created_at desc limit 1;
  if existing is not null then return existing; end if;

  -- limite por dispositivo: 6 chamados em 10 minutos
  if dev is not null and (select count(*) from waiter_calls
                           where device_id = dev and created_at > now() - interval '10 minutes') >= 6 then
    raise exception 'Demasiados chamados seguidos. Aguarde um momento.' using errcode = '54000';
  end if;

  insert into waiter_calls (table_id, table_code, zone, reason, note, status, device_id)
  values (t.id, t.code, t.zone, p_reason, nullif(left(trim(coalesce(p_note, '')), 140), ''), 'pending', dev)
  returning id into new_id;
  return new_id;
end $$;

create or replace function call_status(p_id uuid)
returns table (status text, accepted_by_name text, created_at timestamptz, accepted_at timestamptz,
               completed_at timestamptz, rating smallint)
language sql security definer set search_path = public as $$
  select c.status, c.accepted_by_name, c.created_at, c.accepted_at, c.completed_at, c.rating
    from waiter_calls c where c.id = p_id limit 1;
$$;

create or replace function cancel_call(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update waiter_calls set status = 'cancelled' where id = p_id and status = 'pending';
  return found;
end $$;

create or replace function rate_call(p_id uuid, p_rating int, p_comment text default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Nota inválida.' using errcode = '22023';
  end if;
  update waiter_calls
     set rating = p_rating, rating_comment = nullif(left(trim(coalesce(p_comment, '')), 140), '')
   where id = p_id and status in ('accepted','completed') and rating is null;
  return found;
end $$;

-- 6) Funções da EQUIPA (exigem sessão de equipa ativa) ---------------------------------
create or replace function accept_call(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare s staff%rowtype;
begin
  select * into s from staff where user_id = auth.uid() and active;
  if not found then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update waiter_calls
     set status = 'accepted', accepted_by_user = s.user_id, accepted_by_id = s.id,
         accepted_by_name = s.name, accepted_at = now()
   where id = p_id and status = 'pending';
  return found;
end $$;

create or replace function complete_call(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update waiter_calls set status = 'completed', completed_at = now()
   where id = p_id and status = 'accepted' and (accepted_by_user = auth.uid() or is_admin());
  return found;
end $$;

create or replace function release_call(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update waiter_calls
     set status = 'pending', accepted_by_user = null, accepted_by_id = null,
         accepted_by_name = null, accepted_at = null, released_count = released_count + 1
   where id = p_id and status = 'accepted' and (accepted_by_user = auth.uid() or is_admin());
  return found;
end $$;

create or replace function update_my_profile(p_name text, p_phone text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare n text := left(trim(coalesce(p_name, '')), 60);
begin
  if not is_staff() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if char_length(n) < 2 then raise exception 'Indique o seu nome.' using errcode = '22023'; end if;
  update staff set name = n, phone = nullif(left(trim(coalesce(p_phone, '')), 20), '')
   where user_id = auth.uid();
  return found;
end $$;

create or replace function admin_set_staff(p_id uuid, p_active boolean, p_role text) returns boolean
language plpgsql security definer set search_path = public as $$
declare target staff%rowtype;
begin
  if not is_admin() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_role not in ('waiter','admin') then raise exception 'Papel inválido.' using errcode = '22023'; end if;
  select * into target from staff where id = p_id;
  if not found then return false; end if;
  if target.user_id = auth.uid() and (not p_active or p_role <> 'admin') then
    raise exception 'Não pode retirar o seu próprio acesso de administrador.' using errcode = '42501';
  end if;
  update staff set active = p_active, role = p_role where id = p_id;
  return true;
end $$;

-- 7) Pagamentos: só métodos conhecidos (corrige texto livre vindo do cliente) ----------------
create or replace function set_payment(p_code text, p_status text, p_method text, p_ref text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('pay_requested', 'paid_declared') then
    raise exception 'estado de pagamento inválido';
  end if;
  if p_method is not null and p_method not in ('local', 'mpesa', 'emola') then
    raise exception 'método de pagamento inválido';
  end if;
  update orders
     set payment_status = p_status, payment_method = p_method, payment_ref = left(p_ref, 40)
   where code = p_code and payment_status in ('unpaid', 'pay_requested') and status <> 'cancelled';
  return found;
end $$;

-- 8) Permissões de execução ------------------------------------------------------------------
revoke all on function handle_new_staff() from public, anon, authenticated;
revoke all on function is_staff() from public, anon;
revoke all on function is_admin() from public, anon;
grant execute on function is_staff() to authenticated;
grant execute on function is_admin() to authenticated;

revoke all on function create_call(text, text, text, text) from public, anon, authenticated;
revoke all on function call_status(uuid) from public, anon, authenticated;
revoke all on function cancel_call(uuid) from public, anon, authenticated;
revoke all on function rate_call(uuid, int, text) from public, anon, authenticated;
grant execute on function create_call(text, text, text, text) to anon, authenticated;
grant execute on function call_status(uuid) to anon, authenticated;
grant execute on function cancel_call(uuid) to anon, authenticated;
grant execute on function rate_call(uuid, int, text) to anon, authenticated;

revoke all on function accept_call(uuid) from public, anon, authenticated;
revoke all on function complete_call(uuid) from public, anon, authenticated;
revoke all on function release_call(uuid) from public, anon, authenticated;
revoke all on function update_my_profile(text, text) from public, anon, authenticated;
revoke all on function admin_set_staff(uuid, boolean, text) from public, anon, authenticated;
grant execute on function accept_call(uuid) to authenticated;
grant execute on function complete_call(uuid) to authenticated;
grant execute on function release_call(uuid) to authenticated;
grant execute on function update_my_profile(text, text) to authenticated;
grant execute on function admin_set_staff(uuid, boolean, text) to authenticated;

revoke all on function set_payment(text, text, text, text) from public, anon, authenticated;
grant execute on function set_payment(text, text, text, text) to anon, authenticated;

-- Pronto. Passo seguinte (uma só vez): registe-se na Área do garçom e promova a sua conta:
--   update staff set role = 'admin', active = true where email = 'o-seu-email@exemplo.com';
