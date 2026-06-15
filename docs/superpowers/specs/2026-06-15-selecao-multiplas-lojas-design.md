# Seleção de múltiplas lojas com soma — Design

**Data:** 2026-06-15
**Repos afetados:** `ml-seller-api` (backend, núcleo) + `ml-seller-app` (frontend, seletor)
**Autora do pedido:** Cibelly (admin)

## Problema

Hoje o seletor de loja no topo (`Header.jsx`) é um menu de escolha única: a usuária vê os
dados de **uma** conta por vez (YUSO, LOCITECH, J12 ou M12). Ela quer poder **selecionar
várias lojas ao mesmo tempo** e ver os dados **somados** — mantendo exatamente o mesmo
layout/telas de hoje, só que com os valores agregados das lojas escolhidas.

## Decisões do brainstorming

| Tema | Decisão |
|------|---------|
| Escopo | **Todas as telas com números** (≈14 rotas de leitura) |
| Comportamento das listas | Ver tudo como é hoje, com **valores somados**: mesmo produto em 2+ lojas vira uma linha somada; listas de pedidos aparecem todas juntas |
| Abordagem | **Caminho A — somar no backend** (devolve no mesmo formato; telas quase não mudam) |
| Padrão ao abrir | Sempre **uma loja (YUSO)**; usuária marca outras quando quiser (sem persistência) |
| Telas de cadastro/edição | Banner **"Editando: [loja ▾]"** — sempre mira uma loja só (nunca soma em escrita) |
| Desempenho | Busca das lojas em **paralelo**, priorizando velocidade |
| Falha parcial | Se uma loja falhar, mostra o total das demais + aviso "Loja X indisponível" |

## Princípio de design central

O backend já tem, por rota, a lógica de buscar e agregar os dados de **uma** conta. A solução
**não reescreve** essa lógica: ela a **encapsula** numa função `fetch_<rota>(conta_ml, params)`
de uma conta só e adiciona, por cima, uma **camada genérica de fan-out + merge** que:

1. Roda `fetch_<rota>` para cada loja selecionada **em paralelo** (ThreadPoolExecutor).
2. Junta (`merge`) as respostas pela regra de cada rota.
3. Devolve o payload **no mesmo formato** de uma loja — então o frontend não precisa saber
   se veio 1 ou N lojas.

Como a resposta mantém o formato, o impacto nas ~21 páginas do frontend é mínimo (só o
seletor e o encaminhamento do parâmetro mudam).

## Contrato do backend

### Parâmetro `conta_ml`

- Passa a aceitar **lista separada por vírgula**: `conta_ml=YUSO,M12,J12`.
- Um único valor (`conta_ml=YUSO`) = comportamento atual (100% retrocompatível).
- **Admin** pode passar várias; **não-admin** continua travado na própria conta
  (regra existente: `request.args.get("conta_ml") or g.user["conta_ml"]`, com override
  para não-admin). A lista é sempre interseccionada com as contas que o usuário pode ver.

### Novo módulo `aggregation.py` (em `ml-seller-api`)

```
parse_contas(request, g) -> list[str]
    Resolve e valida a lista de contas a partir do request + permissões do usuário.
    Sempre retorna ≥1 conta. Não-admin → [g.user["conta_ml"]].

fan_out(contas, fetch_fn) -> (list[payload_ok], list[conta_falhou])
    Executa fetch_fn(conta) em paralelo (max_workers=len(contas)).
    Coleta payloads OK e a lista de lojas que falharam (token/ML API fora).
    NUNCA propaga exceção de uma loja para derrubar a requisição inteira.

merge_payloads(payloads, merge_spec) -> payload
    Aplica a regra de merge declarada pela rota e devolve o payload final.
```

### Regras de merge (por tipo de dado)

| Tipo | Regra |
|------|-------|
| Contadores/valores (faturamento, lucro, n_vendas, unidades, ads, cmv...) | **soma** |
| Médias/percentuais (ticket_medio, margem, tacos, mpa, roi...) | **recalcular** a partir dos componentes já somados — nunca somar média de média |
| Série temporal (gráfico por dia) | somar **por chave de data** |
| Tabela de produtos (top_produtos, curva ABC, analítico) | merge **por `ml_item_id`**: somar unidades/faturado/taxas; recalcular margem/representatividade no fim |
| Listas de pedidos | **concatenar** (cada pedido é único); ordenar por data; incluir campo `loja` por linha |
| Variações vs. período anterior | recalcular sobre os totais somados (atual vs. anterior) |

Cada rota declara um `merge(payloads) -> payload` pequeno e específico — o módulo cuida de
paralelismo e falha parcial de forma genérica.

### Campo de aviso de falha parcial

Respostas agregadas ganham um campo opcional:
```json
{ ...payload..., "lojas_indisponiveis": ["LOCITECH"] }
```
Quando presente e não-vazio, o frontend mostra um aviso discreto. Seguindo a regra do
projeto, **nunca** retornar 502/503/504 (Traefik remove os headers CORS) — falha parcial é
sempre 200 com o aviso; falha total das lojas selecionadas → 424.

### Rotas de leitura a adaptar (somam)

dashboard, vendas, financeiro, margem, resultado, pedidos (lista), analitico/produtos,
analitico/vendas-por-anuncio, graficos, curva-abc, inventario, gerenciamento/anuncios (GET),
ranqueamento, reposicao/semanal, ads/campanhas, financeiro/resumo (+anual),
financeiro/conciliacao, financeiro/projecao, custos (GET lista).

> O detalhamento rota-a-rota (assinatura `fetch_*` + `merge`) fica no plano de implementação.

### Rotas que NÃO somam (escrita / por loja)

custos (save), movimentacoes (CRUD), fechamento (CRUD), configuracoes, estudio,
gerenciamento (PUT anúncio), ads_manual, reposicao (PUT estoque-mínimo),
ranqueamento (atualizar), sync (trigger), importacao. Essas continuam recebendo **uma**
conta e operam exatamente como hoje.

## Contrato do frontend (`ml-seller-app`)

### `AuthContext` — fonte de verdade

- **Novo:** `activeAccounts: string[]` — lojas marcadas no seletor (fonte de verdade).
- **Derivado:** `activeAccount: string` passa a ser `activeAccounts.join(',')`
  (ex.: `"YUSO,M12"`). Assim as páginas de leitura que já mandam `conta_ml: activeAccount`
  e usam `enabled: !!activeAccount` **continuam funcionando sem mudança** — incluindo o
  cache do React Query (a queryKey já inclui `activeAccount`).
- **Novo:** `editAccount: string` — loja única para telas de cadastro/edição (default = 1ª
  marcada). Usada pelo banner "Editando: [loja ▾]".
- Inicialização: `activeAccounts = [meta.conta_ml]` (ex.: `["YUSO"]`). Sem persistência.

### `Header.jsx` — seletor múltiplo (admin)

- Troca o `<select>` único por um **dropdown com checkboxes** + atalho **"Todas"**.
- Mostra resumo compacto: "YUSO", "YUSO +2" ou "Todas (4)".
- Marcar 1 = comportamento de hoje. Visível só para `role === 'admin'`.

### Páginas de leitura

- Sem mudança de lógica: continuam mandando `conta_ml: activeAccount` (já é a lista juntada).
- Quando a resposta trouxer `lojas_indisponiveis`, mostrar aviso discreto reaproveitável
  (pequeno componente `LojasIndisponiveisAviso`).

### Páginas de edição/cadastro

- Trocam `conta_ml: activeAccount` por `conta_ml: editAccount` nas chamadas de escrita.
- Renderizam o banner **"Editando: [loja ▾]"** (componente novo `EditAccountBanner`),
  permitindo trocar a loja-alvo entre as marcadas.

### `PedidoDetalhe`

- Um pedido pertence a **uma** loja. A lista combinada de pedidos já inclui o campo `loja`
  por linha → ao abrir o detalhe, passar a `loja` daquela linha (via state/param), em vez
  de usar `activeAccount`.

## Erros e desempenho

- **Paralelo:** `fan_out` usa `ThreadPoolExecutor(max_workers=len(contas))`; latência ≈ a da
  loja mais lenta, não a soma. Atenção ao limite do Traefik (30s) em períodos "ao vivo"
  (não sincronizados) — manter os timeouts curtos por chamada já existentes.
- **Falha parcial:** loja com token expirado / ML API fora não derruba as demais.
- **Pool gunicorn:** 2 workers × 4 threads. O fan-out cria threads próprias por requisição;
  validar sob carga que N lojas em paralelo não esgotam o pool (monitorar; degradar para
  busca sequencial se necessário — ponto de atenção do plano).

## Testes

- **Unitários** do `merge` de cada categoria (números, médias, série temporal, tabela por
  `ml_item_id`, concatenação de pedidos) com fixtures de 2–3 lojas, validando que os totais
  batem e que médias/percentuais são recalculados (não somados).
- **Falha parcial:** fan-out com 1 loja falhando → payload das demais + `lojas_indisponiveis`.
- **Retrocompatibilidade:** `conta_ml` com 1 valor devolve exatamente o payload de hoje.

## Fora de escopo (YAGNI)

- Comparação lado-a-lado entre lojas (a usuária quer **soma**, não comparação).
- Persistência da seleção entre sessões (decidido: sempre abre em 1 loja).
- Somar dados em telas de escrita/cadastro.

## Riscos / pontos de atenção

1. **Latência ao vivo** com 4 lojas em períodos não sincronizados → mitigado por paralelismo
   + timeouts curtos; medir contra o teto do Traefik.
2. **Esgotar o pool de threads** do gunicorn sob concorrência → monitorar; fallback sequencial.
3. **Médias somadas por engano** → regra explícita de recalcular; coberto por testes.
4. **Deploy do backend** (EasyPanel) necessário; confirmar se push na `main` dispara build
   automático (CLAUDE.md diz que sim; nota de memória de 11/06 sugeriu deploy manual).
