-- ============================================================================
-- Apaga dados de CLIENTES (pedidos, chamados, histórico).
-- NÃO apaga: contas da equipa (staff), mesas, menu, Auth.
-- SQL Editor → New query → colar → Run.
-- ============================================================================

truncate table order_events restart identity cascade;
truncate table orders restart identity cascade;
truncate table waiter_calls restart identity cascade;
truncate table staff_login_log restart identity cascade;
