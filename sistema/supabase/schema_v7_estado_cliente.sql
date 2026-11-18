-- ============================================================================
-- Aqua Club — v7: o cliente lê o estado do pedido pelo código (sem dados pessoais)
-- SQL Editor → New query → colar TUDO → Run.
-- ============================================================================

drop function if exists public.order_status(text);

create function public.order_status(p_code text)
returns table (code text, status text, payment_status text, payment_method text)
language sql security definer set search_path = public as $$
  select o.code, o.status, o.payment_status, o.payment_method
    from orders o
   where o.code = p_code
   limit 1;
$$;

revoke all on function public.order_status(text) from public;
grant execute on function public.order_status(text) to anon, authenticated;
