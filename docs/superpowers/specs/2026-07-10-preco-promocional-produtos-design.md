# Preço Promocional + Deduplicação de Produtos por SKU — Design

**Repos:** `ml-seller-api` (backend, Flask) + `ml-seller-app` (frontend, React/Vite/Tailwind)

Duas melhorias nas mesmas duas telas (Custos de Produtos, Inventário), na
mesma função de busca (`ml_client.buscar_anuncios_ativos`) — agrupadas num
spec só porque a segunda (dedup) precisa rodar antes da primeira (preço
promocional) na pipeline de dados: primeiro decide quais linhas aparecem,
depois decora a coluna de preço de cada uma.

## Parte 1 — Preço Promocional

### Problema

As telas de **Custos de Produtos** e **Inventário** mostram o preço de venda de cada
produto vindo do catálogo do Mercado Livre, mas só exibem um valor único — sem
indicar quando esse produto está com uma promoção/desconto ativo no ML. A
usuária quer ver as duas informações lado a lado: o preço original riscado e,
ao lado, o preço promocional em destaque, na mesma coluna.

## Confirmado durante o brainstorming (evita retrabalho)

- A API do Mercado Livre (`GET /items?ids=...`, já usado por
  `ml_client.buscar_anuncios_ativos()`) devolve, sem custo de chamada extra:
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
  puramente uma melhoria visual.
- Inventário no domínio deste projeto refere a produtos vendidos por ela ou
  suas contas. Estúdio IA também mostra "price", mas de produtos de outros
  vendedores (pesquisa de concorrência) — fora de escopo.
- `Margem.jsx`/`Analitico.jsx`/`Dashboard.jsx` não mostram preço unitário por
  produto (mostram faturamento agregado, já construído a partir do
  `unit_price` real de cada venda) — fora de escopo, nada a mudar lá.
- `PedidoDetalhe.jsx`/exportação CSV de `Pedidos.jsx` já mostram o preço real
  da venda (`unit_price` do pedido) — já correto, fora de escopo.

## Escopo

**Dentro:**
- `ml_client.buscar_anuncios_ativos()`: extrair também `original_price` de
  cada item, junto ao que já é extraído (`preco`, `titulo`, etc).
- `routes/custos.py::fetch_custos`: repassar `preco_original` (de
  `original_price`) no payload de cada produto.
- `routes/inventario.py::_buscar_inventario`: mesma coisa.
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

## Detalhe visual

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
  (`GET /items?ids=...`) usada por `buscar_anuncios_ativos`, **sem custo de
  chamada extra** (confirmado: 20/20 itens testados da YUSO tinham
  `attributes` no corpo da resposta em lote).
- Confirmado ao vivo: 100% dos produtos testados (20/20) têm `SELLER_SKU`
  preenchido. Achados 9 pares reais de duplicata (mesmo SKU, dois
  `ml_item_id`) nos produtos ativos da YUSO.
- O campo `sku_interno` que já existe em `custos_produtos` (digitado
  manualmente pela usuária) é **incompleto** — 2 dos 18 registros
  correspondentes aos 9 pares testados estavam com `sku_interno` vazio,
  mesmo tendo `SELLER_SKU` preenchido na API. Por isso o SKU usado pro
  agrupamento é o da API do ML, não o campo manual.
- Nos 9 pares testados, o custo (`custo_unitario`) já cadastrado bate entre
  as duas linhas duplicadas (a usuária vem digitando o mesmo valor duas
  vezes, manualmente) — evidência de que isso já é dor real, não hipotética.
- `custos_produtos` é uma tabela chaveada por `(conta_ml, item_id)` (o
  `ml_item_id`/MLB), não por SKU — este spec não muda o schema nem migra
  dados, é um filtro na camada de exibição.

### Escopo

**Dentro:**
- `ml_client.buscar_anuncios_ativos()`: extrair também o SKU real
  (`attributes` → item com `id == "SELLER_SKU"` → `value_name`) de cada item,
  junto ao que já é extraído.
- Nova lógica de agrupamento (local mais natural: dentro de
  `routes/custos.py::fetch_custos` e `routes/inventario.py::_buscar_inventario`,
  já que os dois consomem a mesma lista de itens e precisam do mesmo filtro):
  agrupa itens ativos por SKU; quando um SKU tem mais de um item, mantém
  apenas o de `catalog_listing == true` (se nenhum dos itens do grupo for de
  catálogo, mantém o primeiro); itens sem SKU não são agrupados, aparecem
  normalmente, um por um.
- `src/pages/CustosProdutos.jsx` e `src/pages/Inventario.jsx`: coluna que
  hoje mostra o MLB (`ml_item_id`) como identificador principal passa a
  mostrar o SKU. O `ml_item_id` do anúncio "vencedor" continua sendo usado
  internamente (edição de custo, links, etc.) — só o rótulo visível muda;
  quando não há SKU, continua mostrando o MLB como está hoje.

**Fora:**
- Migrar/mesclar o schema de `custos_produtos` pra usar SKU como chave.
  A linha do anúncio "perdedor" continua existindo no banco (órfã, sem
  aparecer na tela) — não é apagada nem sincronizada automaticamente com a
  linha exibida.
- Qualquer tela além de Custos de Produtos e Inventário.
- Edição em lote ou fusão manual de produtos duplicados pela usuária — o
  agrupamento é automático, sem tela de configuração.
