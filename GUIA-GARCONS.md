# Aqua Club — Área do garçom (chamados, contas e estatísticas)

Tudo o que o cliente e o garçom precisam para falar um com o outro, sem WhatsApp, e com o restaurante a ver como a equipa está a trabalhar.

## 1. O que foi acrescentado

**Barra inferior** (em todo o site, telemóvel e computador): `Início` · `Garçom` · `Estatísticas` · `Tema` (claro/escuro). O ícone do garçom mostra o número de chamados à espera.

**Área do garçom** (abre por cima do site; atalho direto: `https://o-seu-site/#garcom`):

| Secção | Para quê |
|---|---|
| **Entrar / Criar conta** | Cada garçom tem a sua conta pessoal. Quem cria conta fica **pendente** até um administrador aprovar. |
| **Chamados** | Fila ao vivo: mesa, zona, motivo, nota do cliente e cronómetro (amarelo aos 2 min, vermelho aos 5 min). Botões **Aceitar**, **Concluir** e **Devolver**. Filtro por zona, som, vibração e notificação. |
| **Histórico** | Os atendimentos de cada um (hoje, 7 ou 30 dias), com tempos e avaliações. |
| **Estatísticas** | Meta do dia, atendimentos, resposta média, tempo de atendimento, nota média, gráficos por dia e por hora, motivos, zonas, conquistas e comentários dos clientes. |
| **Perfil** | Dados pessoais, palavra-passe, alertas e terminar sessão. |
| **Equipa** (só administradores) | Aprovar pedidos de acesso, desativar, promover a administrador e ver o desempenho de cada um. |

**Ciclo do chamado (o que o cliente vê):**

1. Cliente toca em **Chamar garçom** → escolhe o motivo → *“À espera de resposta…”*
2. Garçom toca **Aceitar** → o cliente vê **“Ana aceitou o seu chamado e está a caminho”** e quanto tempo demorou a resposta.
3. Garçom toca **Concluir** → cliente vê **“Atendimento concluído”** e pode **avaliar de 1 a 5 estrelas** (com comentário opcional).
4. Extras: o garçom pode **Devolver** o chamado à fila (o cliente volta a ver “à espera”); o cliente pode **cancelar** enquanto ninguém aceitou; se o cliente **recarregar a página**, o chamado em curso continua; dois garçons nunca aceitam o mesmo chamado.

## 2. Experimentar em 2 minutos (sem configurar nada)

1. Abra o site com `?modo=demo` (ex.: `http://localhost:8080/?mesa=Mesa-04-Rooftop&modo=demo`).
2. Abra **outra aba** com `?modo=demo#garcom` e entre com uma conta de demonstração (palavra-passe `demo1234`):
   `garcom@aquaclub.demo` (garçom) · `joaquim@aquaclub.demo` (garçom) · `admin@aquaclub.demo` (administrador).
3. Na aba do cliente chame o garçom; na aba do garçom aceite, conclua — e veja a outra aba mudar sozinha.
4. Crie uma conta nova numa terceira aba, entre como admin e aprove-a em **Equipa**.

A demonstração guarda tudo no navegador (cada aba pode estar numa conta diferente). Há um botão para simular chamados e outro para repor os dados.

## 3. Ligar ao vivo (Supabase) — cerca de 15 minutos

> Sem este passo, o site funciona como antes (chamados por WhatsApp) e a Área do garçom mostra como ativar.

1. Já tem o Supabase da **Parte D** do `GUIA-PASSO-A-PASSO.md` (SQL `schema.sql` e `schema_v2_pedidos.sql` corridos e `BACKEND` preenchido no `index.html` e no `painel.html`).
2. **SQL Editor → New query** → cole `sistema/supabase/schema_v3_garcons.sql` → **Run** (deve terminar em *Success*).
   - Se algum dia voltar a correr o `schema_v2_pedidos.sql`, **corra o v3 outra vez a seguir** (o v2 repõe regras antigas).
3. **Authentication → Providers → Email:** deixe o e-mail ativo. Sugestão: desligue *Confirm email* (a aprovação do administrador já é a verificação). Se preferir manter, defina **Authentication → URL Configuration → Site URL** com o endereço do seu site.
4. Envie o site para o GitHub (`git add . && git commit -m "Área do garçom" && git push`).
5. **Primeiro administrador (uma só vez):** abra `https://o-seu-site/#garcom` → **Criar conta** com o seu e-mail. Depois, no **SQL Editor**:
   ```sql
   update staff set role = 'admin', active = true where email = 'o-seu-email@exemplo.com';
   ```
   A página abre sozinha com a aba **Equipa**.
6. Cada garçom abre `#garcom`, cria a conta e fica à espera. Em **Equipa** toque em **Aprovar**.

**Contas que já usavam o painel** (criadas antes do v3) passam automaticamente a administradores ativos. Contas criadas depois ficam pendentes até serem aprovadas.

**Teste final (5 minutos):** (a) numa janela anónima, abra `/?mesa=Mesa-04-Rooftop` e chame o garçom; (b) noutro telemóvel, entre como garçom e aceite; (c) o cliente vê o nome; (d) conclua e avalie; (e) veja a avaliação em **Estatísticas**.

## 4. Dia a dia do garçom

- Guarde `…/#garcom` no ecrã inicial do telemóvel e **deixe a página aberta** (pode estar em segundo plano): toca um aviso, o telemóvel vibra e o ícone mostra os chamados à espera.
- Em **Perfil → Ativar notificações** o navegador também avisa quando a página está noutra aba.
- O som precisa de um toque inicial na página (regra dos navegadores).
- Se não conseguir atender, use **Devolver** para outro colega pegar.

## 5. Segurança (o que o v3 faz)

- O cliente **não escreve nas tabelas**: só chama funções que validam mesa, motivo, tamanho do texto e limitam a 6 chamados por dispositivo em 10 minutos.
- Pedidos, eventos e chamados só são lidos por equipa **ativa e aprovada** (antes bastava ter qualquer conta).
- As tabelas `tables`, `menu_items` e `staff` deixaram de estar abertas à escrita pela chave pública.
- Só o administrador gere a equipa; ninguém se auto-aprova nem retira o próprio acesso de administrador.
- Texto escrito por clientes (notas, comentários) é sempre mostrado como texto, nunca como código.
- Corrigido no `painel.html`: método de pagamento mostrado sem escapar (XSS) e fórmulas no CSV exportado. E o `set_payment` só aceita `local`, `mpesa` ou `emola`.

## 6. Limites (para não ter surpresas)

- O aviso só funciona com a página aberta. Notificações com o navegador fechado exigem uma app instalada (fora deste pacote).
- As apps antigas `sistema/apps/web` e `sistema/apps/staff` **deixam de funcionar** com o v3 (usavam tabelas abertas). A Área do garçom do site substitui-as.
- Estatísticas usam os últimos 1000 chamados do período; mais do que isso exige uma função agregada na base de dados.
- Os dias (“hoje”) usam a hora do dispositivo, corrigindo o problema do UTC.
- O tema escuro inverte as cores do site (as fotos mantêm-se); o amarelo fica mais dourado/escuro.
- Plano gratuito do Supabase: o projeto pausa após uma semana sem uso; reative em supabase.com.

## 7. Testes automáticos (em `tests/`)

```bash
cd tests
npm install
npx playwright install chromium
npm run test:sql    # 51 verificações do SQL em PostgreSQL real (permissões, ciclo do chamado, segurança)
npm run test:e2e    # fluxo cliente⇄garçom no modo demonstração, num Chromium real (precisa de Python + playwright)
npm run test:live   # o mesmo fluxo com SQL real por baixo, simulando o Supabase
```

## 8. Problemas comuns

| Sintoma | Solução |
|---|---|
| “Esta mesa não existe no sistema” | O código da mesa (`?mesa=`) tem de existir na tabela `tables` |
| Criei conta e não entro | Está pendente: peça a um administrador para aprovar em **Equipa** |
| Não recebo o e-mail de confirmação | Desligue *Confirm email* (passo 3) ou configure o Site URL |
| “Sem permissão” ao aceitar | A conta não está ativa; verifique em Table Editor → `staff` (`active = true`) |
| Fiquei sem administrador | SQL: `update staff set role='admin', active=true where email='…';` |
| O painel de pedidos deixou de mostrar pedidos | A conta precisa de estar aprovada em `staff` (o v3 aprova as contas antigas; as novas ficam pendentes) |
| Não toca som | Toque uma vez na página; verifique **Perfil → Som** e o volume |
