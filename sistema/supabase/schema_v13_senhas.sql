-- Aqua Club — v13: palavra-passe da equipa (hash bcrypt com tipo correcto)
-- SQL Editor → New query → colar → Run. Pode correr várias vezes.
-- O login na nuvem usa o Auth. Este hash fica alinhado para o IT actualizar senhas.

create extension if not exists pgcrypto;

create or replace function it_set_staff_code(p_phone text, p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare digits text := mz_phone(p_phone);
begin
  if not is_it() then
    raise exception 'Só o IT pode alterar códigos de acesso.' using errcode = '42501';
  end if;
  if p_code is null or char_length(p_code) < 8 then
    raise exception 'A palavra-passe precisa de pelo menos 8 caracteres.' using errcode = '22023';
  end if;
  update staff
     set pin_hash = crypt(p_code, gen_salt('bf'::text, 12)),
         login_fails = 0,
         locked_until = null
   where mz_phone(phone) = digits;
  return found;
end $$;

revoke all on function it_set_staff_code(text, text) from public, anon;
grant execute on function it_set_staff_code(text, text) to authenticated;

notify pgrst, 'reload schema';
