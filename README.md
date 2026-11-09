# Aqua Club — CRBM Beira

Site do complexo (slides, menu, pedidos) e plataforma de restaurante (garçom, administração, pagamentos) num só arranque.

## Arranque

Requisito: **Node.js 22+**.

```bash
cd plataforma
npm install
npm start
```

Abra **http://localhost:5173**

O servidor publica a pasta `site/` (site público) e a API em `/api` (pedidos, chamados, painel).

- Cliente: `/`
- Painel: `/painel.html`
- Administração: `/os`
- Terminal do garçom: `/os#/staff`

As contas da equipa e os PIN **não** estão neste repositório. Use as credenciais já criadas na base de dados local, ou defina `AQUA_ADMIN_EMAIL` e `AQUA_ADMIN_PASSWORD` só no ambiente do servidor.

## Produção

A pasta `site/` continua a ser a origem publicada no Vercel (ficheiros estáticos). Pedidos em tempo real, SQLite e Socket.IO correm com `npm start` na `plataforma/` (Node 22).

Não publique ficheiros `.env` nem a pasta `plataforma/data/`.
