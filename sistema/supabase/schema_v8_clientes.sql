-- ============================================================================
-- Aqua Club — v8: contas de CLIENTE (registo + login)
-- SQL Editor → New query → colar TUDO → Run.
-- Só e-mails @staff.aquaclub.mz criam perfil de equipa.
-- ============================================================================

create table if not exists public.customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null,
  created_at timestamptz not null default now()
);
create index if not exists customers_email_idx on public.customers (lower(email));
create index if not exists customers_phone_idx on public.customers (phone);

alter table public.customers enable row level security;
drop policy if exists customers_own_read on public.customers;
drop policy if exists customers_own_ins on public.customers;
drop policy if exists customers_own_upd on public.customers;
create policy customers_own_read on public.customers for select to authenticated using (user_id = auth.uid());
create policy customers_own_ins on public.customers for insert to authenticated with check (user_id = auth.uid());
create policy customers_own_upd on public.customers for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.orders add column if not exists customer_user_id uuid references auth.users(id);

drop policy if exists customer_insert_orders on public.orders;
create policy customer_insert_orders on public.orders for insert to authenticated
  with check (
    accepted_terms = true
    and coalesce(length(customer_name), 0) >= 2
    and coalesce(length(customer_phone), 0) >= 9
    and code is not null
    and payment_status = 'unpaid'
    and status = 'received'
    and (customer_user_id is null or customer_user_id = auth.uid())
  );

grant select, insert, update on public.customers to authenticated;

create or replace function public.handle_new_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare cores text[] := array['#00A8FF','#FFB400','#16A34A','#E11D48','#7C3AED','#0891B2','#EA580C','#DB2777'];
        em text := lower(coalesce(new.email, ''));
        nome text := left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(coalesce(new.email, 'cliente'), '@', 1)), 60);
        tel text := nullif(left(trim(coalesce(new.raw_user_meta_data->>'phone', '')), 20), '');
begin
  if em like '%@staff.aquaclub.mz' then
    insert into staff (user_id, name, email, phone, role, active, color)
    values (new.id, nome, new.email, tel, 'waiter', false,
            cores[1 + floor(random() * array_length(cores, 1))::int])
    on conflict do nothing;
  else
    insert into customers (user_id, name, email, phone)
    values (new.id, nome, coalesce(new.email, ''), coalesce(tel, ''))
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

-- Limpa perfis de “equipa” que nasceram de testes de cliente (e-mail que não é da casa).
insert into public.customers (user_id, name, email, phone)
select s.user_id, s.name, coalesce(s.email, ''), coalesce(s.phone, '')
  from public.staff s
 where s.user_id is not null
   and coalesce(s.email, '') not ilike '%@staff.aquaclub.mz'
on conflict (user_id) do nothing;

delete from public.staff
 where coalesce(email, '') not ilike '%@staff.aquaclub.mz';

notify pgrst, 'reload schema';
