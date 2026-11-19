-- ============================================================================
-- Aqua Club — apagar TODOS os pedidos e o histórico de eventos
-- SQL Editor → New query → colar TUDO → Run.
-- Não apaga clientes, funcionários, mesas nem presença.
-- ============================================================================

truncate table public.orders restart identity cascade;
