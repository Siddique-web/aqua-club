-- Aqua Club — v12: o cliente vê o chamado aceite/concluído em tempo real
-- SQL Editor → New query → colar → Run. Pode correr várias vezes.

alter table if exists public.waiter_calls replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.waiter_calls;
  exception when duplicate_object then null;
  end;
end $$;

drop policy if exists calls_guest_track on public.waiter_calls;
create policy calls_guest_track on public.waiter_calls
  for select to anon, authenticated
  using (created_at > now() - interval '12 hours');

notify pgrst, 'reload schema';
