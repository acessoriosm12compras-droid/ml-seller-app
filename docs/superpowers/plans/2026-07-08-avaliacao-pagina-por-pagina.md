# Avaliação Página por Página — Seller ML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atualizar a auditoria de bugs do dashboard Seller ML (34 páginas reais em `ml-seller-app` + rotas em `ml-seller-api`), combinando auditoria de código multi-agente com teste ao vivo, e corrigir no código os itens 🔴 críticos confirmados.

**Architecture:** Um script Workflow roda a Fase 1 (auditoria de código por página, em pipeline) e a Fase 3 (verificação adversarial de cada achado) num único fluxo; a Fase 2 (teste ao vivo) roda separadamente numa única sessão de navegador (Claude in Chrome) já autenticada; a Fase 4 mescla os dois conjuntos de achados confirmados num relatório markdown e aplica as correções dos críticos diretamente nos repositórios locais.

**Tech Stack:** Workflow tool (script JS), Claude in Chrome (mcp__claude-in-chrome__*), Vite/React (frontend), Flask (backend), git (sem push).

## Global Constraints

- Repositórios de referência: `~/Desktop/ml-seller-app` (commit `ee2fcd7`) e `~/Desktop/ml-seller-api` (commit `88b67e0`) — não usar as outras cópias em `~/ml-seller-app`, `~/Desktop/YUSO/*` etc.
- 34 páginas reais em escopo (ver lista no Task 1) — os arquivos `src/pages/.fuse_hidden*` NÃO são páginas, são lixo de editor e ficam fora do escopo.
- Nenhum `git commit` ou `git push` em `ml-seller-app`/`ml-seller-api` como parte deste plano. Correções de críticos ficam no working tree, aguardando aprovação explícita da usuária.
- Build de validação do frontend: `npx vite build --outDir /tmp/dist` (evita `EPERM` ao limpar `dist/` em sandbox).
- Relatório final vai para `~/Desktop/AUDITORIA-SELLERML-2026-07-08.md` (fora dos repositórios git, mesmo padrão da auditoria anterior).
- Artefatos de trabalho intermediários (achados brutos) vão para `~/Desktop/auditoria-sellerml-2026-07-08-workdir/` (criado no Task 1).

---

### Task 1: Script Workflow da Fase 1 (auditoria de código) + Fase 3 (verificação adversarial), validado num subconjunto

**Files:**
- Create: `~/Desktop/auditoria-sellerml-2026-07-08-workdir/fase1-script.js` (cópia do script para referência/reexecução; o Workflow tool também persiste o script automaticamente)
- Create: `~/Desktop/auditoria-sellerml-2026-07-08-workdir/fase1-dryrun.json` (resultado do teste em 3 páginas)

**Interfaces:**
- Produces: achados no formato `{ page, findings: [{ title, severity, frontend_evidence, backend_evidence, description }] }` por página, e após verificação `{ ...finding, page, routed, confirmed, voteDetail }` por achado.

- [ ] **Step 1: Criar diretório de trabalho**

```bash
mkdir -p ~/Desktop/auditoria-sellerml-2026-07-08-workdir
```

- [ ] **Step 2: Escrever o script do Workflow**

Salvar em `~/Desktop/auditoria-sellerml-2026-07-08-workdir/fase1-script.js` (e usar o mesmo conteúdo ao chamar a ferramenta Workflow):

```javascript
export const meta = {
  name: 'seller-ml-auditoria-fase1',
  description: 'Audita cada página do dashboard Seller ML contra sua rota de backend e verifica os achados',
  phases: [
    { title: 'Auditoria de código' },
    { title: 'Verificação adversarial' },
  ],
}

const PAGES = [
  'AdminUsuarios', 'Ads', 'Analitico', 'Boletos', 'Conciliacao', 'Configuracoes',
  'CurvaAbc', 'CustosProdutos', 'Dashboard', 'DefinirSenha', 'EstudioIA', 'Fechamento',
  'Financeiro', 'financeiro/ContasCorrentes', 'financeiro/ContasPagar', 'financeiro/ContasReceber',
  'financeiro/RegrasCategorização', 'FinanceiroResumo', 'FluxoCaixa', 'Gerenciamento',
  'Graficos', 'Inventario', 'Login', 'Margem', 'Movimentacoes', 'NotFound', 'Onboarding',
  'PedidoDetalhe', 'Pedidos', 'ProjecaoVendas', 'Ranqueamento', 'ReposicaoSemanal',
  'Resultado', 'Vendas',
]

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    page: { type: 'string' },
    routed: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critico', 'alto', 'medio'] },
          frontend_evidence: { type: 'string' },
          backend_evidence: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['title', 'severity', 'description'],
      },
    },
  },
  required: ['page', 'routed', 'findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    confirmed: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['confirmed', 'notes'],
}

function auditPrompt(page) {
  return `Você está auditando a página "${page}" do dashboard Seller ML.

Repositórios:
- Frontend: /Users/macbookpro/Desktop/ml-seller-app (arquivo: src/pages/${page}.jsx)
- Backend: /Users/macbookpro/Desktop/ml-seller-api

Passos:
1. Leia src/pages/${page}.jsx por completo.
2. Confirme se a página está registrada em uma <Route> de src/App.jsx. Se NÃO estiver, defina routed: false e reporte isso como finding severidade "alto" (componente órfão, código morto ou feature desligada); não precisa auditar o resto. Caso esteja, defina routed: true.
3. Identifique todas as chamadas de API que a página faz (via src/api.js — grep pelo recurso, ex: api.dashboard, api.margem etc). Para cada uma, encontre a rota Flask correspondente em ml-seller-api/routes/*.py (grep pelo path na blueprint e em app.py).
4. Compare frontend x backend:
   - Nomes de campo: todo campo que o frontend lê do JSON de resposta existe de fato no que o backend retorna? Liste qualquer campo lido pelo frontend que o backend não envia (ou envia com outro nome).
   - Tabela legada vs nova: a rota backend consulta produtos, pedidos ou pedido_itens (tabelas legadas, sem tenant) quando deveria consultar custos_produtos, ml_pedidos ou ml_pedidos_itens?
   - Tenant: toda query de leitura/escrita filtra por conta_ml? Todo POST/PUT que grava dado recebe conta_ml de forma consistente entre frontend e backend (body vs query string)?
   - Cálculo de lucro/margem/imposto: esta rota recalcula lucro/margem/imposto de um jeito que pode divergir de outras páginas (ex: desconta imposto em dobro, ignora custo, ignora ads)?
   - Erros engolidos: algum POST/PUT/GET trata erro da API do Mercado Livre ou do banco caindo silenciosamente em 0/vazio sem avisar o usuário?
5. Para cada problema real encontrado, gere um finding com título curto, severidade (critico = dado financeiro errado ou aba inutilizada; alto = funcionalidade visivelmente quebrada; medio = quebra em cenário específico), evidência de frontend (arquivo:linha), evidência de backend (arquivo:linha) e descrição de 1-2 frases.
6. Se a página estiver correta, retorne findings: [].

Retorne apenas o resultado via a ferramenta estruturada.`
}

function verifyPrompt(page, finding) {
  return `Tente refutar este achado de auditoria antes de ele entrar no relatório final.

Página: ${page}
Achado: ${finding.title}
Severidade alegada: ${finding.severity}
Evidência frontend: ${finding.frontend_evidence || '(nenhuma)'}
Evidência backend: ${finding.backend_evidence || '(nenhuma)'}
Descrição: ${finding.description}

Releia os trechos de código citados (arquivo:linha) em /Users/macbookpro/Desktop/ml-seller-app e /Users/macbookpro/Desktop/ml-seller-api. O achado está correto e reproduz de fato no código atual? Se a evidência citada não bate, ou o comportamento descrito não acontece, marque confirmed: false e explique por quê. Default para confirmed: false se você não conseguir confirmar a evidência com certeza.`
}

async function verifyFinding(page, routed, finding) {
  const voters = finding.severity === 'critico' ? 3 : 1
  const votes = await parallel(
    Array.from({ length: voters }, () => () =>
      agent(verifyPrompt(page, finding), {
        label: `verify:${page}`,
        phase: 'Verificação adversarial',
        schema: VERDICT_SCHEMA,
      })
    )
  )
  const cast = votes.filter(Boolean)
  const confirmedVotes = cast.filter(v => v.confirmed).length
  const confirmed = cast.length > 0 && confirmedVotes > cast.length / 2
  return { ...finding, page, routed, confirmed, voteDetail: cast }
}

const results = await pipeline(
  PAGES,
  page => agent(auditPrompt(page), { label: `audit:${page}`, phase: 'Auditoria de código', schema: FINDINGS_SCHEMA }),
  review => review
    ? parallel(review.findings.map(f => () => verifyFinding(review.page, review.routed, f)))
    : []
)

const flat = results.filter(Boolean).flat().filter(Boolean)
const confirmed = flat.filter(f => f.confirmed)
const rejected = flat.filter(f => !f.confirmed)

log(`${confirmed.length} achados confirmados, ${rejected.length} descartados na verificação, ${PAGES.length} páginas auditadas`)

return { confirmed, rejected, pagesAudited: PAGES.length }
```

- [ ] **Step 3: Rodar em modo de teste (3 páginas) antes da rodada completa**

Chamar a ferramenta Workflow com o script acima, mas com `PAGES` temporariamente reduzido a `['Dashboard', 'Margem', 'Vendas']` (um exemplo com dado financeiro, um com achado esperado de tenant/tabela legada conhecido pela auditoria de 10/06, e um órfão conhecido — bom teste do branch `routed: false`).

Expected: o resultado retornado tem 3 entradas em `pagesAudited: 3`, `Vendas` aparece com `routed: false` e um finding de severidade "alto", e nenhum campo do schema falha validação (o Workflow tool re-tenta automaticamente se o schema não bater — se re-tentar mais de 2x na mesma página, revisar o prompt).

- [ ] **Step 4: Salvar o resultado do teste**

Persistir o JSON retornado em `~/Desktop/auditoria-sellerml-2026-07-08-workdir/fase1-dryrun.json`.

- [ ] **Step 5: Conferir manualmente o achado de "Vendas"**

Abrir `~/Desktop/ml-seller-app/src/App.jsx` e confirmar visualmente que não há `<Route path="vendas"`. Se o achado bateu, o script está correto — prosseguir para o Task 2. Se não bateu (ex: schema mal preenchido, `routed` sempre true), ajustar o prompt em `auditPrompt` e repetir o Step 3.

---

### Task 2: Rodar a Fase 1 + Fase 3 completas nas 34 páginas

**Files:**
- Create: `~/Desktop/auditoria-sellerml-2026-07-08-workdir/fase1-resultado.json`

**Interfaces:**
- Consumes: script validado do Task 1 (`fase1-script.js`), com `PAGES` restaurado para a lista completa de 34 páginas.
- Produces: `{ confirmed: [...], rejected: [...], pagesAudited: 34 }` — `confirmed` é a entrada usada no Task 4.

- [ ] **Step 1: Rodar o Workflow completo**

Chamar a ferramenta Workflow com o script do Task 1 (com a lista completa das 34 páginas, sem o corte de teste).

Expected: retorno com `pagesAudited: 34`.

- [ ] **Step 2: Persistir o resultado**

Salvar o JSON retornado em `~/Desktop/auditoria-sellerml-2026-07-08-workdir/fase1-resultado.json`.

- [ ] **Step 3: Conferência rápida de sanidade**

```bash
python3 -c "
import json
d = json.load(open('/Users/macbookpro/Desktop/auditoria-sellerml-2026-07-08-workdir/fase1-resultado.json'))
print('confirmados:', len(d['confirmed']))
print('rejeitados:', len(d['rejected']))
print('páginas:', d['pagesAudited'])
criticos = [f for f in d['confirmed'] if f['severity'] == 'critico']
print('críticos confirmados:', len(criticos))
for f in criticos:
    print('-', f['page'], '|', f['title'])
"
```

Expected: `páginas: 34`; a lista de críticos impressa serve de checklist para o Task 5.

---

### Task 3: Teste ao vivo (Fase 2) na sessão de navegador já autenticada

**Files:**
- Create: `~/Desktop/auditoria-sellerml-2026-07-08-workdir/fase2-ao-vivo.md`

**Interfaces:**
- Consumes: `fase1-resultado.json` do Task 2 (para cruzar achados de código com o que aparece na tela).
- Produces: markdown com uma seção por página navegada, contendo: valores/erros observados na tela, mensagens de console relevantes, e se bate ou não com os achados confirmados da Fase 1.

- [ ] **Step 1: Carregar as ferramentas do navegador**

Usar ToolSearch com `"select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__read_network_requests"`.

- [ ] **Step 2: Confirmar sessão ativa**

Chamar `tabs_context_mcp`. Navegar para `https://app.sellerml.com.br/dashboard` numa nova aba. Se cair na tela de login, parar e avisar a usuária (a sessão não está ativa como esperado) em vez de tentar logar sozinho.

- [ ] **Step 3: Navegar pelas páginas testáveis ao vivo**

Lista (28 páginas — exclui `Login`, `DefinirSenha`, `Onboarding`, `NotFound` por serem fluxo de autenticação/erro, e `Vendas`/`Ranqueamento` por já confirmados como órfãos no Task 2):

`Dashboard, Pedidos, PedidoDetalhe (abrir um pedido da lista), FluxoCaixa, Margem, Resultado, CustosProdutos, Conciliacao, ProjecaoVendas, Graficos, Analitico, CurvaAbc, Movimentacoes, FinanceiroResumo, Gerenciamento, Inventario, Configuracoes, Fechamento, Ads, EstudioIA, ReposicaoSemanal, Financeiro/ContasPagar, Financeiro/ContasReceber, Financeiro/ContasCorrentes, Financeiro/RegrasCategorização, Boletos, AdminUsuarios (pular se a conta logada não for admin — checar pelo menu)`

Para cada página, em lotes de 4-5 por vez:
1. Navegar até a rota.
2. Ler a tela (`read_page` ou screenshot) e anotar valores/textos visíveis relevantes (totais, "—", "R$ 0,00", "Indisponível", tabelas vazias).
3. Ler console (`read_console_messages`) filtrando por erros.
4. Anotar no arquivo `fase2-ao-vivo.md` sob um cabeçalho `## <Página>`.

- [ ] **Step 4: Cruzar com os achados confirmados da Fase 1**

Para cada achado 🔴/🟠 confirmado no Task 2 cuja página foi visitada ao vivo, adicionar uma linha no `fase2-ao-vivo.md` indicando "reproduzido ao vivo: sim/não" com a evidência de tela correspondente.

---

### Task 4: Síntese — relatório final

**Files:**
- Create: `~/Desktop/AUDITORIA-SELLERML-2026-07-08.md`

**Interfaces:**
- Consumes: `fase1-resultado.json` (Task 2) e `fase2-ao-vivo.md` (Task 3).

- [ ] **Step 1: Mesclar e deduplicar achados**

Combinar `confirmed` do Task 2 com os achados adicionais só encontrados ao vivo no Task 3 (ex: algo que só aparece rodando, não visível estaticamente no código). Remover duplicatas (mesma página + mesma causa raiz).

- [ ] **Step 2: Escrever o relatório seguindo o formato da auditoria anterior**

Estrutura obrigatória (mesmo padrão de `~/Desktop/AUDITORIA-SELLERML-2026-06-10.md`):
- Cabeçalho com data, metodologia (2 frentes) e resultado geral em 1-2 frases.
- `## 🔴 CRÍTICOS` — um item por achado confirmado de severidade "critico", com evidência arquivo:linha e efeito visto ao vivo (quando houver) + sugestão de fix.
- `## 🟠 ALTOS` — mesma estrutura, severidade "alto".
- `## 🟡 MÉDIOS` — mesma estrutura, severidade "medio".
- `## ✅ O que está funcionando bem` — páginas sem achados confirmados.
- `## Ordem de ataque sugerida` — lista numerada priorizando críticos com maior efeito cruzado (ex: um fix que resolve vários achados de uma vez, como aconteceu com "unificar custos" na auditoria anterior).

Nenhuma seção pode conter "TBD" ou achado sem evidência de arquivo:linha (código) ou tela (ao vivo).

- [ ] **Step 3: Revisão de sanidade do relatório**

Ler o arquivo gerado e confirmar: todo achado 🔴 tem evidência de código; a contagem de páginas bate com 34; nenhum achado da auditoria de 10/06 que já foi corrigido aparece de novo como pendente (cruzar rapidamente com `~/Desktop/AUDITORIA-SELLERML-2026-06-10.md`).

---

### Task 5: Corrigir os itens 🔴 críticos confirmados (runbook, uma vez por item)

**Files:**
- Modify: arquivo(s) exatos citados na evidência de cada achado 🔴 do relatório do Task 4 (dentro de `~/Desktop/ml-seller-app/src/` e/ou `~/Desktop/ml-seller-api/`).

**Interfaces:**
- Consumes: seção `## 🔴 CRÍTICOS` do relatório gerado no Task 4 — a lista exata de itens só existe depois do Task 4, então este runbook é aplicado uma vez por item encontrado (contagem não é conhecida antes da execução).

Para cada item 🔴 do relatório, repetir:

- [ ] **Step 1: Abrir o arquivo e linha citados na evidência**

Ler o trecho de código exato referenciado (arquivo:linha de frontend e/ou backend).

- [ ] **Step 2: Aplicar a correção mínima que resolve a causa raiz descrita no achado**

Sem refatoração além do necessário — ex: se o achado é "rota lê tabela legada X em vez de Y filtrando por conta_ml", o fix é trocar a query/nome de tabela e adicionar o filtro, não reescrever a rota inteira.

- [ ] **Step 3: Validar que não quebrou o build**

Se o arquivo alterado for do frontend:

```bash
cd ~/Desktop/ml-seller-app && npx vite build --outDir /tmp/dist
```

Expected: build conclui sem erro.

Se o arquivo alterado for do backend:

```bash
cd ~/Desktop/ml-seller-api && python3 -c "import ast; ast.parse(open('<arquivo_alterado>').read())"
```

Expected: nenhum `SyntaxError`.

- [ ] **Step 4: Marcar o item como corrigido no relatório**

Editar `~/Desktop/AUDITORIA-SELLERML-2026-07-08.md`, adicionando "✅ Corrigido localmente (não commitado)" ao final do item.

- [ ] **Step 5: NÃO commitar**

Confirmar com `git status --short` nos dois repositórios que as mudanças estão só no working tree. Não rodar `git add`/`git commit`/`git push` — isso é decisão da usuária, fora deste plano.

---

## Self-Review

**Cobertura do spec:** Fase 1 → Task 1+2; Fase 2 → Task 3; Fase 3 → embutida no script do Task 1/2 (`verifyFinding`); Fase 4 (síntese + fix) → Task 4+5; constraint de não commitar/push → Task 5 Step 5 e Global Constraints; build de validação → Task 5 Step 3; 34 páginas (não 37) → lista exata no Task 1.

**Placeholder scan:** Task 5 não tem código de fix pré-escrito porque os itens críticos só são conhecidos após o Task 4 rodar — isso é inerente a um plano de auditoria (descoberta antes de correção), não um placeholder evitável; o procedimento em si (abrir evidência → fix mínimo → validar build → não commitar) é totalmente concreto.

**Consistência de tipos:** `severity` usa os mesmos três valores (`critico`/`alto`/`medio`) do schema (Task 1) até o relatório final (Task 4); `confirmed` (boolean) é o mesmo campo do Task 1 até o filtro usado no Task 5.
