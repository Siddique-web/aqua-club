-- ============================================================================
-- Aqua Club — v6: tempo real de pedidos e chamados para toda a equipa
-- SQL Editor → New query → colar → Run. Pode correr várias vezes.
-- ============================================================================

alter table if exists public.orders replica identity full;
alter table if exists public.waiter_calls replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.orders;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.waiter_calls;
  exception when duplicate_object then null;
  end;
end $$;

-- Toda a equipa activa lê pedidos e chamados (caixa, gerente, IT)
drop policy if exists staff_orders_read on public.orders;
create policy staff_orders_read on public.orders
  for select to authenticated using (is_staff());

drop policy if exists staff_orders_update on public.orders;
create policy staff_orders_update on public.orders
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists calls_staff_read on public.waiter_calls;
create policy calls_staff_read on public.waiter_calls
  for select to authenticated using (is_staff());

notify pgrst, 'reload schema';
