# Preço Promocional + Deduplicação de Produtos por SKU Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nas telas Custos de Produtos e Inventário, mostrar preço original riscado + promocional quando há promoção ativa no ML, e mostrar uma linha só por produto (agrupado por SKU real) em vez de duas quando o mesmo produto tem um anúncio de catálogo e um normal.

**Architecture:** Duas fontes de dados backend INDEPENDENTES (`ml_client.py::buscar_anuncios_ativos` para Custos, `routes/inventario.py::_buscar_inventario` para Inventário) passam a extrair 4 campos novos (`original_price`, `sku`, `catalog_listing`, `catalog_product_id`) da mesma resposta em lote do ML que já é buscada hoje — sem chamada extra à API. Um módulo novo e compartilhado (`services/dedup_produtos.py`) agrupa por SKU (com fallback por `catalog_product_id`) e decide qual anúncio mostrar. Cada route aplica o dedup só na lista de EXIBIÇÃO, preservando a lista completa para qualquer lógica que precise saber sobre todos os anúncios genuinamente ativos (marcação de `ativo` no banco, em Custos). Frontend decora a coluna de preço condicionalmente e troca o identificador mostrado.

**Tech Stack:** Flask (Python), React + Vite + Tailwind, pytest, React Query.

## Global Constraints

- `original_price`, `sku`, `catalog_listing`, `catalog_product_id` são extraídos em DUAS implementações independentes (`ml_client.py::buscar_anuncios_ativos` e `routes/inventario.py::_buscar_inventario`) — não há função de busca compartilhada entre Custos e Inventário.
- SKU vem de `attributes` → item com `id == "SELLER_SKU"` → campo `value_name`.
- `catalog_product_id` vem direto de `body.get("catalog_product_id")` — **nunca** reaproveitar o campo `search_id` já existente (`search_id = catalog_product_id if catalogo else body["id"]` — só bate com `catalog_product_id` pro membro de catálogo do par, quebra o fallback de agrupamento pro membro normal).
- Detecção de promoção (frontend): `preco_original != null && preco_original > preco_venda` (estritamente maior).
- Regra de dedup: agrupa por SKU dentro do mesmo `status` (nunca mistura item ativo com inativo no mesmo grupo); sem SKU, tenta por `catalog_product_id`; sem os dois, item fica sozinho. Dentro de um grupo: mantém o item com `catalog_listing == true`; se houver mais de um catálogo ou nenhum, desempata ordenando por `ml_item_id` (determinístico).
- Em `fetch_custos`: o dedup filtra só a lista usada pra montar a resposta (`produtos`); `active_ids` (usado pra `UPDATE ativo=true/false` em `custos_produtos`) continua calculado sobre a lista completa, sem dedup.
- Em `fetch_inventario`: o dedup é aplicado ANTES do loop que monta totais — os totais (`total_itens`, `custo_total_estoque`, `venda_prevista_total`, `liquido_previsto_total`) passam a refletir a lista deduplicada. Isso é uma mudança de comportamento pretendida (corrige double-count pré-existente em pares FBM duplicados), não uma regressão a evitar.
- Dedup nunca funde produtos de contas (`conta_ml`) diferentes.
- Nenhuma mudança em `margem_estimada` ou qualquer outro cálculo de margem/lucro/faturamento — eles já usam o preço com desconto aplicado.
- Sem alterações no schema de `custos_produtos` — a linha do anúncio "perdedor" de uma duplicata continua existindo no banco, só não aparece na lista.

---

### Task 1: Módulo de deduplicação por SKU

**Files:**
- Create: `services/dedup_produtos.py`
- Test: `tests/test_dedup_produtos.py`

**Interfaces:**
- Produces: `deduplicar_por_sku(itens: list[dict]) -> list[dict]`. Cada item de entrada é um dict com pelo menos `ml_item_id` (str), e opcionalmente `sku` (str ou None), `catalog_listing` (bool), `catalog_product_id` (str ou None), `status` (str, default `"active"` se ausente). Devolve uma lista filtrada (subconjunto dos itens de entrada, mesma referência de dict, sem cópia) com no máximo 1 item por grupo, preservando a ordem relativa dos grupos conforme aparecem na entrada.

- [ ] **Step 1: Escrever os testes**

```python
# tests/test_dedup_produtos.py
from services.dedup_produtos import deduplicar_por_sku


def test_item_unico_sem_sku_fica_sozinho():
    itens = [{"ml_item_id": "MLB1", "sku": None, "catalog_listing": False,
              "catalog_product_id": None, "status": "active"}]
    assert deduplicar_por_sku(itens) == itens


def test_dois_itens_sem_sku_e_sem_catalog_product_id_ficam_os_dois():
    itens = [
        {"ml_item_id": "MLB1", "sku": None, "catalog_listing": False,
         "catalog_product_id": None, "status": "active"},
        {"ml_item_id": "MLB2", "sku": None, "catalog_listing": False,
         "catalog_product_id": None, "status": "active"},
    ]
    assert deduplicar_por_sku(itens) == itens


def test_mesmo_sku_mantem_o_catalogo():
    normal = {"ml_item_id": "MLB2", "sku": "FV0012", "catalog_listing": False,
              "catalog_product_id": None, "status": "active"}
    catalogo = {"ml_item_id": "MLB1", "sku": "FV0012", "catalog_listing": True,
                "catalog_product_id": "MLB999", "status": "active"}
    resultado = deduplicar_por_sku([normal, catalogo])
    assert resultado == [catalogo]


def test_mesmo_sku_sem_nenhum_catalogo_desempata_por_ml_item_id():
    a = {"ml_item_id": "MLB2", "sku": "X", "catalog_listing": False,
         "catalog_product_id": None, "status": "active"}
    b = {"ml_item_id": "MLB1", "sku": "X", "catalog_listing": False,
         "catalog_product_id": None, "status": "active"}
    assert deduplicar_por_sku([a, b]) == [b]  # MLB1 < MLB2


def test_mesmo_sku_dois_catalogos_desempata_por_ml_item_id():
    a = {"ml_item_id": "MLB3", "sku": "X", "catalog_listing": True,
         "catalog_product_id": "C1", "status": "active"}
    b = {"ml_item_id": "MLB2", "sku": "X", "catalog_listing": True,
         "catalog_product_id": "C1", "status": "active"}
    assert deduplicar_por_sku([a, b]) == [b]  # MLB2 < MLB3


def test_nao_mistura_status_diferentes_no_mesmo_grupo():
    ativo = {"ml_item_id": "MLB1", "sku": "X", "catalog_listing": False,
             "catalog_product_id": None, "status": "active"}
    inativo = {"ml_item_id": "MLB2", "sku": "X", "catalog_listing": False,
               "catalog_product_id": None, "status": "inactive"}
    resultado = deduplicar_por_sku([ativo, inativo])
    assert resultado == [ativo, inativo]


def test_sem_sku_usa_catalog_product_id_como_fallback():
    normal = {"ml_item_id": "MLB2", "sku": None, "catalog_listing": False,
              "catalog_product_id": "C1", "status": "active"}
    catalogo = {"ml_item_id": "MLB1", "sku": None, "catalog_listing": True,
                "catalog_product_id": "C1", "status": "active"}
    resultado = deduplicar_por_sku([normal, catalogo])
    assert resultado == [catalogo]


def test_status_default_active_quando_ausente():
    a = {"ml_item_id": "MLB1", "sku": "X", "catalog_listing": False, "catalog_product_id": None}
    b = {"ml_item_id": "MLB2", "sku": "X", "catalog_listing": True, "catalog_product_id": None}
    resultado = deduplicar_por_sku([a, b])
    assert resultado == [b]
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_dedup_produtos.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.dedup_produtos'`

- [ ] **Step 3: Implementar**

```python
# services/dedup_produtos.py
"""Agrupa anúncios ativos por SKU real do Mercado Livre (não pelo campo
manual sku_interno) pra colapsar pares catálogo+normal do mesmo produto
numa linha só. Usado tanto por routes/custos.py quanto por
routes/inventario.py — cada um extrai os campos de entrada de forma
independente (não há busca de dados compartilhada), só a lógica de
agrupamento em si é compartilhada aqui."""


def _chave_grupo(item):
    status = item.get("status", "active")
    sku = item.get("sku")
    if sku:
        return ("sku", status, sku)
    catalog_product_id = item.get("catalog_product_id")
    if catalog_product_id:
        return ("catalog", status, catalog_product_id)
    return ("solo", item["ml_item_id"])


def deduplicar_por_sku(itens):
    grupos = {}
    ordem = []
    for item in itens:
        chave = _chave_grupo(item)
        if chave not in grupos:
            grupos[chave] = []
            ordem.append(chave)
        grupos[chave].append(item)

    resultado = []
    for chave in ordem:
        membros = grupos[chave]
        if len(membros) == 1:
            resultado.append(membros[0])
            continue
        catalogos = [m for m in membros if m.get("catalog_listing")]
        candidatos = catalogos if len(catalogos) == 1 else (catalogos or membros)
        resultado.append(min(candidatos, key=lambda m: m["ml_item_id"]))
    return resultado
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_dedup_produtos.py -v`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add services/dedup_produtos.py tests/test_dedup_produtos.py
git commit -m "feat: módulo de deduplicação de produtos por SKU real do ML"
```

---

### Task 2: `ml_client.buscar_anuncios_ativos` extrai preço original, SKU e catalog_product_id

**Files:**
- Modify: `ml_client.py:544-605` (função `buscar_anuncios_ativos`)
- Test: `tests/test_ml_client.py`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: cada dict de `buscar_anuncios_ativos(token, user_id)` ganha 3 chaves novas: `preco_original` (float ou None), `sku` (str ou None), `catalog_product_id` (str ou None). As chaves existentes (`ml_item_id`, `titulo`, `catalogo`, `search_id`, `preco`, `available_quantity`) não mudam.

- [ ] **Step 1: Escrever o teste**

```python
# adicionar em tests/test_ml_client.py
from unittest.mock import patch, MagicMock
import ml_client
from cache import _cache


def _fake_items_search_response(ids):
    return MagicMock(status_code=200, json=lambda: {
        "results": ids, "paging": {"total": len(ids)},
    })


def _fake_items_batch_response(bodies):
    return MagicMock(status_code=200, json=lambda: [{"body": b} for b in bodies])


def test_buscar_anuncios_ativos_extrai_preco_original_sku_e_catalog_product_id():
    _cache.delete("anuncios:UID_TEST_PROMO")
    body_com_promo = {
        "id": "MLB1", "title": "Produto A", "catalog_listing": True,
        "catalog_product_id": "MLBC1", "price": 44.99, "original_price": 99.99,
        "available_quantity": 10,
        "attributes": [{"id": "SELLER_SKU", "value_name": "FV0012"}],
    }
    body_sem_promo = {
        "id": "MLB2", "title": "Produto B", "catalog_listing": False,
        "catalog_product_id": None, "price": 30.0, "original_price": None,
        "available_quantity": 5,
        "attributes": [{"id": "COLOR", "value_name": "Azul"}],
    }
    with patch("requests.get") as mock_get:
        mock_get.side_effect = [
            _fake_items_search_response(["MLB1", "MLB2"]),
            _fake_items_batch_response([body_com_promo, body_sem_promo]),
        ]
        itens = ml_client.buscar_anuncios_ativos("tok", "UID_TEST_PROMO")

    item1, item2 = itens
    assert item1["preco_original"] == 99.99
    assert item1["sku"] == "FV0012"
    assert item1["catalog_product_id"] == "MLBC1"
    assert item2["preco_original"] is None
    assert item2["sku"] is None
    assert item2["catalog_product_id"] is None


def test_buscar_anuncios_ativos_search_id_nao_e_reaproveitado_como_catalog_product_id():
    """search_id só bate com catalog_product_id pro membro de catálogo do
    par — pro membro normal, search_id é o próprio MLB. catalog_product_id
    precisa ser extraído direto de body, não copiado de search_id."""
    _cache.delete("anuncios:UID_TEST_SEARCHID")
    body_normal_com_catalog_product_id = {
        "id": "MLB2", "title": "Produto Normal", "catalog_listing": False,
        "catalog_product_id": "MLBC1", "price": 30.0, "original_price": None,
        "available_quantity": 5, "attributes": [],
    }
    with patch("requests.get") as mock_get:
        mock_get.side_effect = [
            _fake_items_search_response(["MLB2"]),
            _fake_items_batch_response([body_normal_com_catalog_product_id]),
        ]
        itens = ml_client.buscar_anuncios_ativos("tok", "UID_TEST_SEARCHID")

    item = itens[0]
    assert item["search_id"] == "MLB2"          # comportamento existente inalterado
    assert item["catalog_product_id"] == "MLBC1"  # novo campo, extraído direto do body
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_ml_client.py -v -k buscar_anuncios_ativos`
Expected: FAIL — `KeyError: 'preco_original'`

- [ ] **Step 3: Implementar**

Em `ml_client.py`, dentro do loop `for entry in resp2.json():` da função `buscar_anuncios_ativos` (linha ~592-603), substituir:

```python
        for entry in resp2.json():
            body = entry.get("body", {})
            if body.get("id"):
                catalogo = bool(body.get("catalog_listing", False))
                items.append({
                    "ml_item_id": body["id"],
                    "titulo": body.get("title", ""),
                    "catalogo": catalogo,
                    "search_id": body.get("catalog_product_id") if catalogo else body["id"],
                    "preco": body.get("price"),
                    "available_quantity": body.get("available_quantity", 0),
                })
```

por:

```python
        for entry in resp2.json():
            body = entry.get("body", {})
            if body.get("id"):
                catalogo = bool(body.get("catalog_listing", False))
                sku = next(
                    (a.get("value_name") for a in body.get("attributes", [])
                     if a.get("id") == "SELLER_SKU"),
                    None,
                )
                items.append({
                    "ml_item_id": body["id"],
                    "titulo": body.get("title", ""),
                    "catalogo": catalogo,
                    "search_id": body.get("catalog_product_id") if catalogo else body["id"],
                    "preco": body.get("price"),
                    "preco_original": body.get("original_price"),
                    "sku": sku,
                    "catalog_product_id": body.get("catalog_product_id"),
                    "available_quantity": body.get("available_quantity", 0),
                })
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_ml_client.py -v -k buscar_anuncios_ativos`
Expected: 2 passed.

- [ ] **Step 5: Confirmar suíte completa sem regressão**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/ -q`
Expected: mesma contagem de falhas pré-existentes documentada (26 failed — JWT ES256/HS256 mock desatualizado), nenhuma nova.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add ml_client.py tests/test_ml_client.py
git commit -m "feat: buscar_anuncios_ativos extrai preco_original, sku e catalog_product_id"
```

---

### Task 3: `routes/custos.py` aplica dedup e repassa os novos campos

**Files:**
- Modify: `routes/custos.py:11-70` (função `fetch_custos`)
- Test: `tests/test_custos.py`

**Interfaces:**
- Consumes: `services.dedup_produtos.deduplicar_por_sku(itens) -> list[dict]` (Task 1). `ml_client.buscar_anuncios_ativos` agora devolve itens com `preco_original`, `sku`, `catalog_product_id` (Task 2).
- Produces: cada produto em `fetch_custos(conta_ml)["produtos"]` ganha `preco_original` (float ou None) e `sku` (str ou None), além dos campos já existentes (`item_id`, `titulo`, `preco_venda`, `custo_unitario`, `margem_estimada`, `loja`).

- [ ] **Step 1: Escrever o teste**

```python
# adicionar em tests/test_custos.py
def test_fetch_custos_deduplica_por_sku_mantendo_catalogo(monkeypatch):
    c = _import_custos()
    monkeypatch.setattr(c.ml_client, "renovar_token", lambda conta: ("tok", "uid"))
    monkeypatch.setattr(c.ml_client, "buscar_anuncios_ativos", lambda t, u: [
        {"ml_item_id": "MLB2", "titulo": "Produto normal", "preco": 30.0,
         "preco_original": None, "sku": "FV0012", "catalog_product_id": None,
         "catalogo": False, "status": "active"},
        {"ml_item_id": "MLB1", "titulo": "Produto catálogo", "preco": 25.0,
         "preco_original": None, "sku": "FV0012", "catalog_product_id": "MLBC1",
         "catalogo": True, "status": "active"},
    ])
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = lambda s: s
    mock_cursor.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchall.return_value = []
    mock_conn.cursor.return_value = mock_cursor
    monkeypatch.setattr(c.db, "get_conn", lambda: mock_conn)

    out = c.fetch_custos("YUSO")
    assert len(out["produtos"]) == 1
    assert out["produtos"][0]["item_id"] == "MLB1"
    assert out["produtos"][0]["sku"] == "FV0012"


def test_fetch_custos_dedup_nao_afeta_marcacao_de_ativo_no_banco(monkeypatch):
    """A linha 'perdedora' da duplicata continua genuinamente ativa no ML —
    não pode ser marcada ativo=false só porque o dedup a escondeu da tela."""
    c = _import_custos()
    monkeypatch.setattr(c.ml_client, "renovar_token", lambda conta: ("tok", "uid"))
    monkeypatch.setattr(c.ml_client, "buscar_anuncios_ativos", lambda t, u: [
        {"ml_item_id": "MLB2", "titulo": "Produto normal", "preco": 30.0,
         "preco_original": None, "sku": "FV0012", "catalog_product_id": None,
         "catalogo": False, "status": "active"},
        {"ml_item_id": "MLB1", "titulo": "Produto catálogo", "preco": 25.0,
         "preco_original": None, "sku": "FV0012", "catalog_product_id": "MLBC1",
         "catalogo": True, "status": "active"},
    ])
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = lambda s: s
    mock_cursor.__exit__ = MagicMock(return_value=False)
    # custos_produtos já tem as DUAS linhas cadastradas (cenário real: usuária
    # digitou custo pras duas antes do dedup existir)
    mock_cursor.fetchall.return_value = [
        {"item_id": "MLB1", "custo_unitario": 10.0},
        {"item_id": "MLB2", "custo_unitario": 10.0},
    ]
    mock_conn.cursor.return_value = mock_cursor
    monkeypatch.setattr(c.db, "get_conn", lambda: mock_conn)

    c.fetch_custos("YUSO")

    # As duas linhas devem ter sido marcadas ativo=true (nenhuma inativada) —
    # confirma que active_ids foi calculado sobre a lista completa, não a
    # deduplicada.
    update_calls = [call for call in mock_cursor.execute.call_args_list
                     if "UPDATE custos_produtos SET ativo" in call[0][0]]
    inativou_alguma = any("ativo = false" in call[0][0] for call in update_calls)
    assert not inativou_alguma


def test_fetch_custos_preco_original_repassado(monkeypatch):
    c = _import_custos()
    monkeypatch.setattr(c.ml_client, "renovar_token", lambda conta: ("tok", "uid"))
    monkeypatch.setattr(c.ml_client, "buscar_anuncios_ativos", lambda t, u: [
        {"ml_item_id": "MLB1", "titulo": "Produto X", "preco": 44.99,
         "preco_original": 99.99, "sku": "FV0012", "catalog_product_id": None,
         "catalogo": False, "status": "active"},
    ])
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = lambda s: s
    mock_cursor.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchall.return_value = []
    mock_conn.cursor.return_value = mock_cursor
    monkeypatch.setattr(c.db, "get_conn", lambda: mock_conn)

    out = c.fetch_custos("YUSO")
    assert out["produtos"][0]["preco_original"] == 99.99
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_custos.py -v`
Expected: as 3 novas falham — a de dedup com `len(out["produtos"]) == 2` (sem dedup ainda), a de `preco_original` com `KeyError`.

- [ ] **Step 3: Implementar**

Em `routes/custos.py`, adicionar esta linha nova ao bloco de imports do topo do arquivo (as outras três já existem, linhas 4-6 — só a linha do `dedup_produtos` é nova):

```python
from services.dedup_produtos import deduplicar_por_sku
```

Substituir o corpo de `fetch_custos` (linhas 11-70):

```python
def fetch_custos(conta_ml):
    """Busca a lista de produtos/custos para uma única conta.

    Marca items ativos/inativos no DB (side-effect intencional por conta,
    baseado na lista COMPLETA de anúncios ativos — antes do dedup, já que
    um anúncio "escondido" pelo dedup continua genuinamente ativo no ML).
    Taggeia cada produto com ``loja=conta_ml``.
    Levanta exceção em caso de falha.
    """
    token, user_id = ml_client.renovar_token(conta_ml)
    itens = ml_client.buscar_anuncios_ativos(token, user_id)

    active_ids = {item["ml_item_id"] for item in itens}

    conn = db.get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT item_id, custo_unitario FROM custos_produtos WHERE conta_ml = %s",
                (conta_ml,)
            )
            custos = {
                r["item_id"]: float(r["custo_unitario"]) if r["custo_unitario"] is not None else None
                for r in cur.fetchall()
            }

            inactive_ids = [iid for iid in custos if iid not in active_ids]
            if inactive_ids:
                cur.execute(
                    "UPDATE custos_produtos SET ativo = false WHERE conta_ml = %s AND item_id = ANY(%s)",
                    (conta_ml, inactive_ids)
                )
            active_in_db = [iid for iid in custos if iid in active_ids]
            if active_in_db:
                cur.execute(
                    "UPDATE custos_produtos SET ativo = true WHERE conta_ml = %s AND item_id = ANY(%s)",
                    (conta_ml, active_in_db)
                )
        conn.commit()
    finally:
        conn.close()

    itens_exibicao = deduplicar_por_sku(itens)

    produtos = []
    for item in itens_exibicao:
        item_id = item["ml_item_id"]
        custo_unitario = custos.get(item_id)
        preco_venda = item.get("preco")

        margem_estimada = None
        if preco_venda and preco_venda > 0 and custo_unitario is not None:
            margem_estimada = round((preco_venda - custo_unitario) / preco_venda * 100, 1)

        produtos.append({
            "item_id": item_id,
            "titulo": item["titulo"],
            "preco_venda": preco_venda,
            "preco_original": item.get("preco_original"),
            "sku": item.get("sku"),
            "custo_unitario": custo_unitario,
            "margem_estimada": margem_estimada,
            "loja": conta_ml,
        })

    return {"produtos": produtos}
```

Note que `active_ids` (linha logo após buscar os itens) continua usando `itens` (lista completa) — o dedup só entra depois, em `itens_exibicao`, exclusivamente pro loop que monta `produtos`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_custos.py -v`
Expected: todos passam (incluindo os 4 testes pré-existentes).

- [ ] **Step 5: Confirmar suíte completa sem regressão**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/ -q`
Expected: mesma baseline de falhas pré-existentes, nenhuma nova.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add routes/custos.py tests/test_custos.py
git commit -m "feat: fetch_custos deduplica por SKU e repassa preco_original/sku"
```

---

### Task 4: `routes/inventario.py::_buscar_inventario` extrai preço original, SKU, catalog_listing e catalog_product_id

**Files:**
- Modify: `routes/inventario.py:63-177` (função `_buscar_inventario`)
- Test: `tests/test_inventario.py`

**Interfaces:**
- Consumes: nada de tasks anteriores (extração independente da Task 2 — mesma lógica, arquivo diferente).
- Produces: cada dict devolvido por `_buscar_inventario(token, user_id)` ganha 4 chaves novas: `preco_original` (float ou None), `sku` (str ou None), `catalog_listing` (bool), `catalog_product_id` (str ou None). As chaves existentes não mudam.

- [ ] **Step 1: Escrever o teste**

```python
# adicionar em tests/test_inventario.py
from unittest.mock import patch, MagicMock


def _fake_search_resp(ids):
    return MagicMock(status_code=200, json=lambda: {
        "results": ids, "paging": {"total": len(ids)},
    })


def _fake_batch_resp(bodies):
    return MagicMock(status_code=200, json=lambda: [{"body": b} for b in bodies])


def test_buscar_inventario_extrai_preco_original_sku_catalog_listing():
    inv = _import_inventario()
    inv._cache.get = MagicMock(return_value=None)
    inv._cache.set = MagicMock()

    body = {
        "id": "MLB1", "title": "Produto A", "catalog_listing": True,
        "catalog_product_id": "MLBC1", "price": 44.99, "original_price": 99.99,
        "inventory_id": None, "available_quantity": 10, "listing_type_id": "gold_special",
        "attributes": [{"id": "SELLER_SKU", "value_name": "FV0012"}],
    }
    with patch("routes.inventario.req.get") as mock_get:
        mock_get.side_effect = [
            _fake_search_resp(["MLB1"]),   # status=active
            _fake_search_resp([]),          # status=inactive
            _fake_batch_resp([body]),
        ]
        itens = inv._buscar_inventario("tok", "UID_TEST")

    item = itens[0]
    assert item["preco_original"] == 99.99
    assert item["sku"] == "FV0012"
    assert item["catalog_listing"] is True
    assert item["catalog_product_id"] == "MLBC1"
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_inventario.py -v -k preco_original`
Expected: FAIL — `KeyError: 'preco_original'`

- [ ] **Step 3: Implementar**

Em `routes/inventario.py`, dentro de `_buscar_inventario`, no bloco `for entry in resp2.json():` (linhas ~120-133), substituir:

```python
        for entry in resp2.json():
            body = entry.get("body", {})
            if not body.get("id"):
                continue
            item_id = body["id"]
            items_raw.append({
                "ml_item_id":         item_id,
                "titulo":             body.get("title", ""),
                "preco":              float(body.get("price") or 0),
                "inventory_id":       body.get("inventory_id"),
                "available_quantity": int(body.get("available_quantity") or 0),
                "listing_type_id":    body.get("listing_type_id", ""),
                "status":             status_map.get(item_id, "active"),
            })
```

por:

```python
        for entry in resp2.json():
            body = entry.get("body", {})
            if not body.get("id"):
                continue
            item_id = body["id"]
            sku = next(
                (a.get("value_name") for a in body.get("attributes", [])
                 if a.get("id") == "SELLER_SKU"),
                None,
            )
            items_raw.append({
                "ml_item_id":         item_id,
                "titulo":             body.get("title", ""),
                "preco":              float(body.get("price") or 0),
                "preco_original":     body.get("original_price"),
                "sku":                sku,
                "catalog_listing":    bool(body.get("catalog_listing", False)),
                "catalog_product_id": body.get("catalog_product_id"),
                "inventory_id":       body.get("inventory_id"),
                "available_quantity": int(body.get("available_quantity") or 0),
                "listing_type_id":    body.get("listing_type_id", ""),
                "status":             status_map.get(item_id, "active"),
            })
```

E no bloco "4. Build final list" (linhas ~146-174), que reconstrói `inventario` a partir de `items_raw`, adicionar os 4 campos novos ao dict final também:

```python
        inventario.append({
            "ml_item_id":        it["ml_item_id"],
            "titulo":            it["titulo"],
            "preco":             it["preco"],
            "preco_original":    it["preco_original"],
            "sku":               it["sku"],
            "catalog_listing":   it["catalog_listing"],
            "catalog_product_id": it["catalog_product_id"],
            "inventory_id":      iid,
            "listing_type_id":   it["listing_type_id"],
            "status":            it.get("status", "active"),
            "estoque":           total_stock,    # total físico (igual Gestor Seller)
            "disponivel":        avail_stock,    # disponível para venda agora
            "em_processamento":  em_proc,        # bloqueado: transfer/lost/withdrawal
            "detalhe_proc":      detalhe,        # breakdown por status
        })
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_inventario.py -v -k preco_original`
Expected: 1 passed.

- [ ] **Step 5: Confirmar suíte completa sem regressão**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/ -q`
Expected: mesma baseline de falhas pré-existentes, nenhuma nova.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add routes/inventario.py tests/test_inventario.py
git commit -m "feat: _buscar_inventario extrai preco_original, sku, catalog_listing e catalog_product_id"
```

---

### Task 5: `routes/inventario.py::fetch_inventario` aplica dedup antes dos totais

**Files:**
- Modify: `routes/inventario.py:180-319` (função `fetch_inventario`)
- Test: `tests/test_inventario.py`

**Interfaces:**
- Consumes: `services.dedup_produtos.deduplicar_por_sku` (Task 1). `_buscar_inventario` agora devolve itens com `preco_original`, `sku`, `catalog_listing`, `catalog_product_id` (Task 4).
- Produces: cada item em `fetch_inventario(...)["itens"]` ganha `preco_original` (float ou None) e o campo `sku_interno` (que hoje vem só de `custos_produtos`) passa a ser sobrescrito pelo `sku` real da API quando presente — ver Step 3. `total_itens` e os totais financeiros passam a refletir a lista deduplicada.

- [ ] **Step 1: Escrever o teste**

```python
# adicionar em tests/test_inventario.py
def test_fetch_inventario_deduplica_e_totais_refletem_dedup(monkeypatch):
    inv = _import_inventario()
    monkeypatch.setattr(inv.ml_client, "renovar_token", lambda conta: ("tok", "uid"))
    monkeypatch.setattr(inv, "_buscar_inventario", lambda t, u: [
        {"ml_item_id": "MLB2", "titulo": "Produto normal", "preco": 30.0,
         "preco_original": None, "sku": "FV0012", "catalog_listing": False,
         "catalog_product_id": None, "inventory_id": None,
         "listing_type_id": "gold_special", "status": "active",
         "estoque": 10, "disponivel": 10, "em_processamento": 0, "detalhe_proc": {}},
        {"ml_item_id": "MLB1", "titulo": "Produto catálogo", "preco": 25.0,
         "preco_original": None, "sku": "FV0012", "catalog_listing": True,
         "catalog_product_id": "MLBC1", "inventory_id": None,
         "listing_type_id": "gold_special", "status": "active",
         "estoque": 10, "disponivel": 10, "em_processamento": 0, "detalhe_proc": {}},
    ])
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = lambda s: s
    mock_cursor.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = {"imposto": 0}
    mock_conn.cursor.return_value = mock_cursor
    monkeypatch.setattr(inv.db, "get_conn", lambda: mock_conn)

    out = inv.fetch_inventario("YUSO", alerta_minimo=5, apenas_baixo=False)

    assert len(out["itens"]) == 1
    assert out["itens"][0]["ml_item_id"] == "MLB1"
    assert out["total_itens"] == 1
    # Sem dedup os dois FBM (inventory_id=None) seriam somados: 10+10=20.
    assert out["total_unidades"] == 10


def test_fetch_inventario_sku_da_api_sobrescreve_sku_interno(monkeypatch):
    inv = _import_inventario()
    monkeypatch.setattr(inv.ml_client, "renovar_token", lambda conta: ("tok", "uid"))
    monkeypatch.setattr(inv, "_buscar_inventario", lambda t, u: [
        {"ml_item_id": "MLB1", "titulo": "Produto A", "preco": 30.0,
         "preco_original": None, "sku": "FV0012", "catalog_listing": False,
         "catalog_product_id": None, "inventory_id": None,
         "listing_type_id": "gold_special", "status": "active",
         "estoque": 10, "disponivel": 10, "em_processamento": 0, "detalhe_proc": {}},
    ])
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = lambda s: s
    mock_cursor.__exit__ = MagicMock(return_value=False)
    # sku_interno manual está vazio pra esse item — a API tem que preencher
    mock_cursor.fetchall.return_value = [
        {"item_id": "MLB1", "custo_unitario": None, "sku_interno": None},
    ]
    mock_cursor.fetchone.return_value = {"imposto": 0}
    mock_conn.cursor.return_value = mock_cursor
    monkeypatch.setattr(inv.db, "get_conn", lambda: mock_conn)

    out = inv.fetch_inventario("YUSO", alerta_minimo=5, apenas_baixo=False)
    assert out["itens"][0]["sku_interno"] == "FV0012"
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_inventario.py -v -k "dedup or sku_da_api"`
Expected: FAIL — `test_fetch_inventario_deduplica...` falha com `len(out["itens"]) == 2` (sem dedup ainda).

- [ ] **Step 3: Implementar**

Em `routes/inventario.py`, adicionar esta linha nova ao bloco de imports do topo do arquivo (o import de `cache` já existe, linha 9 — só a linha do `dedup_produtos` é nova):

```python
from services.dedup_produtos import deduplicar_por_sku
```

Em `fetch_inventario`, logo após `itens = _buscar_inventario(token, user_id)` (linha 188), aplicar o dedup:

```python
    token, user_id = ml_client.renovar_token(conta_ml)
    itens = _buscar_inventario(token, user_id)
    itens = deduplicar_por_sku(itens)
```

No loop principal (linha ~225, `for item in itens:`), onde hoje `sku_interno = custo_row["sku_interno"] if custo_row else None` (linha 243), trocar pra preferir o SKU real da API quando presente:

```python
        custo_row   = custos.get(item_id)
        custo_unit  = float(custo_row["custo_unitario"]) if custo_row else None
        sku_interno = item.get("sku") or (custo_row["sku_interno"] if custo_row else None)
```

E no dict final montado em `resultado.append({...})` (linha ~281), adicionar `preco_original`:

```python
        resultado.append({
            "ml_item_id":          item_id,
            "titulo":              item["titulo"],
            "sku_interno":         sku_interno,
            "preco":               preco,
            "preco_original":      item.get("preco_original"),
            "listing_type_id":     item["listing_type_id"],
            "status":              status,
            "inativo":             inativo,
            "aguardando_decisao":  aguardando_decisao,
            "vai_repor":           intencoes.get(item_id),
            "custo_unitario":      custo_unit,
            "estoque":             estoque,       # total físico
            "disponivel":          disponivel,    # disponível para venda
            "em_processamento":    em_proc,       # bloqueado temporariamente
            "detalhe_processamento": detalhe,     # transfer/lost/withdrawal
            "estoque_baixo":       estoque_baixo,
            "custo_total_estoque": custo_estoque,
            "venda_prevista":      round(venda_prevista, 2),
            "liquido_previsto":    liquido_previsto,
            "loja":                conta_ml,
        })
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_inventario.py -v`
Expected: todos passam.

- [ ] **Step 5: Confirmar suíte completa sem regressão**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/ -q`
Expected: mesma baseline de falhas pré-existentes, nenhuma nova.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add routes/inventario.py tests/test_inventario.py
git commit -m "feat: fetch_inventario deduplica por SKU (totais refletem dedup) e usa SKU real da API"
```

---

### Task 6: Frontend — preço promocional e SKU em Custos de Produtos

**Files:**
- Modify: `src/pages/CustosProdutos.jsx:314-322`

**Interfaces:**
- Consumes: `produto.preco_original` (float ou None) e `produto.sku` (str ou None) — novos campos do payload de `GET /api/custos` (Task 3).

- [ ] **Step 1: Testar manualmente antes de mexer (baseline)**

Run: `cd ~/Desktop/ml-seller-app && npm run dev` (se não estiver rodando)
Abrir `/custos-produtos` logado, confirmar que a tela carrega normalmente hoje (preço único, MLB como identificador) antes da mudança.

- [ ] **Step 2: Implementar**

Em `src/pages/CustosProdutos.jsx`, substituir o bloco da célula de identificação do produto (linhas 314-317):

```jsx
                      <td className="px-4 py-3">
                        <p className="text-stone-200 truncate max-w-xs">{p.titulo}</p>
                        <p className="text-stone-600 text-xs">{p.item_id}</p>
                      </td>
```

por (mostra SKU quando disponível, mantém MLB como reserva quando não há SKU):

```jsx
                      <td className="px-4 py-3">
                        <p className="text-stone-200 truncate max-w-xs">{p.titulo}</p>
                        <p className="text-stone-600 text-xs">{p.sku || p.item_id}</p>
                      </td>
```

E o bloco da célula de preço (linhas 319-322):

```jsx
                      {/* Preço atual do anúncio no ML */}
                      <td className="px-4 py-3 text-right">
                        <span className="text-stone-300 font-medium">{fmtBRL(p.preco_venda)}</span>
                      </td>
```

por (mostra riscado + promocional quando há promoção real):

```jsx
                      {/* Preço atual do anúncio no ML — riscado + promocional quando há promoção ativa */}
                      <td className="px-4 py-3 text-right">
                        {p.preco_original != null && p.preco_original > p.preco_venda ? (
                          <div className="flex flex-col items-end">
                            <span className="text-stone-600 text-xs line-through">{fmtBRL(p.preco_original)}</span>
                            <span className="text-emerald-400 font-medium">{fmtBRL(p.preco_venda)}</span>
                          </div>
                        ) : (
                          <span className="text-stone-300 font-medium">{fmtBRL(p.preco_venda)}</span>
                        )}
                      </td>
```

- [ ] **Step 3: Testar manualmente**

Run: `cd ~/Desktop/ml-seller-app && npm run dev` (se não estiver rodando)
Abrir `/custos-produtos` logado na conta YUSO: confirmar que produtos com promoção ativa (ex: o item cujo SKU é `FV0012`, se ainda estiver em promoção) mostram valor riscado + valor em destaque; produtos sem promoção mostram só o valor normal, sem mudança visual. Confirmar que a coluna de identificação mostra o SKU (ex: `FV0012`) em vez do MLB pros produtos que têm SKU cadastrado no ML.

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/ml-seller-app
git add src/pages/CustosProdutos.jsx
git commit -m "feat: Custos de Produtos mostra preço promocional e SKU real do ML"
```

---

### Task 7: Frontend — preço promocional em Inventário

**Files:**
- Modify: `src/pages/Inventario.jsx:258-259`

**Interfaces:**
- Consumes: `item.preco_original` (float ou None) — novo campo do payload de `GET /api/inventario` (Task 5). `item.sku_interno` já reflete o SKU real da API quando presente (Task 5 já resolveu isso no backend — nenhuma mudança adicional necessária na coluna SKU do frontend).

- [ ] **Step 1: Testar manualmente antes de mexer (baseline)**

Run: `cd ~/Desktop/ml-seller-app && npm run dev` (se não estiver rodando)
Abrir `/inventario` logado, confirmar que a tela carrega normalmente hoje (preço único) antes da mudança.

- [ ] **Step 2: Implementar**

Em `src/pages/Inventario.jsx`, substituir a célula de preço (linha 259):

```jsx
                      <td className="px-4 py-3 text-right text-sky-400">{formatBRL(item.preco)}</td>
```

por:

```jsx
                      <td className="px-4 py-3 text-right">
                        {item.preco_original != null && item.preco_original > item.preco ? (
                          <div className="flex flex-col items-end">
                            <span className="text-stone-600 text-xs line-through">{formatBRL(item.preco_original)}</span>
                            <span className="text-sky-400 font-medium">{formatBRL(item.preco)}</span>
                          </div>
                        ) : (
                          <span className="text-sky-400">{formatBRL(item.preco)}</span>
                        )}
                      </td>
```

- [ ] **Step 3: Testar manualmente**

Run: `cd ~/Desktop/ml-seller-app && npm run dev` (se não estiver rodando)
Abrir `/inventario` logado na conta YUSO: confirmar que produtos com promoção ativa mostram valor riscado + valor em destaque; confirmar que a coluna SKU agora mostra o SKU real do ML pros pares que antes apareciam duplicados (ex: buscar por `FV0012` na busca da tela — deve aparecer só 1 linha, a de catálogo); confirmar que produtos sem promoção continuam mostrando só o valor normal.

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/ml-seller-app
git add src/pages/Inventario.jsx
git commit -m "feat: Inventário mostra preço promocional"
```

---

### Task 8: Verificação ao vivo

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Confirmar dedup com dados reais**

Na tela `/custos-produtos` e `/inventario` da conta YUSO em produção (ou local com credenciais reais), buscar por um dos SKUs conhecidos com duplicata (`FV0012`, `FV0009`, `1004`, `FV0019`, `FV0016`, `FV0017`, `FV0008`, `1367`, `1017`) e confirmar que aparece **uma linha só**, com o MLB do anúncio de catálogo.

- [ ] **Step 2: Confirmar preço promocional com dado real**

Buscar um produto com promoção ativa confirmada durante o brainstorming (ex: SKU associado ao MLB `MLB4525113153`, preço 44.99/original 99.99 — confirmar que a promoção ainda está ativa antes de usar como referência, promoções expiram) e confirmar visualmente o valor riscado + promocional na tela.

- [ ] **Step 3: Confirmar que os totais de Inventário mudaram como esperado**

Anotar `total_itens` e `custo_total_estoque` antes/depois do deploy (ou comparar com uma chamada direta à API antes vs depois) — confirmar que caíram (não subiram) refletindo a remoção de duplicatas, e que nenhum produto real sumiu da lista (visto por outro campo, ex: contagem total de SKUs únicos esperada).

- [ ] **Step 4: Rodar a suíte completa uma última vez**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/ -q`
Expected: mesma contagem de falhas pré-existentes documentada, nenhuma nova.

- [ ] **Step 5: Build do frontend**

Run: `cd ~/Desktop/ml-seller-app && npx vite build --outDir /tmp/dist-preco-promo-dedup-verify`
Expected: build limpo, sem erros.
