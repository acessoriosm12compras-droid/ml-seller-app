# Preço Promocional nos Produtos — Design

**Repos:** `ml-seller-api` (backend, Flask) + `ml-seller-app` (frontend, React/Vite/Tailwind)

## Problema

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
