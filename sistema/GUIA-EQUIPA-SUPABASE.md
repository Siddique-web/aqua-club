# Aqua Club — PostgreSQL / Supabase e contas da equipa

Login de todos: **telemóvel + código `123456`**.  
Só **Siddique Faizy Rego (84 596 1528)** pode alterar códigos.

## 1. Criar o projecto

1. Abra [https://supabase.com/dashboard](https://supabase.com/dashboard) e entre.
2. **New project** → nome `aqua-club` → palavra-passe forte da base (guarde-a) → região mais próxima.
3. Espere o projecto ficar **Active**.

## 2. Tamanho mínimo da password (6)

1. **Authentication → Providers → Email**.
2. **Authentication → Sign In / Providers → Email**: **Minimum password length = 6**.
3. Guarde.

## 3. Scripts SQL (pela ordem)

No menu **SQL Editor → New query**, cole e **Run** um a um:

1. `sistema/supabase/schema.sql`
2. `sistema/supabase/schema_v2_pedidos.sql`
3. `sistema/supabase/schema_v3_garcons.sql`
4. `sistema/supabase/schema_v4_equipa.sql`

## 4. Chaves

**Project Settings → API**:

- Project URL → `SUPABASE_URL`
- `anon` `public` → `SUPABASE_ANON_KEY`
- `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (nunca no site público)

## 5. Criar as 7 contas

Na pasta `plataforma`:

```powershell
$env:SUPABASE_URL="https://SEU-PROJECTO.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
node scripts/seed-supabase-equipa.mjs
```

Isto cria no Auth e na tabela `staff`:

| Nome | Função | Telemóvel | Código inicial |
|---|---|---|---|
| Ana | Caixa | 852329121 | 123456 |
| Joana | Caixa | 878613887 | 123456 |
| Otília | Caixa | 870369844 | 123456 |
| Margarida | Caixa | 872961130 | 123456 |
| Raquel Diogo | Gerente | 879501491 | 123456 |
| João | Gerente | 863586932 | 123456 |
| Siddique Faizy Rego | IT | 845961528 | 123456 |

Caixa: mesas, pedidos, contas, fecho de caixa.  
Gerente: gere o restaurante.  
IT: o mesmo, e **único** a mudar códigos.

## 6. Ligar o site

Em `site/os-config.js`:

```js
window.AQUA_API = window.AQUA_API || '';
window.AQUA_SUPABASE = {
  url: 'https://SEU-PROJECTO.supabase.co',
  anonKey: 'eyJ-anon'
};
```

Reinicie o servidor (`npm start` em `plataforma`) e abra `http://localhost:5173`.

Área da equipa: telemóvel (ex. `852329121`) + código `123456`.

## 7. PostgreSQL local (opcional)

Se quiser o mesmo SQL no seu Postgres:

```bash
psql "postgresql://USER:SENHA@HOST:5432/aqua_club" -f sistema/supabase/schema.sql
psql "postgresql://USER:SENHA@HOST:5432/aqua_club" -f sistema/supabase/schema_v2_pedidos.sql
psql "postgresql://USER:SENHA@HOST:5432/aqua_club" -f sistema/supabase/schema_v3_garcons.sql
psql "postgresql://USER:SENHA@HOST:5432/aqua_club" -f sistema/supabase/schema_v4_equipa.sql
```

O Express (`plataforma`) já grava a equipa na SQLite local **e** aceita o mesmo login telefone+código. Com o Supabase ligado, a Área do garçom usa as contas Auth.

## 8. Alterar códigos (só IT)

1. Entre como **Siddique Faizy Rego** (`845961528` + código actual).
2. Perfil da pessoa ou Equipa → **Actualizar código**.
3. Depois de mudar, o `123456` deixa de funcionar para essa pessoa.

O código é guardado com **bcrypt** (custo 12). Oito tentativas falhadas bloqueiam 15 minutos.

## 9. Segurança

- Não publique a `service_role`.
- Troque o `JWT_SECRET` no `.env` da `plataforma`.
- Peça ao Siddique para trocar o `123456` de cada um após o primeiro dia.
- Números: 84/85/86/87 com 9 dígitos, com ou sem `258`.
