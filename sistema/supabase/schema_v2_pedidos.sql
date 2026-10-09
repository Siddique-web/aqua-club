-- =====================================================================
-- Aqua Club — v2: pedidos com identificação do cliente, pagamentos,
-- histórico (auditoria) e segurança por papéis.
-- Correr DEPOIS de schema.sql:  Supabase → SQL Editor → New query → Run.
-- Pode ser corrido mais do que uma vez sem estragar nada.
-- =====================================================================

-- 1) Novos campos nos pedidos --------------------------------------------------
alter table orders add column if not exists code text;
alter table orders add column if not exists customer_name text;
alter table orders add column if not exists customer_phone text;
alter table orders add column if not exists accepted_terms boolean not null default false;
alter table orders add column if not exists accepted_at timestamptz;
alter table orders add column if not exists device_id text;
alter table orders add column if not exists payment_status text not null default 'unpaid';
alter table orders add column if not exists payment_method text;
alter table orders add column if not exists payment_ref text;
alter table orders add column if not exists paid_at timestamptz;
alter table orders add column if not exists cancel_reason text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_status_chk') then
    alter table orders add constraint orders_payment_status_chk
      check (payment_status in ('unpaid','pay_requested','paid_declared','paid'));
  end if;
end $$;

create unique index if not exists orders_code_uq on orders (code);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_phone_idx on orders (customer_phone);
create index if not exists orders_pay_idx on orders (payment_status);

-- 2) Histórico automático (quem mudou o quê e quando) -------------------------
create table if not exists order_events (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  at timestamptz not null default now(),
  actor text,
  event text not null,
  detail jsonb
);
create index if not exists order_events_order_idx on order_events (order_id, at);

create or replace function log_order_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := coalesce(auth.jwt() ->> 'email', 'cliente');
begin
  if tg_op = 'INSERT' then
    insert into order_events (order_id, actor, event, detail)
    values (new.id, 'cliente', 'criado',
            jsonb_build_object('nome', new.customer_name, 'telemovel', new.customer_phone, 'total', new.total_mzn, 'termos_aceites', new.accepted_terms));
  else
    new.updated_at := now();
    if new.status is distinct from old.status then
      insert into order_events (order_id, actor, event, detail)
      values (new.id, who, 'estado', jsonb_build_object('de', old.status, 'para', new.status, 'motivo', new.cancel_reason));
    end if;
    if new.payment_status is distinct from old.payment_status then
      insert into order_events (order_id, actor, event, detail)
      values (new.id, who, 'pagamento', jsonb_build_object('de', old.payment_status, 'para', new.payment_status, 'metodo', new.payment_method, 'ref', new.payment_ref));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_audit_ins on orders;
create trigger orders_audit_ins after insert on orders for each row execute function log_order_change();
drop trigger if exists orders_audit_upd on orders;
create trigger orders_audit_upd before update on orders for each row execute function log_order_change();

-- 3) Segurança --------------------------------------------------------------
--    Clientes (anon): só podem CRIAR pedidos, sempre "por pagar" e com termos aceites.
--    Equipa (autenticada com e-mail/palavra-passe): lê e gere tudo.
alter table orders enable row level security;
alter table order_events enable row level security;

drop policy if exists dev_all on orders;
drop policy if exists anon_insert_orders on orders;
drop policy if exists staff_orders_all on orders;
drop policy if exists staff_events_read on order_events;

create policy anon_insert_orders on orders for insert to anon
  with check (accepted_terms = true
              and coalesce(length(customer_name), 0) >= 2
              and coalesce(length(customer_phone), 0) >= 9
              and code is not null
              and payment_status = 'unpaid'
              and status = 'received');
create policy staff_orders_all on orders for all to authenticated using (true) with check (true);
create policy staff_events_read on order_events for select to authenticated using (true);

-- 4) Funções que o cliente pode usar (sem ver dados de outras pessoas) ---------
create or replace function order_status(p_code text)
returns table (status text, payment_status text, payment_method text)
language sql security definer set search_path = public as $$
  select o.status, o.payment_status, o.payment_method from orders o where o.code = p_code limit 1;
$$;

create or replace function set_payment(p_code text, p_status text, p_method text, p_ref text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('pay_requested', 'paid_declared') then
    raise exception 'estado de pagamento inválido';
  end if;
  update orders
     set payment_status = p_status, payment_method = p_method, payment_ref = p_ref
   where code = p_code and payment_status in ('unpaid', 'pay_requested') and status <> 'cancelled';
  return found;
end $$;

revoke all on function order_status(text) from public;
revoke all on function set_payment(text, text, text, text) from public;
grant execute on function order_status(text) to anon, authenticated;
grant execute on function set_payment(text, text, text, text) to anon, authenticated;

-- 5) Depois de correr isto:
--    Supabase → Authentication → Users → "Add user": crie o e-mail e a palavra-passe da equipa
--    (é com eles que se entra no painel.html).
