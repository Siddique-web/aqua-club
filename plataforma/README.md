# Aqua Club — plataforma de restaurante

Sistema completo para o **Aqua Club CRBM Beira** (Palmeiras 2): menu da carta, contas de cliente, pedidos no local ou para levar, chamados de garçom, pagamentos **M-Pesa / e-Mola / POS** só para o número oficial, e um único login de **administração**.

Os garçons **não têm conta de administrador**. A administração cadastra-os, define o PIN e escala um intervalo de mesas por dia. O terminal do garçom abre com esse PIN.

## Arranque

Requisito: **Node.js 22+**.

```bash
cd plataforma
npm install
npm start
```

Abra **http://localhost:5173**

As contas da administração e os PIN dos garçons **não** estão neste repositório nem nas páginas do site. Use as credenciais já criadas na base de dados (ou defina `AQUA_ADMIN_EMAIL` e `AQUA_ADMIN_PASSWORD` só no ambiente do servidor, nunca no código).

O código de verificação do cliente aparece no ecrã (modo local, sem SMTP). Em produção ligue um servidor de e-mail e deixe de devolver `demoCode`.

Telefone / WhatsApp / M-Pesa / e-Mola oficiais no site: **+258 87 950 1491**. Só este número é aceite. Moeda: **MT** (sem câmbio).

## O que está incluído

- Quatro línguas: Português, English, Español, Français (todo o sítio muda de imediato)
- Menu da carta (tábuas, entradas, pizzas, carnes com **ponto em percentagem**, marisco, cocktails, vinhos, extras, gelo)
- Filtro por categoria e **pratos rápidos**
- Mesa à chegada + foto, nome e contacto do garçom escalado
- Cadastro com nome, telemóvel MZ, e-mail, palavra-passe, confirmação, opção WhatsApp (entrar no grupo ou recusar), guardar sessão, logout
- Pedido só com e-mail confirmado; histórico pago / por pagar
- Código do pedido passa a `AQ-PAY-…` quando a administração confirma o valor
- Alerta de excesso (30 pedidos / 10 min, ou 30 pedidos do mesmo cliente)
- Tempo real (Socket.IO) entre cliente, garçom e admin
- Relatórios CSV, Excel e PDF + gráficos de hora
- SQLite em WAL, compressão, limites de pedidos, índices

## Produção e carga

Um processo Node 22 com SQLite WAL serve o restaurante e milhares de visitas ao menu (ficheiros estáticos + cache). Para picos maiores: coloque um proxy (Nginx), HTTPS, `JWT_SECRET` forte, e no futuro PostgreSQL + Redis adapter do Socket.IO — a API já é REST + eventos, pronta a separar.
