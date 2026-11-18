-- ============================================================================
-- Aqua Club — v5: pedidos e chamados 100% na nuvem (mesas 1–200 + zonas)
-- SQL Editor → New query → colar → Run.
-- Correr DEPOIS de schema.sql + v2 + v3 + v4.
-- ============================================================================

-- 1) Zonas do recinto (o site já não é só rooftop / piscina / sala)
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
      from pg_constraint c
     where c.contype = 'c'
       and c.conrelid in ('public.tables'::regclass, 'public.waiter_calls'::regclass)
       and pg_get_constraintdef(c.oid) ilike '%zone%'
  loop
    execute format('alter table %s drop constraint if exists %I', r.tbl, r.conname);
  end loop;
end $$;

alter table tables add constraint tables_zone_chk
  check (zone in (
    'mesa','rooftop','piscina','sala-principal','sala','esplanada','snack','cafeteria',
    'ginasio','bar','kids','bilhar','lounge','parque','recepcao','wc','all','takeaway','delivery'
  ));

alter table waiter_calls add constraint waiter_calls_zone_chk
  check (zone in (
    'mesa','rooftop','piscina','sala-principal','sala','esplanada','snack','cafeteria',
    'ginasio','bar','kids','bilhar','lounge','parque','recepcao','wc','all','takeaway','delivery'
  ));

-- 2) Estados de pedido alinhados com o painel da casa
do $$ begin
  alter table orders drop constraint if exists orders_status_check;
exception when undefined_object then null;
end $$;
alter table orders drop constraint if exists orders_status_chk;
alter table orders add constraint orders_status_chk
  check (status in ('received','review','preparing','ready','on_the_way','delivered','cancelled','no_confirm'));

-- 3) Campos extra do pedido (delivery, POS, recepção)
alter table orders add column if not exists fulfillment text;
alter table orders add column if not exists take text;
alter table orders add column if not exists address text;
alter table orders add column if not exists place_label text;
alter table orders add column if not exists lat numeric;
alter table orders add column if not exists lng numeric;
alter table orders add column if not exists note text;
alter table orders add column if not exists wa_group boolean not null default false;
alter table orders add column if not exists driver_ok boolean not null default false;
alter table orders add column if not exists client_ok boolean not null default false;
alter table orders add column if not exists received_ok boolean not null default false;
alter table orders add column if not exists delivery_fee numeric not null default 0;

-- 4) Mesas 1–200 + fallbacks (código = número, como no site)
insert into tables (code, zone, seats)
select gs::text, 'mesa', 4
  from generate_series(1, 200) gs
on conflict (code) do nothing;

insert into tables (code, zone, seats) values
  ('recinto', 'all', 0),
  ('takeaway', 'takeaway', 0),
  ('delivery', 'delivery', 0)
on conflict (code) do nothing;

-- 5) Chamado: aceita "5", "Mesa 5" ou sítio sem mesa → recinto
create or replace function create_call(p_table text, p_reason text, p_note text default null, p_device text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t tables%rowtype; existing uuid; new_id uuid;
        dev text := left(nullif(trim(coalesce(p_device, '')), ''), 64);
        digits text := regexp_replace(coalesce(p_table, ''), '\D', '', 'g');
begin
  if p_reason is null or p_reason not in ('request_bill','menu_question','new_order','urgent_other') then
    raise exception 'Motivo inválido.' using errcode = '22023';
  end if;

  select * into t from tables where code = p_table limit 1;
  if not found and digits <> '' then
    select * into t from tables where code = digits limit 1;
  end if;
  if not found then
    select * into t from tables where code = 'recinto' limit 1;
  end if;
  if not found then raise exception 'Esta mesa não existe no sistema.' using errcode = '22023'; end if;

  select id into existing from waiter_calls
   where table_id = t.id and reason = p_reason and status in ('pending','accepted')
   order by created_at desc limit 1;
  if existing is not null then return existing; end if;

  if dev is not null and (select count(*) from waiter_calls
                           where device_id = dev and created_at > now() - interval '10 minutes') >= 6 then
    raise exception 'Demasiados chamados seguidos. Aguarde um momento.' using errcode = '54000';
  end if;

  insert into waiter_calls (table_id, table_code, zone, reason, note, status, device_id)
  values (t.id, t.code, t.zone, p_reason, nullif(left(trim(coalesce(p_note, p_table, '')), 140), ''), 'pending', dev)
  returning id into new_id;
  return new_id;
end $$;

grant execute on function create_call(text, text, text, text) to anon, authenticated;

-- 6) Pagamento: POS + M-Pesa + e-Mola
create or replace function set_payment(p_code text, p_status text, p_method text, p_ref text)
returns boolean language plpgsql security definer set search_path = public as $$
declare st text := p_status;
        mth text := p_method;
begin
  if st = 'declared' then st := 'paid_declared'; end if;
  if st not in ('pay_requested', 'paid_declared') then
    raise exception 'estado de pagamento inválido';
  end if;
  if mth is not null and mth not in ('local', 'mpesa', 'emola', 'pos') then
    raise exception 'método de pagamento inválido';
  end if;
  if mth = 'pos' then st := 'unpaid'; end if;
  update orders
     set payment_status = st, payment_method = mth, payment_ref = left(p_ref, 40)
   where code = p_code and payment_status in ('unpaid', 'pay_requested', 'paid_declared') and status <> 'cancelled';
  return found;
end $$;

grant execute on function set_payment(text, text, text, text) to anon, authenticated;

-- 7) Equipa actualiza pedido (caixa / gerente / IT)
create or replace function staff_patch_order(
  p_id uuid,
  p_status text default null,
  p_pay text default null,
  p_method text default null,
  p_driver boolean default null,
  p_received boolean default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
        pay text := p_pay;
        st text := p_status;
begin
  if not is_staff() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select * into o from orders where id = p_id;
  if not found then return false; end if;
  if pay = 'declared' then pay := 'paid_declared'; end if;

  if p_driver is true then o.driver_ok := true; end if;
  if p_received is true then
    o.received_ok := true; o.client_ok := true; o.driver_ok := true;
  end if;
  if pay is not null then o.payment_status := pay; end if;
  if p_method is not null then o.payment_method := p_method; end if;
  if st is not null then o.status := st; end if;

  if o.payment_status = 'paid' then o.paid_at := coalesce(o.paid_at, now()); end if;
  if o.received_ok and o.payment_status = 'paid' then o.status := 'delivered';
  elsif o.driver_ok and o.status in ('ready','preparing','review','received') then o.status := 'on_the_way';
  end if;

  update orders set
    status = o.status,
    payment_status = o.payment_status,
    payment_method = o.payment_method,
    paid_at = o.paid_at,
    driver_ok = o.driver_ok,
    client_ok = o.client_ok,
    received_ok = o.received_ok,
    updated_at = now()
  where id = p_id;
  return true;
end $$;

revoke all on function staff_patch_order(uuid, text, text, text, boolean, boolean) from public, anon;
grant execute on function staff_patch_order(uuid, text, text, text, boolean, boolean) to authenticated;

-- 8) Caixa (role waiter) também lê a lista da casa
drop policy if exists staff_read on staff;
create policy staff_read on staff for select to authenticated
  using (user_id = auth.uid() or is_staff());
