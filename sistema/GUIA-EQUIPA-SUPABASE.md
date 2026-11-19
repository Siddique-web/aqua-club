# Aqua Club — PostgreSQL / Supabase e contas da equipa

As fichas e os códigos **não estão neste repositório**.  
Ficam em `plataforma/data/staff.json` (pasta ignorada pelo Git) e no Auth do Supabase, com o código em hash (bcrypt).

Só o perfil **IT** (`can_change_passwords`) altera códigos.

## 1. Projecto

1. [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Projecto **aqua-club** → estado **Healthy**.

## 2. Palavra-passe Auth

**Authentication → Providers → Email**: comprimento mínimo **6**.

## 3. SQL (pela ordem)

SQL Editor → New query → Run:

1. `sistema/supabase/schema.sql`
2. `sistema/supabase/schema_v2_pedidos.sql`
3. `sistema/supabase/schema_v3_garcons.sql`
4. `sistema/supabase/schema_v4_equipa.sql`
5. `sistema/supabase/schema_v5_nuvem.sql`
6. `sistema/supabase/schema_v6_tempo_real.sql`
7. `sistema/supabase/schema_v7_estado_cliente.sql`
8. `sistema/supabase/schema_v8_clientes.sql` (contas de cliente; só `@staff.aquaclub.mz` entra na equipa)
9. `sistema/supabase/schema_v9_presenca.sql` (online/offline de clientes e da equipa)
10. `sistema/supabase/schema_v10_limpar_pedidos.sql` (só quando quiser esvaziar pedidos)
11. `sistema/supabase/schema_v11_carga.sql` (heartbeat mais leve com muita gente)

**Authentication → Providers → Email:** ligue “Allow new users to sign up”.  
Para o cliente entrar logo após criar conta, desligue **Confirm email**.

## 4. Chaves

**Project Settings → API**:

- URL + `anon` / publishable → só estas no `site/os-config.js` (chave **pública**, protegida por RLS)
- `service_role` → só no `.env` local, **nunca** no site nem no Git

## 5. Ficha local (servidor)

```
copy plataforma\scripts\staff.example.json plataforma\data\staff.json
```

Edite telefones **só nesse ficheiro**. Depois:

```
$env:AQUA_STAFF_BOOTSTRAP_CODE="codigo-secreto-min-6"
$env:SUPABASE_URL="https://SEU-PROJECTO.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="…"
node scripts/seed-supabase-equipa.mjs
```

## 6. Segurança

- Códigos no Auth (bcrypt no Postgres / Auth). Não em JavaScript público.
- 8 tentativas falhadas → bloqueio 15 min.
- Rode a `service_role` se alguma vez apareceu num terminal.
- Troque os códigos no primeiro dia de operação (perfil IT).
