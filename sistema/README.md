# Aqua Club — plataforma digital (React + React Native + Supabase)

Monorepo (npm workspaces) em TypeScript:

| Pasta | O que é |
|---|---|
| `packages/shared` | Tipos (`Order`, `Table`, `WaiterCall`, `Analytics`…), serviços Supabase e hooks em tempo real |
| `apps/web` | Vite + React 19 + Tailwind 4: **cliente** (`/`) e **painel admin** (`/admin`) |
| `apps/staff` | Expo (React Native): app dos **garçons** |
| `supabase/schema.sql` | Tabelas, tempo real, políticas de desenvolvimento e dados de exemplo |

## 0. Requisitos
- Node.js 20+ (testado com 22) e npm 10+
- Conta gratuita em https://supabase.com
- Para a app do garçom: telemóvel com **Expo Go** (mesma Wi-Fi do computador) ou emulador Android/iOS

## 1. Criar o projecto Supabase
1. Em supabase.com → **New project** (guarda a palavra-passe da BD).
2. Menu **SQL Editor → New query**, cola o conteúdo de `supabase/schema.sql` e clica **Run**.
   Deve aparecer "Success". Isto cria as tabelas, activa o tempo real e insere 6 mesas, 3 garçons e 8 pratos.
3. Menu **Project Settings → API**: copia o **Project URL** e a chave **anon public**.

## 2. Instalar
```bash
unzip aqua-club.zip && cd aqua-club
npm install
```

## 3. Configurar variáveis
```bash
# Web
cp .env.example apps/web/.env.local      # edita e deixa só as linhas VITE_*
# Staff
cp .env.example apps/staff/.env          # edita e deixa só as linhas EXPO_PUBLIC_*
```
Preenche URL e chave anon nos dois ficheiros.

## 4. Compilar e testar (verificações automáticas)
```bash
npm run typecheck     # TypeScript rigoroso: shared, web e staff
npm test              # testes do carrinho (3 testes)
npm run build:web     # build de produção em apps/web/dist
```
Todos devem terminar sem erros.

## 5. Executar
```bash
npm run web      # http://localhost:5173
npm run staff    # abre o Expo; lê o QR Code com a app Expo Go
```
Se o Expo mostrar "Falta configurar o Supabase", confirma `apps/staff/.env` e reinicia com `npx expo start -c`.
Se o telemóvel não ligar, tenta `npx expo start --tunnel` (dentro de `apps/staff`).

## 6. Teste ponta a ponta (5 minutos)
1. **Cliente:** abre `http://localhost:5173/?mesa=Mesa-04-Rooftop` (é o que o QR Code da mesa contém).
   Sem `?mesa=`, aparece a lista para escolher a mesa manualmente.
2. **Pedido:** adiciona pratos, abre "Ver pedido", escreve "sem cebola" numa nota e envia. Confirma em Supabase → Table Editor → `orders`.
3. **Garçom:** na app Expo escolhe "Amélia".
4. **Chamar garçom:** no cliente clica **Chamar garçom → Pedir a conta**. No telemóvel o cartão aparece em segundos com o cronómetro a correr.
5. **Aceitar:** toca **Aceitar requisição**. No browser do cliente surge "Amélia já está a caminho!".
6. **Anti-duplicação:** abre a app Expo em dois dispositivos (ou Expo Go + emulador), entra com garçons diferentes e aceita a mesma chamada nos dois: só o primeiro vence; o outro recebe "Já atendida" e o cartão desaparece.
7. **Concluir:** "Marcar como concluída" fecha o ciclo.
8. **Admin:** abre `http://localhost:5173/admin`.

## 7. QR Codes das mesas
Gera um QR (qualquer gerador, ex.: qr-code-generator.com) por mesa com o URL
`https://SEU-DOMINIO/?mesa=Mesa-04-Rooftop`. Os códigos válidos estão na tabela `tables` (coluna `code`).

## 8. Publicar o site
`npm run build:web` e envia `apps/web/dist` para Vercel/Netlify (define as duas variáveis `VITE_*` no painel).
Como é uma SPA, configura o fallback para `index.html` (para que `/admin` funcione).

## Estado actual — o que é real e o que falta
**Funciona:** menu, carrinho, pedidos, chamada de garçom, aceitação atómica em tempo real, feed do staff com cronómetro, dashboard.
**Atenção:**
- O **painel admin usa dados de demonstração** (`apps/web/src/data/mockAnalytics.ts`). Para dados reais, cria views/RPC no Supabase sobre `waiter_calls` e `orders` e troca `fetchAnalytics` em `AdminDashboard.tsx`.
- **Segurança:** `schema.sql` abre a tabela à chave `anon` **só para desenvolvimento**. O login do garçom é uma escolha de nome. Antes de produção: Supabase Auth (staff/admin), tabela de perfis com papel, e políticas RLS por papel (cliente só vê/cria o seu; staff faz UPDATE em chamadas; admin tudo). `/admin` não tem proteção até lá.
- Ainda não existem: login do cliente, avaliações, gestão de catálogo/staff no admin, estados do pedido na UI do cliente (a tabela `orders` já os suporta).
