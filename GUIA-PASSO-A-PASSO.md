# Aqua Club — guia passo a passo (testar, configurar, lançar no GitHub, ligar a base de dados)

**Resumo em 30 segundos**
- O site é **HTML puro**: não há nada para "compilar". Abre-se, testa-se e publica-se.
- **Por agora está sem base de dados** (como pediu): pedidos, chamadas e pagamentos abrem o **WhatsApp do restaurante** já escritos; o cliente tem lista e histórico no próprio telemóvel.
- Quando quiser que o restaurante veja tudo em tempo real num painel, liga-se o Supabase (Parte D, ~20 minutos).
- **O site não cobra dinheiro online.** Regista o pedido em nome do cliente, mostra a conta em aberto e orienta o pagamento (no local ou M-Pesa/e-Mola com confirmação do restaurante).

**O que foi testado:** o site e o painel foram testados num navegador automático, em computador e em telemóvel: pedido com identificação, WhatsApp, histórico, pagamento, chamada de garçom, painel, login, auditoria e regras de segurança. A ligação à base de dados foi testada contra um **Supabase simulado** (`sistema/supabase/teste_supabase_falso.js`), **não contra o seu projeto real**. Por isso o passo D inclui um teste final com o seu Supabase. O ficheiro do GitHub Pages também ainda não foi corrido na sua conta.

---
## PARTE A — Testar no seu computador (5 minutos)

1. Descompacte o zip. Dentro há as pastas `site/` e `sistema/`.
2. Abra um terminal **dentro da pasta `site`** e corra (precisa de Python 3, que já vem no Mac/Linux; no Windows instale em python.org):
   ```bash
   cd site
   python3 -m http.server 8080
   ```
   (Sem Python: `npx serve .` ou simplesmente abra `site/index.html` com duplo clique.)
3. Abra no navegador:
   - **Site:** http://localhost:8080
   - **Como se vê ao ler o QR da mesa 4:** http://localhost:8080/?mesa=Mesa-04-Rooftop
   - **Demonstração com resposta simulada:** http://localhost:8080/?modo=demo&mesa=Mesa-04-Rooftop
   - **Painel da equipa em demonstração:** http://localhost:8080/painel.html
4. Para parar: `Ctrl + C`.

### Lista de testes (marque cada um)
**Aspeto**
- [ ] A abertura azul com o logótipo aparece ~2,5 s e some.
- [ ] A galeria 3D do topo muda sozinha; clique num cartão lateral, arraste, use ‹ ›, os pontos e o teclado. **Expandir** abre a foto grande. Os filtros redondos (Todas · Água e lazer · Espaço · Gastronomia · Jogos) funcionam.
- [ ] Os blocos aparecem com *fade-in* ao descer (e voltam a animar se subir e descer).
- [ ] Secção **Espaços**: 4 blocos com 2 fotos; tocar numa foto abre-a em ponto grande.
- [ ] No telemóvel (F12 → ícone de telemóvel) não há barra de rolagem horizontal.

**Menu e pedido**
- [ ] Separadores e pesquisa funcionam; o mural de pratos sobe e desce; tocar num prato abre os detalhes com preço.
- [ ] **+** adiciona; o botão **"Pedido · N · total"** abre o pedido. Escolha a mesa (já vem preenchida com `?mesa=`).
- [ ] **Sem preencher** nome, telemóvel e a caixa dos termos, o envio é **recusado** com aviso claro.
- [ ] Preenchendo tudo e enviando: abre o WhatsApp com a mensagem pronta (código, mesa, cliente, itens, total). Aparece o **código do pedido** e **não há botão de cancelar**.
- [ ] Feche e recarregue a página: o botão mostra **"Conta · X MT por pagar"** e **"Os meus pedidos"** mostra o pedido (lista + histórico).
- [ ] **Pagar:** "Pagar no local" abre a chamada "Pedir a conta"; "M-Pesa/e-Mola" mostra o número, o valor e a referência (código do pedido) e "Já paguei" passa a **"Pagamento a confirmar"**.

**Chamar garçom**
- [ ] O botão preto está sempre visível (e dá uma dica na primeira visita). Escolha o motivo: no modo WhatsApp mostra **"Chamada enviada!"** e o tempo; no modo demonstração mostra "À espera de resposta…" e depois **"Respondido! Nádia a caminho"**.

**Resto**
- [ ] Atrações: círculos ficam azuis ao passar o rato. Experiências: o **+** de "Cabana VIP" salta para a reserva com a experiência escolhida.
- [ ] Reserva, Fale connosco e Avaliação abrem o WhatsApp. Como chegar: mapa, ligar, WhatsApp e e-mail.
- [ ] FAQ: as 9 perguntas abrem e fecham.

---
## PARTE B — Pôr os dados reais do restaurante (OBRIGATÓRIO antes de publicar)

Abra `site/index.html` num editor (VS Code ou Bloco de Notas). No fim do ficheiro há um `<script>`; no topo dele estão as configurações. Use *Procurar* (Ctrl+F) por cada nome:

1. **`CONTACT`** — troque `258840000000` pelo **WhatsApp real** (só dígitos, com 258). ⚠️ **Enquanto for o número de exemplo, os pedidos e as chamadas vão para um número que não é do restaurante.** Troque também telefone, e-mail, morada e redes sociais.
2. **`PAYMENT`** — troque `84 000 0000` (M-Pesa) e `86 000 0000` (e-Mola) pelos números reais. Se o restaurante não usa M-Pesa ou e-Mola, apague essa linha `{ id: 'mpesa' ... }`.
3. **`MENU`** — pratos e **preços em MT**. ⚠️ **Os preços que lá estão são exemplos.** Em `allergens` e `ingredients` ponha só informação confirmada.
   ```js
   { id: 'brus', cat: 'petiscos', name: 'Bruschettas', desc: '...', price: 350, img: 'assets/prato-petiscos.jpg' }
   ```
   Sem foto use `icon: 'i-drink'` (ou `'i-juice'`). Categorias em `CATS`.
4. **`TABLES`** — as mesas (o código tem de ser igual ao do QR Code, ex.: `Mesa-04-Rooftop`).
5. **`WALL`** (procure no script) — o mural de pratos: cada cartão é `[id do prato, foto]`; `null` = cartão azul com ícone. Ponha aqui as fotos das bebidas quando as tiver.
6. **Fotos** — guarde as suas em `site/assets/` (ver `site/assets/LEIA-ME.txt`). Para toboáguas, rio lento e cabanas, ponha a foto e troque o ícone por `<img>` no cartão em "Atrações".
7. **Termos do pedido** — procure `Termos do pedido` no HTML e peça a um jurista que reveja o texto.
8. **QR Codes** — um por mesa, em qualquer gerador, com o endereço `https://SEU-SITE/?mesa=Mesa-04-Rooftop`.

Volte a testar (Parte A) depois de alterar.

---
## PARTE C — Lançar no GitHub (site online, grátis)

### C1. Preparar (uma vez)
1. Crie conta em https://github.com.
2. Instale o **Git**: https://git-scm.com/downloads (Windows: instalador; Mac: `xcode-select --install`; Linux: `sudo apt install git`). Confirme com `git --version`.
3. Diga ao Git quem é (uma vez por computador):
   ```bash
   git config --global user.name "O Seu Nome"
   git config --global user.email "o-seu-email@exemplo.com"
   ```

### C2. Criar o repositório no GitHub
1. No GitHub: **New repository** → nome `aqua-club` → **Public** (o GitHub Pages grátis precisa de repositório público) → **não** marque "Add README" → **Create repository**.
2. Copie o endereço que aparece, por exemplo `https://github.com/SEU-USER/aqua-club.git`.

### C3. Enviar o projeto
No terminal, **dentro da pasta `aqua-club-completo`** (a que tem `site/`, `sistema/` e este guia):
```bash
git init
git add .
git commit -m "Site Aqua Club"
git branch -M main
git remote add origin https://github.com/SEU-USER/aqua-club.git
git push -u origin main
```
(O GitHub pede o início de sessão; se pedir palavra-passe, use um **token** em Settings → Developer settings → Personal access tokens, ou instale o **GitHub Desktop**, que faz tudo com botões.)
✅ O `.gitignore` já impede o envio de ficheiros pesados e de segredos (`.env`).

### C4. Ligar o GitHub Pages
1. No repositório: **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Vá ao separador **Actions**: deve aparecer "Publicar site no GitHub Pages" a correr (1–2 min). Quando ficar verde, o site está em:
   **`https://SEU-USER.github.io/aqua-club/`**
   (Se não arrancou, abra o workflow e clique **Run workflow**.)
4. Teste esse endereço no telemóvel, incluindo `https://SEU-USER.github.io/aqua-club/?mesa=Mesa-04-Rooftop`.

### C5. Atualizar o site depois
Altere os ficheiros e envie:
```bash
git add .
git commit -m "Atualizei o menu"
git push
```
O site atualiza sozinho em 1–2 minutos.

### C6. Domínio próprio (opcional)
Settings → Pages → **Custom domain** (ex.: `aquaclub.co.mz`) e siga as instruções de DNS do GitHub.

### C7. Hospedar na Vercel (alternativa ao GitHub Pages)
1. https://vercel.com → **Sign Up → Continue with GitHub**.
2. **Add New → Project** → escolha o repositório `aqua-club` → **Import**.
3. ⚠️ Antes de clicar Deploy: em **Root Directory** clique **Edit** e escolha a pasta **`site`**. **Framework Preset: Other.** Deixe **Build Command**, **Output Directory** e **Install Command** vazios (sem "Override").
4. **Deploy**. O site abre sem base de dados e sem variáveis de ambiente.
5. Se a Vercel já tinha sido criada com outra pasta: **Settings → General → Root Directory = `site` → Save**, depois **Deployments → ⋯ → Redeploy** (sem cache).
6. Abra sempre o endereço **de produção** (Settings → Domains, ou o botão **Visit** do projeto). Os endereços do tipo `aqua-club-xxxxx-...vercel.app` dos deploys antigos **ficam para sempre com a versão antiga**.
7. Se aparecer "Falta configurar o Supabase…", a Vercel está a servir a pasta `sistema` (app antiga): repita o ponto 5.

> Alternativa sem GitHub: arraste a pasta `site` para https://app.netlify.com/drop.

---
## PARTE D — Ligar a base de dados (quando o restaurante quiser ver tudo em tempo real)

Com isto, os pedidos e chamadas chegam ao **painel da equipa**, o cliente vê o estado a mudar sozinho (recebido → em preparação → a caminho → entregue), e o restaurante vê **quem pediu, o que falta pagar, o histórico e a auditoria**.

1. **Supabase:** crie conta em https://supabase.com → **New project**.
2. **SQL Editor → New query**, cole e corra (**Run**), por esta ordem:
   1. `sistema/supabase/schema.sql` (tabelas, mesas de exemplo, tempo real);
   2. `sistema/supabase/schema_v2_pedidos.sql` (identificação do cliente, pagamentos, auditoria **e segurança**). Cada um deve terminar em "Success".
3. **Mesas:** em **Table Editor → tables**, deixe só as mesas reais, com o **mesmo código** dos QR Codes (`Mesa-04-Rooftop`).
4. **Equipa:** **Authentication → Users → Add user** (e-mail + palavra-passe) para cada pessoa que vai usar o painel.
5. **Chaves:** **Project Settings → API**: copie o **Project URL** e a chave **anon public**. (⚠️ Nunca use a chave `service_role` no site.)
6. Em `site/index.html` **e** em `site/painel.html`, no topo do script:
   ```js
   const BACKEND = { url: 'https://SEU-PROJETO.supabase.co', key: 'SUA_CHAVE_ANON' };
   ```
7. Envie para o GitHub (`git add . && git commit -m "Ligar base de dados" && git push`).
8. **Teste final com o seu Supabase (10 minutos):**
   1. Abra `.../?mesa=Mesa-04-Rooftop`, faça um pedido com nome e telemóvel. Confirme que aparece em **Table Editor → orders** com `customer_name`, `customer_phone`, `accepted_terms = true`, `payment_status = unpaid`.
   2. Abra `.../painel.html`, entre com o e-mail da equipa. O pedido aparece em "Recebidos", com nome e telemóvel.
   3. Clique **Aceitar** → no telemóvel do cliente o estado passa a "Em preparação" em poucos segundos.
   4. No cliente: **Pagar → Pagar no local**. No painel aparece "Conta pedida".
   5. No painel, separador **Contas por mesa → Fechar conta (pago)** → no cliente fica "Pago ✓". Em **Histórico** abra o pedido: veja a linha do tempo.
   6. Tente abrir o painel numa janela sem sessão: pede login. O cliente **não** consegue ler pedidos de outras pessoas.

**Segurança já incluída:** o cliente (anónimo) só pode **criar** pedidos, sempre "por pagar" e com termos aceites; só vê o estado do **próprio** pedido (pelo código); só a equipa autenticada lê e altera tudo; todas as mudanças de estado e pagamento ficam registadas (quem, quando).
**Atenção:** as tabelas das mesas e das chamadas de garçom continuam abertas ao cliente (servem a app dos garçons de teste e não têm dados pessoais). Para a app dos garçons em produção, ponha também login (Supabase Auth).

---
## PARTE E — Usar o painel da equipa
- Abra `.../painel.html` (guarde nos favoritos do telemóvel/tablet do caixa e da cozinha). Toque num pedido novo: soa um aviso e o cartão pisca.
- **Pedidos ativos:** quatro colunas. Um botão faz avançar o pedido ("Aceitar → Em preparação", "Pronto → A caminho", "Entregue na mesa").
- **Contas por mesa:** total por pagar, nomes e telemóveis de quem pediu, há quanto tempo. **Fechar conta (pago)** pede a forma de pagamento (dinheiro, cartão, M-Pesa, e-Mola) e a referência. Mesas entregues e por pagar há mais de 20 minutos ficam **a vermelho**; ligue ao cliente com um toque no número.
- **Histórico e clientes:** pesquise por nome, telemóvel (aceita "84 123"), código ou mesa; filtre por data e pagamento; **Exportar CSV**.
- **Detalhe do pedido:** termos aceites, itens, pagamento e linha do tempo. **Só a equipa cancela**, com motivo obrigatório.
- Sem `BACKEND` o painel abre em **demonstração** (dados de exemplo). Pode forçar com `painel.html?demo=1`.

## PARTE F — Opcional: app dos garçons e painel admin (sistema/)
Só se quiser a app móvel dos garçons com cronómetro das chamadas. Precisa de Node.js 20+:
```bash
cd sistema
npm install
cp .env.example apps/staff/.env      # preencha EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY
npm run typecheck && npm test && npm run build:web
npm run staff                        # leia o QR Code com a app Expo Go
```
(O painel `site/painel.html` já cobre pedidos e contas; a app dos garçons é para as chamadas.)

---
## Pagamentos — o que existe e o que não existe
- **Existe:** registo do pedido em nome do cliente, conta por pagar visível ao cliente e à equipa, pagamento no local, declaração de pagamento por M-Pesa/e-Mola com referência, e confirmação pela equipa, com auditoria.
- **Não existe:** cobrança automática. Para cobrar online (M-Pesa, e-Mola, cartão) é preciso escolher um fornecedor, abrir conta empresarial e usar as chaves dele **num servidor** (por exemplo uma função do Supabase). Quando tiver as credenciais, pode acrescentar-se sem mudar o resto.

## Problemas comuns
| Sintoma | Solução |
|---|---|
| Os pedidos abrem o WhatsApp de um número estranho | `CONTACT.whatsapp` ainda é o de exemplo (Parte B) |
| O WhatsApp não abre | O navegador bloqueou a janela: toque em "Não abriu? Toque aqui" |
| "Esta mesa não existe no sistema" | O código da mesa não está na tabela `tables` do Supabase |
| O painel pede login e não entra | Crie o utilizador em Authentication → Users; confirme o `BACKEND` no `painel.html` |
| Não aparece nada no painel | `BACKEND` vazio (demonstração) ou o SQL v2 não foi corrido |
| O site não aparece no GitHub Pages | Settings → Pages → Source = GitHub Actions; veja o separador Actions |
| Letras diferentes | Sem internet o Google Fonts não carrega; é só estético |
