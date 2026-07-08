# Avaliação página por página — Seller ML (07/07/2026)

## Contexto

A última auditoria completa (`~/Desktop/AUDITORIA-SELLERML-2026-06-10.md`, 10/06/2026) cobriu 22 abas do dashboard com duas frentes — teste ao vivo (conta YUSO) e auditoria de código (111 agentes) — e encontrou problemas graves de dado financeiro errado (custos lidos de tabela legada, cálculo de lucro duplicado/ausente, contratos de API quebrados entre frontend e backend).

Desde então o frontend (`ml-seller-app`, commit `ee2fcd7`, 07/07/2026) e o backend (`ml-seller-api`, commit `88b67e0`, 07/07/2026) evoluíram: o app agora tem 34 páginas (contra 22 auditadas antes), incluindo páginas novas nunca auditadas — Fluxo de Caixa, Estúdio IA, Reposição Semanal, Boletos, e o módulo Financeiro/Contas a Pagar-Receber-Correntes-Regras. Pelo menos um item crítico da auditoria anterior (item 4, rotas órfãs de `/vendas` e `/ranqueamento`) já não reproduz no código atual (`NotFound` catch-all existe, `App.jsx` não referencia mais essas rotas).

O objetivo desta rodada é uma nova avaliação página por página: confirmar o que foi corrigido, achar o que ainda está quebrado ou é novo, e corrigir os itens críticos confirmados.

## Objetivo

Atualizar a auditoria de bugs do dashboard Seller ML, cobrindo as 34 páginas atuais do frontend cruzadas com suas rotas de backend correspondentes, combinando auditoria de código e teste ao vivo, e corrigir no código os itens críticos confirmados (dado financeiro errado ou funcionalidade inutilizada).

## Escopo

- **Repositórios de referência:** `~/Desktop/ml-seller-app` (frontend, commit `ee2fcd7`) e `~/Desktop/ml-seller-api` (backend, commit `88b67e0`) — as cópias locais mais atualizadas, confirmadas com a usuária.
- **Páginas incluídas:** todas as 34 em `src/pages/` (App.jsx), incluindo as novas ainda não auditadas.
- **Fora de escopo nesta rodada:** correção de itens 🟠 Altos e 🟡 Médios (só relatar); qualquer deploy/push para produção.

## Metodologia

### Fase 1 — Auditoria de código (paralela)
Um agente por página lê o componente frontend correspondente e a(s) rota(s) de backend associadas, verificando:
- Nomes de campo batendo entre o que o backend retorna e o que o frontend lê (contrato de API).
- Uso de tabela legada (`produtos`, `pedidos`, `pedido_itens`) vs tabela nova (`custos_produtos`, `ml_pedidos`, `ml_pedidos_itens`).
- Filtro correto de `conta_ml`/tenant em toda leitura e escrita.
- Cálculo de lucro/margem/imposto duplicado, ausente ou divergente entre páginas.
- Erros engolidos silenciosamente (POST/PUT sem feedback, fallback silencioso para 0/vazio).

Saída: lista estruturada de achados por página (arquivo:linha, evidência, severidade sugerida).

### Fase 2 — Teste ao vivo (sessão única no Chrome já autenticado)
Navegação pelas 34 páginas usando a sessão já logada da usuária (conta YUSO), em lotes controlados (não todas as abas simultâneas, por ser uma única sessão de navegador). Captura de tela, console e rede por página, cruzando com os achados da Fase 1.

### Fase 3 — Verificação adversarial
Cada achado (de código e/ou tela) passa por uma segunda checagem independente antes de entrar no relatório final — mesmo padrão da auditoria anterior ("re-verificados manualmente no código e/ou confirmados ao vivo").

### Fase 4 — Síntese e correção dos críticos
- Relatório final salvo em `~/Desktop/AUDITORIA-SELLERML-2026-07-08.md`, mesmo formato da auditoria anterior: 🔴 Críticos / 🟠 Altos / 🟡 Médios / ✅ Funcionando bem / Ordem de ataque sugerida.
- Para cada item 🔴 **confirmado** (dado financeiro errado ou aba inutilizada), aplicar a correção diretamente no código de `ml-seller-app` e/ou `ml-seller-api`.
- Rodar build local (`npx vite build --outDir /tmp/dist` no frontend) para validar que a correção não quebra o build.
- **Não commitar nem dar push** — push na `main` dispara deploy automático em produção (EasyPanel), então fica pendente de aprovação explícita da usuária.

## Execução

Dado o volume (34 páginas + backend + teste ao vivo), a Fase 1 e a Fase 3 rodam via orquestração multi-agente (Workflow), com a Fase 2 conduzida em uma única sessão de navegador controlada por um agente dedicado, e a Fase 4 consolidada manualmente.

## Critérios de sucesso

- Todos os 34 pares página/rota revisados e classificados (correção confirmada, bug confirmado, ou não verificável).
- Relatório final com evidência (arquivo:linha e/ou captura de tela) para cada achado, sem itens “TBD”.
- Itens 🔴 confirmados corrigidos no código local, com build validado, sem nenhum push/commit para produção sem aprovação explícita.
