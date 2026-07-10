# Contas a Pagar Inteligente — Design

## Objetivo

Hoje a aba "Contas a Pagar" (Financeiro) é uma tela mockada — os lançamentos ficam só no navegador (localStorage), nunca persistem de verdade nem aparecem em nenhum outro lugar do sistema. O objetivo é transformá-la na forma real e principal de controlar despesas (contas de consumo, boletos de fornecedor, folha de pagamento, despesas gerais), com um diferencial: o usuário pode subir o PDF da conta/boleto e o sistema lê automaticamente (via IA), sugerindo descrição, categoria, valor e vencimento — sempre com revisão do usuário antes de salvar.

Essa tela passa a ser o único lugar do sistema pra lançar despesa recorrente/pontual, substituindo a atual "despesas fixas mensais" (real, mas nunca usada pelo usuário) — Fechamento e Fluxo de Caixa passam a somar os totais a partir dela.

## Contexto e motivação

- Usuário confirmou que nunca usou "despesas fixas mensais" nem a aba mockada de Contas a Pagar — está começando do zero nesse controle.
- Motivação principal: tornar o lançamento de despesa **mais prático** — hoje seria preciso digitar tudo manualmente; a ideia é poder só subir o PDF da conta e o sistema já sugerir os campos.
- Documentos esperados (confirmado com o usuário): contas de consumo (luz, água, gás, internet), boletos/NFs de fornecedor, folha de pagamento/holerites, e despesas gerais diversas (aluguel, contador, softwares).
- Exigência explícita: a extração por IA é só uma **sugestão** — o usuário sempre revisa e confirma antes de qualquer coisa ser salva de verdade. Nunca salva automático sem revisão.
- Lançamento manual (sem PDF) continua disponível, pra quem preferir digitar direto.

## Escopo

**Dentro do escopo:**
- Nova tabela real no banco pra contas a pagar (substitui `despesas_fixas_mensais` como fonte de verdade — ver "Modelo de dados").
- Upload de PDF → extração via IA (OpenAI, já usado no Estúdio IA) → formulário pré-preenchido pra revisão → confirmação → salva.
- Lançamento manual (sem PDF), com os mesmos campos.
- Marcação de status (a pagar / pago / vencido) e data de vencimento.
- Fechamento e Fluxo de Caixa passam a somar os totais de despesa a partir dessa tabela nova, no lugar de `despesas_fixas_mensais`.

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
| `status` | text | `a_pagar` ou `pago` — só esses dois são gravados. "Vencido" não é um status próprio: é calculado na hora de exibir (`status='a_pagar'` e `vencimento` já passou), pra não correr o risco de ficar desatualizado |
| `fonte` | text | `manual` ou `pdf` |
| `pdf_nome_original` | text | Nome do arquivo enviado (nulo se manual) — só o nome, não o conteúdo do PDF em si (ver "Armazenamento do PDF" abaixo) |
| `criado_em` | timestamptz | |
| `pago_em` | timestamptz | Preenchido quando o status muda pra `pago` |

Categorias (lista fixa, reaproveitando as já usadas na versão mockada + as citadas pelo usuário): `Luz`, `Água`, `Gás`, `Internet`, `Fornecedor`, `Folha de Pagamento`, `Aluguel`, `Marketing / Ads`, `Logística`, `Contador`, `Impostos`, `Outros`.

**Armazenamento do PDF**: o arquivo em si não é persistido no banco nesta fase (só o nome original, pra referência visual) — evita lidar com armazenamento de arquivo binário (bucket, limpeza, etc.) por enquanto. Se isso for necessário depois (ex: reabrir o PDF original), fica pra uma fase futura.

### Extração via IA

- Endpoint novo (`POST /api/contas-a-pagar/extrair`) recebe o PDF (multipart), envia pro modelo OpenAI (mesmo padrão de `services/estudio_ia_service.py::_gerar_json` — prompt + schema JSON forçado), pedindo: `descricao`, `categoria` (uma das da lista fixa), `valor`, `vencimento` (formato `AAAA-MM-DD`).
- PDF processado em memória (sem gravar em disco), extração de texto via biblioteca já leve o suficiente pra rodar no mesmo processo (ex: `pypdf`/`pdfplumber` — extrai o texto do PDF, manda o texto extraído pro modelo, não a imagem/PDF bruto — mais simples e barato que visão computacional, e a maioria de conta/boleto tem texto real embutido, não é imagem escaneada).
- Resposta do endpoint é só a **sugestão** (não salva nada ainda) — o frontend recebe os campos sugeridos, preenche o formulário, e só grava quando o usuário confirma (`POST /api/contas-a-pagar` normal, igual ao lançamento manual).
- Se a extração falhar ou vier incompleta (ex: PDF só com imagem escaneada, sem texto), o formulário abre em branco pra preenchimento manual, com um aviso — nunca bloqueia o lançamento.

### Frontend

- Página `ContasPagar.jsx` reescrita: sai do modelo localStorage, passa a usar `useQuery`/`useMutation` (React Query) contra as rotas reais, seguindo o mesmo padrão de `Boletos.jsx`.
- Botão "Subir PDF" abre seletor de arquivo → chama `/extrair` → abre o mesmo modal de lançamento manual já existente, mas com os campos pré-preenchidos pela sugestão da IA (usuário revisa, edita se quiser, confirma).
- Lista de lançamentos com filtro por status e por competência (mês), total por categoria.

### Migração do Fechamento e Fluxo de Caixa

`Fechamento.jsx` e `FluxoCaixa.jsx` hoje leem `despesas_fixas_mensais` pra montar os totais de despesa do mês. Passam a somar `contas_a_pagar` (agrupando por `categoria`, filtrando por `vencimento` dentro do mês) no lugar disso. Como a tabela antiga nunca foi usada de verdade (confirmado com o usuário), não há dado histórico real a migrar — a troca de fonte é direta, sem necessidade de script de migração de dados.

**Nota sobre a data usada pra agrupar**: usar `vencimento` (não uma "competência" separada) como a única data de referência é uma simplificação deliberada — uma conta de luz de junho que vence em julho entra no total de julho, não de junho. Isso é o comportamento mais direto pro Fluxo de Caixa (quando o dinheiro sai de verdade) e é suficiente pro Fechamento nesse porte de operação; se no futuro isso gerar confusão pro contador, dá pra adicionar um campo de competência separado.

## Testes

- Backend: parsing do PDF (fixture de PDF real com texto extraível), prompt/extração da IA (mock da chamada ao OpenAI, testando o schema forçado), fallback quando a extração falha (retorna campos vazios, não levanta exceção), CRUD da tabela `contas_a_pagar`, soma correta por categoria/mês pro Fechamento e Fluxo de Caixa.
- Frontend: fluxo de upload → preview → confirmação (mock da chamada `/extrair`), fluxo manual sem PDF, filtro por status/competência.
- Verificação manual: subir um PDF real de conta de luz e conferir se os campos sugeridos batem com o documento.
