# Preço Promocional + Deduplicação de Produtos por SKU — Design

**Repos:** `ml-seller-api` (backend, Flask) + `ml-seller-app` (frontend, React/Vite/Tailwind)

Duas melhorias nas mesmas duas telas (Custos de Produtos, Inventário).
Agrupadas num spec só porque a segunda (dedup) precisa rodar antes da
primeira (preço promocional) na pipeline de dados: primeiro decide quais
linhas aparecem, depois decora a coluna de preço de cada uma.

> **Revisão 2026-07-10 (pós code-review):** a premissa original — "as duas
> telas usam a mesma função `buscar_anuncios_ativos`" — estava **errada**.
> Custos de Produtos usa `ml_client.buscar_anuncios_ativos()`; Inventário usa
> uma implementação própria e independente, `routes/inventario.py::_buscar_inventario`,
> que não busca `catalog_listing`, `attributes` (SKU) nem `original_price`
> hoje. As duas funções precisam de mudanças **paralelas e independentes**,
> não uma mudança compartilhada. Esta revisão corrige isso e mais 4 decisões
> que a primeira versão deixou implícitas.

## Parte 1 — Preço Promocional

### Problema

As telas de **Custos de Produtos** e **Inventário** mostram o preço de venda de cada
produto vindo do catálogo do Mercado Livre, mas só exibem um valor único — sem
indicar quando esse produto está com uma promoção/desconto ativo no ML. A
usuária quer ver as duas informações lado a lado: o preço original riscado e,
ao lado, o preço promocional em destaque, na mesma coluna.

### Confirmado durante o brainstorming (evita retrabalho)

- A API do Mercado Livre (`GET /items?ids=...`, já usado tanto por
  `ml_client.buscar_anuncios_ativos()` quanto por `_buscar_inventario`)
  devolve, sem custo de chamada extra:
  - `price`: preço atual de venda — **já reflete o desconto**, se a promoção
    estiver ativa.
  - `original_price`: preço de referência antes do desconto. É `null` quando
    não há promoção ativa; quando há, é maior que `price`. Confirmado ao vivo
    contra produtos reais da conta YUSO (ex: `MLB4525113153`,
    `price=44.99`, `original_price=99.99`).
  - Observado também: em alguns itens sem promoção, `original_price` vem
    preenchido mas **igual** a `price` (ex: `MLB6600614134`,
    `price=original_price=77.1`) — não é sinal de promoção nesse caso.
- Os cálculos de margem/custo em `routes/custos.py` já usam `item.get("preco")`
  (mapeado de `price`), ou seja, **já usam o preço com desconto aplicado**.
  Este é o valor certo para cálculo e **não muda** neste projeto — é
  puramente uma melhoria visual. Inventário não tem cálculo de margem, só
  mostra preço/estoque.
- Estúdio IA também mostra "price", mas de produtos de outros vendedores
  (pesquisa de concorrência) — fora de escopo.
- `Margem.jsx`/`Analitico.jsx`/`Dashboard.jsx` não mostram preço unitário por
  produto (mostram faturamento agregado, já construído a partir do
  `unit_price` real de cada venda) — fora de escopo, nada a mudar lá.
- `PedidoDetalhe.jsx`/exportação CSV de `Pedidos.jsx` já mostram o preço real
  da venda (`unit_price` do pedido) — já correto, fora de escopo.

### Escopo

**Dentro (duas implementações paralelas, backend):**
- `ml_client.buscar_anuncios_ativos()`: extrair também `original_price` de
  cada item, junto ao que já é extraído (`preco`, `titulo`, etc). Consumido
  por `routes/custos.py::fetch_custos`, que repassa `preco_original` no
  payload de cada produto.
- `routes/inventario.py::_buscar_inventario`: **extração própria** de
  `original_price` do mesmo `body` que já é lido ali (linha ~121-133) —
  não vem de `buscar_anuncios_ativos`, é uma segunda extração independente
  no mesmo formato. Repassa `preco_original` em `fetch_inventario`.

**Dentro (frontend):**
- `src/pages/CustosProdutos.jsx` e `src/pages/Inventario.jsx`: coluna de
  preço passa a mostrar, quando há promoção real (`preco_original` presente
  E maior que `preco_venda`/`preco`): valor original riscado + valor
  promocional em destaque, no mesmo espaço da coluna atual. Sem promoção:
  mostra só o valor, como hoje (sem mudança visual).

**Fora:**
- Qualquer mudança em cálculo de margem, custo, faturamento ou lucro.
- Margem.jsx, Analitico.jsx, Dashboard.jsx, PedidoDetalhe.jsx, Pedidos.jsx,
  EstudioIA.jsx.
- Detecção/alerta de produtos em promoção (isso é só exibição, não um
  relatório ou notificação).

### Detalhe visual

Quando há promoção ativa, a coluna de preço mostra duas linhas dentro do
mesmo espaço:
```
R$ 99,99   (riscado, cinza/apagado)
R$ 44,99   (cor normal/destaque, tamanho maior)
```
Sem promoção: mostra só `R$ 44,99` normalmente, como hoje — nenhuma mudança
visual pra produtos sem desconto ativo.

Regra de detecção de promoção: `preco_original != null AND preco_original > preco_venda`
(estritamente maior — cobre o caso observado de `original_price == price`
sem promoção real).

## Parte 2 — Deduplicação de produtos por SKU

### Problema

Um mesmo produto físico aparece como DOIS anúncios ativos distintos (dois
`ml_item_id` diferentes) nas telas de Custos de Produtos e Inventário: um
anúncio de catálogo (`catalog_listing: true`) e um anúncio normal
(`catalog_listing: false`), ambos genuinamente ativos no Mercado Livre — não
é um bug de duplicação no código, são duas listagens reais. A usuária só cria
um anúncio por produto; o segundo é gerado pelo mecanismo de catálogo do ML.
Ela quer ver **uma linha só por produto**.

### Confirmado durante o brainstorming

- A API do ML já devolve o SKU real de cada item — atributo `SELLER_SKU`
  dentro de `attributes`, já presente na mesma chamada em lote
  (`GET /items?ids=...`), **sem custo de chamada extra** (confirmado: 20/20
  itens testados da YUSO tinham `attributes` no corpo da resposta em lote).
- Confirmado ao vivo: 100% dos produtos testados (20 de ~95 ativos da YUSO)
  têm `SELLER_SKU` preenchido. Achados 9 pares reais de duplicata (mesmo
  SKU, dois `ml_item_id`) nesses 20.
- O campo `sku_interno` que já existe em `custos_produtos` (digitado
  manualmente pela usuária, e hoje exibido em `Inventario.jsx`) é
  **incompleto** — 2 dos 18 registros correspondentes aos 9 pares testados
  estavam com `sku_interno` vazio, mesmo tendo `SELLER_SKU` preenchido na
  API. Por isso o SKU usado pro agrupamento é o da API do ML, não o campo
  manual — **e a coluna que hoje mostra `sku_interno` em Inventário passa a
  mostrar o SKU da API** (mais confiável), não os dois lado a lado.
- Nos 9 pares testados, o custo (`custo_unitario`) já cadastrado bate entre
  as duas linhas duplicadas (a usuária vem digitando o mesmo valor duas
  vezes, manualmente) — evidência de que isso já é dor real, não hipotética.
- `custos_produtos` é uma tabela chaveada por `(conta_ml, item_id)` (o
  `ml_item_id`/MLB), não por SKU — este spec não muda o schema.
- **Decisão já tomada pela usuária:** quando há duplicata, mantém o anúncio
  de catálogo (`catalog_listing == true`) — anúncios de catálogo tendem a
  ganhar a buy box do ML. Isso vale mesmo se o anúncio "perdedor" (escondido)
  tiver um preço ou promoção diferente — o preço do catálogo é aceito como
  o de referência pra exibição. Se no futuro isso se mostrar errado na
  prática, revisitar.

### Escopo

**Dentro (duas implementações paralelas, backend — mesma razão da Parte 1):**
- `ml_client.buscar_anuncios_ativos()`: extrair o SKU real (`attributes` →
  item com `id == "SELLER_SKU"` → `value_name`) e `catalog_product_id`
  (já lido em outro campo hoje, `search_id` — reaproveitar) de cada item.
- `routes/inventario.py::_buscar_inventario`: mesma extração, independente
  (SKU + `catalog_listing`, que hoje não é lido ali — conferir e adicionar).
- **Função de agrupamento compartilhada** (novo módulo pequeno, ex.
  `services/dedup_produtos.py`, importado pelos dois routes — evita duplicar
  a lógica de agrupamento em si, só a *extração* dos campos precisa ser
  paralela): dado uma lista de itens com `sku`, `catalog_listing`,
  `catalog_product_id`, `status`, devolve a lista filtrada:
  - Agrupa por `sku` quando presente **dentro do mesmo `status`** (não
    mistura item ativo com inativo no mesmo grupo — ver nota abaixo).
  - Sem `sku`: tenta um segundo agrupamento por `catalog_product_id` (cobre
    o caso de item sem SELLER_SKU que ainda assim é duplicata de catálogo);
    sem os dois, não agrupa, aparece sozinho.
  - Dentro de um grupo: mantém o item com `catalog_listing == true`; se
    houver mais de um catálogo ou nenhum, desempata ordenando por
    `ml_item_id` (determinístico — não depende da ordem de retorno da busca
    do ML, que não é garantidamente estável entre chamadas).
  - **Risco aceito, não mitigado nesta versão:** um SKU reaproveitado por
    engano entre dois produtos diferentes causaria uma fusão indevida
    (esconderia um produto real). Não temos como detectar isso hoje; se
    acontecer, teto seria via `catalog_product_id` divergente dentro do
    mesmo grupo de SKU — não implementado nesta primeira versão.
- **Ordem crítica em `fetch_custos`:** o filtro de dedup só se aplica à
  lista usada pra montar `produtos` (exibição). O cálculo de `active_ids`
  (usado pra marcar `ativo=true/false` em `custos_produtos`, linha 21 de
  `custos.py`) continua rodando sobre a lista **completa, sem dedup** — a
  linha "perdedora" da duplicata continua sendo uma listagem genuinamente
  ativa no ML e não pode ser marcada como inativa no banco por causa de um
  filtro que é só de exibição.
- **Totais de Inventário mudam, e isso é aceito conscientemente:**
  `_buscar_inventario` alimenta tanto as linhas exibidas quanto os totais
  (`total_itens`, `custo_total_estoque`, `venda_prevista_total`,
  `liquido_previsto_total`). Aplicando o dedup ali, os totais passam a
  refletir só os produtos deduplicados — o que na prática **corrige** um
  duplo-count pré-existente em pares FBM (item sem `inventory_id` — hoje já
  contados duas vezes quando duplicados, um bug lateral que este projeto
  incidentalmente resolve). Comportamento novo pretendido, não regressão.

**Dentro (frontend):**
- `src/pages/CustosProdutos.jsx` e `src/pages/Inventario.jsx`: coluna que
  hoje mostra o MLB (`ml_item_id`)/`sku_interno` como identificador
  principal passa a mostrar o SKU da API do ML. O `ml_item_id` do anúncio
  "vencedor" continua sendo usado internamente (edição de custo, links,
  etc.) — só o rótulo visível muda; quando não há SKU, continua mostrando o
  MLB como está hoje.

**Fora:**
- Migrar/mesclar o schema de `custos_produtos` pra usar SKU como chave.
  A linha do anúncio "perdedor" continua existindo no banco (órfã, sem
  aparecer na tela), com seu próprio `custo_unitario` desatualizado em
  relação ao vencedor se a usuária editar só o vencedor depois do dedup.
  **Consequência aceita:** se um dia o anúncio de catálogo for desativado e
  o normal virar o único ativo, ele reaparece na tela com o custo antigo
  (potencialmente desatualizado) — não há sincronização automática entre as
  duas linhas. Se isso incomodar na prática, é um projeto futuro (ex:
  espelhar `custo_unitario` pras duas linhas do par ao salvar).
- Detectar/corrigir colisão de SKU entre produtos diferentes (ver risco
  aceito acima).
- Qualquer tela além de Custos de Produtos e Inventário.
- Edição em lote ou fusão manual de produtos duplicados pela usuária — o
  agrupamento é automático, sem tela de configuração.
- Deduplicar entre contas diferentes (YUSO e M12 nunca se fundem, mesmo com
  SKU igual — cada conta_ml é seu próprio universo, como já é hoje em todo
  o resto do sistema).
