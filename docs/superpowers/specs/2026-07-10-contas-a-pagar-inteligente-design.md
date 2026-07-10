# Contas a Pagar Inteligente — Design

## Objetivo

Hoje a aba "Contas a Pagar" (Financeiro) é uma tela mockada — os lançamentos ficam só no navegador (localStorage), nunca persistem de verdade nem aparecem em nenhum outro lugar do sistema. O objetivo é transformá-la na forma real e principal de controlar despesas (contas de consumo, boletos de fornecedor, folha de pagamento, despesas gerais), com um diferencial: o usuário pode subir o PDF da conta/boleto e o sistema lê automaticamente (via IA), sugerindo descrição, categoria, valor e vencimento — sempre com revisão do usuário antes de salvar.

Essa tela passa a ser o lugar pra **controlar e planejar** despesas (o que precisa ser pago, quando vence, o que já foi pago), substituindo a atual "despesas fixas mensais" (real no banco, mas com zero linhas em todas as contas — confirmado por query direta, nunca foi usada). **Importante, corrigido após revisão técnica**: isso não substitui a fonte de despesa já usada no Fechamento (`fechamento_despesas`, ver "Migração" abaixo) — essa tela é complementar, não uma migração completa de tudo que já existe.

## Contexto e motivação

- Usuário confirmou que nunca usou "despesas fixas mensais" nem a aba mockada de Contas a Pagar — está começando do zero nesse controle.
- Motivação principal: tornar o lançamento de despesa **mais prático** — hoje seria preciso digitar tudo manualmente; a ideia é poder só subir o PDF da conta e o sistema já sugerir os campos.
- Documentos esperados (confirmado com o usuário): contas de consumo (luz, água, gás, internet), boletos/NFs de fornecedor, folha de pagamento/holerites, e despesas gerais diversas (aluguel, contador, softwares).
- Exigência explícita: a extração por IA é só uma **sugestão** — o usuário sempre revisa e confirma antes de qualquer coisa ser salva de verdade. Nunca salva automático sem revisão.
- Lançamento manual (sem PDF) continua disponível, pra quem preferir digitar direto.

## Escopo

**Dentro do escopo:**
- Nova tabela real no banco pra contas a pagar (substitui `despesas_fixas_mensais`, que está vazia — ver "Modelo de dados").
- Upload de PDF → extração via IA (OpenAI, já usado no Estúdio IA) → formulário pré-preenchido pra revisão → confirmação → salva.
- Lançamento manual (sem PDF), com os mesmos campos.
- Marcação de status (a pagar / pago / vencido) e data de vencimento.
- Fluxo de Caixa passa a somar a partir dela, no lugar de `despesas_fixas_mensais` (troca direta e segura, a tabela antiga nunca teve dado).
- **Fechamento**: a seção de despesas é simplificada — as duas linhas separadas de hoje ("Custos Fixos" e "Despesas Variáveis", reflexo de serem duas tabelas diferentes por baixo) viram **uma lista única de despesas do mês, agrupada por categoria**. O total passa a somar `contas_a_pagar` (tudo daqui pra frente) + `fechamento_despesas` (histórico congelado — ver "Migração"), então meses antigos continuam corretos e não há necessidade de migrar dado nenhum.
- **Substituição da planilha externa**: hoje o controle de "Despesas Variáveis" é feito 100% numa planilha fora do sistema (confirmado com o usuário — nem a sincronização da Conta Simples nem o lançamento manual no Fechamento estão em uso). Contas a Pagar passa a ser o lugar único pra isso, dentro do sistema.

**Fora do escopo (não pedido agora):**
- Pagamento efetivo (integração bancária pra pagar o boleto direto pelo sistema) — só controle/registro.
- Recorrência automática (repetir o mesmo lançamento todo mês sozinho) — cada conta é lançada individualmente, mesmo que seja recorrente na prática.
- OCR/leitura de imagem (foto de boleto) — só PDF nesta fase.
- Aprovação/alçada (múltiplos usuários aprovando antes de pagar) — não se aplica ao tamanho da operação hoje.

## Decisões técnicas

### Modelo de dados

Nova tabela `contas_a_pagar` (Postgres/Supabase), com granularidade por lançamento individual (não por categoria/mês agregado, como era `despesas_fixas_mensais` — cada boleto/conta é uma linha própria, já que o valor real de subir o PDF é rastrear cada documento com seu próprio vencimento):

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | serial | |
| `conta_ml` | text | M12, YUSO, etc. |
| `descricao` | text | Ex: "Conta de luz - CPFL - competência 06/2026" |
| `categoria` | text | Ver lista de categorias abaixo |
| `valor` | numeric(12,2) | |
| `vencimento` | date | |
| `competencia` | text (`AAAA-MM`) | Mês a que a despesa se refere (pode diferir do mês de `vencimento` — ex: luz de junho vencendo em julho). Default = mês de `vencimento` se não informado. Capturado desde já porque não dá pra preencher retroativamente depois — ver nota abaixo |
| `status` | text | `a_pagar` ou `pago` — só esses dois são gravados. "Vencido" não é um status próprio: é calculado na hora de exibir (`status='a_pagar'` e `vencimento` já passou), pra não correr o risco de ficar desatualizado |
| `fonte` | text | `manual` ou `pdf` |
| `pdf_nome_original` | text | Nome do arquivo enviado (nulo se manual) — só o nome, não o conteúdo do PDF em si (ver "Armazenamento do PDF" abaixo) |
| `criado_em` | timestamptz | |
| `pago_em` | timestamptz | Preenchido quando o status muda pra `pago` |

Categorias (lista fixa, reaproveitando as já usadas na versão mockada + as citadas pelo usuário): `Luz`, `Água`, `Gás`, `Internet`, `Fornecedor`, `Folha de Pagamento`, `Aluguel`, `Marketing / Ads`, `Logística`, `Contador`, `Impostos`, `Outros`.

**Armazenamento do PDF**: o arquivo em si não é persistido no banco nesta fase (só o nome original, pra referência visual) — evita lidar com armazenamento de arquivo binário (bucket, limpeza, etc.) por enquanto. Nota: pra contabilidade/Lucro Real, o contador tipicamente pede o documento original, não só os campos extraídos — é provável que isso vire necessário numa fase futura; o schema atual não impede adicionar uma coluna de referência de arquivo depois.

**Migração/índices**: segue o padrão do projeto (`migrations/NNN_nome.sql`, `CREATE TABLE IF NOT EXISTS`), com índice em `(conta_ml, vencimento)` e `(conta_ml, competencia)` pra suportar os filtros por período das duas telas que vão consumir essa tabela.

**Rotas e multi-conta**: `POST/GET/PATCH /api/contas-a-pagar` seguem o padrão já usado em `routes/fechamento.py::_conta()` (query param ou body pra admin, travado na própria conta pra não-admin). `POST /api/contas-a-pagar/extrair` não grava nada, então não precisa de `conta_ml` — mas o frontend inclui `activeAccount` nas query keys do React Query, mesmo padrão de `Boletos.jsx`.

### Extração via IA

- Endpoint novo (`POST /api/contas-a-pagar/extrair`) recebe o PDF (multipart), envia pro modelo OpenAI (mesmo padrão de `services/estudio_ia_service.py::_gerar_json` — prompt + schema JSON forçado), pedindo: `descricao`, `categoria` (uma das da lista fixa), `valor` (número, formato decimal com `.`, nunca string no formato brasileiro), `vencimento` (formato `AAAA-MM-DD`), `competencia` (formato `AAAA-MM`, se identificável no documento).
- PDF processado em memória (sem gravar em disco), extração de texto via biblioteca leve o suficiente pra rodar no mesmo processo (ex: `pypdf`/`pdfplumber`) — manda o texto extraído pro modelo, não a imagem/PDF bruto.
- **Correção pós-revisão**: boleto/conta escaneada (imagem, sem texto real embutido) é comum no Brasil, não é caso raro — o endpoint deve detectar texto extraído vazio ou muito curto (abaixo de um limiar mínimo de caracteres) e **pular a chamada à IA nesse caso**, indo direto pro fallback de formulário em branco (evita gastar uma chamada de IA num PDF que não tem chance de funcionar).
- Resposta do endpoint é só a **sugestão** (não salva nada ainda) — o frontend recebe os campos sugeridos, preenche o formulário, e só grava quando o usuário confirma (`POST /api/contas-a-pagar` normal, igual ao lançamento manual). Campos vindos da IA ficam visualmente marcados no formulário (ex: um ícone/cor diferente), pra o usuário saber quais conferir com mais atenção antes de confirmar — não é só "abre preenchido", é "abre preenchido E sinalizado".
- Se a extração falhar ou vier incompleta, o formulário abre em branco pra preenchimento manual, com um aviso — nunca bloqueia o lançamento.
- **Parsing de valor**: mesmo pedindo número no prompt, o backend valida/normaliza o `valor` recebido da IA com um parser tolerante a formato brasileiro (ex: se vier `"1.234,56"` por algum motivo, converte certo em vez de quebrar ou truncar) — com teste dedicado.
- **Guarda-corpos de tempo de resposta** (pra não violar a regra do projeto de nunca devolver 502/503/504): timeout explícito no cliente OpenAI (abaixo do limite do Traefik), limite de tamanho no texto extraído antes de mandar pro modelo, e qualquer falha/timeout da IA responde com sugestão vazia (200, não 5xx) — mesma convenção de erro 424 já usada no Estúdio IA pra falha real da IA, nunca deixando a rota estourar.
- **Upload**: limite de tamanho de arquivo (ex: 10MB) e validação de que o arquivo é realmente um PDF (content-type + assinatura binária, não só a extensão do nome) antes de processar.

### Frontend

- Página `ContasPagar.jsx` reescrita: sai do modelo localStorage, passa a usar `useQuery`/`useMutation` (React Query) contra as rotas reais, seguindo o mesmo padrão de `Boletos.jsx`.
- Botão "Subir PDF" abre seletor de arquivo → chama `/extrair` → abre o mesmo modal de lançamento manual já existente, mas com os campos pré-preenchidos pela sugestão da IA (usuário revisa, edita se quiser, confirma).
- Lista de lançamentos com filtro por status e por competência (mês), total por categoria.

### Migração — corrigida duas vezes durante o brainstorm (histórico abaixo, decisão final no fim)

**Rodada 1 (revisão técnica)**: a primeira versão deste spec assumia, errado, que tanto `Fechamento.jsx` quanto `FluxoCaixa.jsx` liam só `despesas_fixas_mensais`. Não é bem assim:
- **`FluxoCaixa.jsx`**: lê só `despesas_fixas_mensais` (`fluxo_caixa_service.py::get_despesas_fixas_total`). Essa tabela tem **zero linhas em todas as contas** (confirmado por query direta: `SELECT conta_ml, COUNT(*) FROM despesas_fixas_mensais GROUP BY conta_ml` não retornou nenhuma linha).
- **`Fechamento.jsx`**: lê **duas** fontes — `despesas_fixas_mensais` (linha "Custos Fixos", vazia) **e** `fechamento_despesas` (linha "Despesas Variáveis", `routes/fechamento.py`), essa última **com dado real**: 117 lançamentos da YUSO (dez/25–jun/26) e 18 da M12 (abr–mai/26), historicamente alimentada por lançamento manual e pela sincronização bancária da Conta Simples (dedupe por `ext_id`).

**Rodada 2 (conversa com o usuário)**: perguntado diretamente, o usuário confirmou que **a Conta Simples não é mais usada**, e que o lançamento manual de despesas variáveis no Fechamento também não — hoje esse controle é feito **100% numa planilha fora do sistema**. Ou seja, `fechamento_despesas` está congelada: não recebe nenhum dado novo, nem automático nem manual, desde que pararam de usar a Conta Simples. O risco de contagem duplicada da Rodada 1 (uma despesa entrando tanto por `contas_a_pagar` quanto por sincronização bancária) não existe mais daqui pra frente, porque não há mais nada alimentando `fechamento_despesas`.

**Decisão final**: `contas_a_pagar` vira a fonte única de despesa nova a partir de agora, substituindo a planilha. A seção de despesas do Fechamento (ver "Escopo" — unificada numa lista só) soma:
- `fechamento_despesas` — **read-only**, só o histórico já existente (dez/25–jun/26), nunca recebe registro novo daqui pra frente.
- `contas_a_pagar` — tudo a partir da entrada em produção desta feature.

Como `fechamento_despesas` para de crescer, não há sobreposição possível entre as duas fontes — a soma é segura sem precisar de um "corte" explícito de data. Não é necessário script de migração de dados (nenhuma das duas fontes tem overlap a resolver).

O botão manual de "adicionar despesa" que hoje existe na seção Despesas Variáveis do Fechamento (grava em `fechamento_despesas`) é removido — o lançamento novo passa a ser feito só pela tela Contas a Pagar.

**Nota sobre a data usada pra agrupar**: `vencimento` é a data usada pro Fluxo de Caixa (quando o dinheiro sai de verdade). Pro Fechamento, usa-se `competencia` (ver "Modelo de dados") — o mês de referência contábil da despesa (relevante pro regime de competência do Lucro Real), capturado desde o lançamento porque não dá pra preencher isso retroativamente depois.

## Testes

- Backend: parsing do PDF (fixture de PDF real com texto extraível), detecção de PDF sem texto (imagem escaneada) pulando a chamada de IA, prompt/extração da IA (mock da chamada ao OpenAI, testando o schema forçado), fallback quando a extração falha ou dá timeout (retorna sugestão vazia, nunca 5xx), parser de valor tolerante a formato brasileiro (com casos de teste tipo `"1.234,56"`), validação de tamanho/tipo de arquivo no upload, CRUD da tabela `contas_a_pagar`, soma correta por `competencia` pro Fechamento (`contas_a_pagar` + `fechamento_despesas` histórico) e por `vencimento` pro Fluxo de Caixa — com um teste específico confirmando que nenhuma escrita nova é feita em `fechamento_despesas` (só leitura).
- Frontend: fluxo de upload → preview (com campos vindos da IA visualmente marcados) → confirmação (mock da chamada `/extrair`), fluxo manual sem PDF, filtro por status/competência.
- Verificação manual: subir um PDF real de conta de luz e conferir se os campos sugeridos batem com o documento; conferir que o total de "Despesas Variáveis" do Fechamento não muda com um lançamento novo em Contas a Pagar (só "Custos Fixos" muda).
