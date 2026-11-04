# Testes automáticos

Não fazem parte do site (não são publicados). Servem para confirmar que tudo continua a funcionar depois de qualquer alteração.

```bash
npm install
npx playwright install chromium
pip install playwright      # só para test:e2e
npm test                    # corre os três
```

| Teste | O que verifica |
|---|---|
| `sql-v3.test.mjs` | Corre `schema.sql` + v2 + v3 em PostgreSQL real e testa permissões (anónimo / conta pendente / garçom / admin), ciclo completo do chamado, avaliação e correções de segurança. |
| `e2e-demo.py` | Fluxo cliente⇄garçom no modo demonstração, num Chromium real (login, aceitar, devolver, concluir, avaliar, estatísticas, registo e aprovação, tema escuro, modo WhatsApp). |
| `live-adapter.test.mjs` | O mesmo fluxo em modo “ao vivo”, com um cliente Supabase simulado a executar o SQL verdadeiro por baixo. |

Os testes `e2e` e `live` gravam capturas de ecrã em `$SHOTS` (por defeito, uma pasta temporária).
