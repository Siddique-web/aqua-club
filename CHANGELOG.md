# Alterações

## v7.1.0 — Área do garçom
**Novo**
- Barra inferior (Início · Garçom · Estatísticas · Tema) com contador de chamados.
- Área do garçom: contas pessoais (registo + aprovação), fila de chamados em tempo real com cronómetro e alertas, aceitar/concluir/devolver, histórico, estatísticas (meta diária, tempos, notas, gráficos, conquistas), perfil e gestão da equipa para administradores.
- Cliente: vê *à espera → aceite por [nome] → concluído*, pode avaliar o atendimento e o chamado sobrevive a recarregar a página.
- Modo demonstração completo (`?modo=demo`), cada aba pode ter uma conta diferente.
- Tema escuro.
- SQL `schema_v3_garcons.sql` e testes automáticos em `tests/`.

**Segurança**
- Chamados passam a ser criados e atualizados só por funções validadas no servidor (limite por dispositivo).
- Pedidos, eventos e chamados só para equipa ativa e aprovada (antes: qualquer utilizador autenticado).
- `tables`, `menu_items` e `staff` já não aceitam escrita pela chave pública.
- `set_payment` só aceita `local`, `mpesa` e `emola`; `painel.html` escapa o método de pagamento (XSS) e neutraliza fórmulas no CSV.

**Mudanças a ter em conta**
- As apps antigas em `sistema/apps/*` deixam de funcionar com o v3 (marcadas como legado).
- Se voltar a correr `schema_v2_pedidos.sql`, corra o v3 a seguir.
- Novo `.gitattributes` (fins de linha), para os ficheiros deixarem de aparecer como modificados.
