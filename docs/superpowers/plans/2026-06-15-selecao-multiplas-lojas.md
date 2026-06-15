# Seleção de Múltiplas Lojas com Soma — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a admin selecione várias lojas no topo e veja todas as telas de números com os valores somados, mantendo o layout atual.

**Architecture:** Caminho A (soma no backend). Um módulo `aggregation.py` faz fan-out paralelo das contas selecionadas reusando a lógica de uma conta já existente, e faz o merge devolvendo o payload no mesmo formato. O frontend só ganha um seletor múltiplo; as páginas de leitura não mudam de lógica.

**Tech Stack:** Backend Flask + pytest. Frontend React + Vite + React Query + vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-15-selecao-multiplas-lojas-design.md`

---

## Faseamento

Este plano entrega a **Fase 1**: a fatia vertical completa e demonstrável — base de
agregação + Dashboard somando + seletor múltiplo no frontend. Ao final, a admin já consegue
marcar várias lojas e ver o Dashboard somado de ponta a ponta.

A **Fase 2** (rollout para as outras ~13 rotas) está descrita como receita + tabela de
regras de merge por rota no final do documento. Cada rota da Fase 2 reusa exatamente o
padrão das Tasks 4–5 e vira um plano próprio (curto) seguindo a receita.

## File Structure (Fase 1)

**Backend (`ml-seller-api`):**
- Create `aggregation.py` — `parse_contas`, `fan_out`, `merge_by_key` (primitivas reutilizáveis).
- Create `tests/test_aggregation.py` — testes unitários das primitivas.
- Modify `routes/dashboard.py` — extrair `fetch_dashboard(conta, periodo, de, ate)` (uma conta, puro) + `merge_dashboard(payloads)`; handler usa `aggregation`.
- Modify `tests/test_dashboard.py` — teste multi-conta + retrocompatibilidade.

**Frontend (`ml-seller-app`):**
- Modify `src/context/AuthContext.jsx` — `activeAccounts` (array, fonte de verdade), `activeAccount` (derivado = join), `editAccount` (loja única).
- Create `src/components/StoreMultiSelect.jsx` — dropdown com checkboxes + "Todas".
- Modify `src/components/Header.jsx` — usar `StoreMultiSelect`.
- Create `src/components/LojasIndisponiveisAviso.jsx` — aviso de falha parcial.
- Modify `src/pages/Dashboard.jsx` — renderizar o aviso quando `lojas_indisponiveis` vier na resposta.

---

## Task 1: `parse_contas` — resolver lista de contas + permissões

**Files:**
- Create: `aggregation.py`
- Test: `tests/test_aggregation.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_aggregation.py
import aggregation


class _G:
    """Stub do flask.g.user."""
    def __init__(self, role, conta_ml):
        self.user = {"role": role, "conta_ml": conta_ml}


class _Req:
    def __init__(self, conta_ml=None):
        self.args = {"conta_ml": conta_ml} if conta_ml is not None else {}
        # emula request.args.get
    def _get(self, k, default=None):
        return self.args.get(k, default)


def _req(conta_ml=None):
    r = _Req(conta_ml)
    r.args = type("A", (), {"get": lambda self, k, d=None: ({"conta_ml": conta_ml}).get(k, d)})()
    return r


def test_admin_lista_separada_por_virgula():
    contas = aggregation.parse_contas(_req("YUSO,M12,J12"), _G("admin", "YUSO"))
    assert contas == ["YUSO", "M12", "J12"]


def test_admin_dedup_preserva_ordem():
    contas = aggregation.parse_contas(_req("YUSO,M12,YUSO"), _G("admin", "YUSO"))
    assert contas == ["YUSO", "M12"]


def test_nao_admin_travado_na_propria_conta():
    contas = aggregation.parse_contas(_req("YUSO,M12"), _G("user", "J12"))
    assert contas == ["J12"]


def test_sem_param_usa_conta_do_usuario():
    contas = aggregation.parse_contas(_req(None), _G("admin", "YUSO"))
    assert contas == ["YUSO"]
```

> Nota: `parse_contas` recebe `(request, g_user_holder)` onde o segundo arg expõe `.user`.
> No handler real passa-se o `g` do flask. Mantemos a assinatura testável injetando `g`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ml-seller-api && python3 -m pytest tests/test_aggregation.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'aggregation'`

- [ ] **Step 3: Write minimal implementation**

```python
# aggregation.py
"""Camada de agregação multi-conta: fan-out paralelo + merge.

Permite que rotas de leitura recebam várias contas (conta_ml=YUSO,M12) e
devolvam os dados somados no mesmo formato de uma conta só.
"""
from concurrent.futures import ThreadPoolExecutor


def parse_contas(request, g):
    """Resolve a lista de contas a partir do request + permissões do usuário.

    - `conta_ml` pode ser lista separada por vírgula: 'YUSO,M12'.
    - Sempre retorna >=1 conta (ou [] se o usuário não tem conta).
    - Não-admin é sempre travado na própria conta.
    """
    raw = request.args.get("conta_ml") or ""
    pedidas = [c.strip() for c in raw.split(",") if c.strip()]
    user_conta = (g.user or {}).get("conta_ml")
    if (g.user or {}).get("role") != "admin":
        return [user_conta] if user_conta else []
    if not pedidas:
        return [user_conta] if user_conta else []
    seen, out = set(), []
    for c in pedidas:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ml-seller-api && python3 -m pytest tests/test_aggregation.py -q`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
cd ml-seller-api
git add aggregation.py tests/test_aggregation.py
git commit -m "feat(agg): parse_contas resolve lista de contas multi-tenant"
```

---

## Task 2: `fan_out` — busca paralela com falha parcial

**Files:**
- Modify: `aggregation.py`
- Test: `tests/test_aggregation.py`

- [ ] **Step 1: Write the failing test**

```python
# adicionar em tests/test_aggregation.py

def test_fan_out_uma_conta_ok():
    payloads, falhas = aggregation.fan_out(["YUSO"], lambda c: {"conta": c, "v": 10})
    assert payloads == [{"conta": "YUSO", "v": 10}]
    assert falhas == []


def test_fan_out_varias_contas_soma_disponivel():
    payloads, falhas = aggregation.fan_out(["YUSO", "M12"], lambda c: {"conta": c})
    assert {p["conta"] for p in payloads} == {"YUSO", "M12"}
    assert falhas == []


def test_fan_out_falha_parcial_nao_derruba_as_outras():
    def fetch(c):
        if c == "LOCITECH":
            raise RuntimeError("token expirado")
        return {"conta": c}
    payloads, falhas = aggregation.fan_out(["YUSO", "LOCITECH"], fetch)
    assert {p["conta"] for p in payloads} == {"YUSO"}
    assert falhas == ["LOCITECH"]


def test_fan_out_uma_conta_que_falha():
    payloads, falhas = aggregation.fan_out(["YUSO"], lambda c: (_ for _ in ()).throw(ValueError()))
    assert payloads == []
    assert falhas == ["YUSO"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ml-seller-api && python3 -m pytest tests/test_aggregation.py -k fan_out -q`
Expected: FAIL — `AttributeError: module 'aggregation' has no attribute 'fan_out'`

- [ ] **Step 3: Write minimal implementation**

```python
# adicionar em aggregation.py

def fan_out(contas, fetch_fn):
    """Executa fetch_fn(conta) para cada conta em paralelo.

    Retorna (payloads_ok, lojas_indisponiveis). Uma exceção numa conta
    NÃO derruba as demais. NUNCA propaga exceção.
    """
    if len(contas) == 1:
        try:
            return [fetch_fn(contas[0])], []
        except Exception:
            return [], [contas[0]]
    payloads, falhas = [], []
    with ThreadPoolExecutor(max_workers=len(contas)) as pool:
        futures = {pool.submit(fetch_fn, c): c for c in contas}
        for fut, conta in futures.items():
            try:
                payloads.append(fut.result())
            except Exception:
                falhas.append(conta)
    return payloads, falhas
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ml-seller-api && python3 -m pytest tests/test_aggregation.py -k fan_out -q`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
cd ml-seller-api
git add aggregation.py tests/test_aggregation.py
git commit -m "feat(agg): fan_out paralelo com tolerância a falha parcial"
```

---

## Task 3: `merge_by_key` — juntar listas somando por chave

**Files:**
- Modify: `aggregation.py`
- Test: `tests/test_aggregation.py`

Usado tanto para série temporal (chave `data`) quanto para tabela de produtos (chave
`ml_item_id`).

- [ ] **Step 1: Write the failing test**

```python
# adicionar em tests/test_aggregation.py

def test_merge_by_key_serie_temporal():
    a = [{"data": "2026-06-01", "faturamento": 100, "liquido": 80}]
    b = [{"data": "2026-06-01", "faturamento": 50, "liquido": 40},
         {"data": "2026-06-02", "faturamento": 30, "liquido": 20}]
    out = aggregation.merge_by_key([a, b], "data", ["faturamento", "liquido"])
    assert out == [
        {"data": "2026-06-01", "faturamento": 150, "liquido": 120},
        {"data": "2026-06-02", "faturamento": 30, "liquido": 20},
    ]


def test_merge_by_key_produtos_preserva_titulo():
    a = [{"ml_item_id": "MLB1", "titulo": "Cabo", "unidades": 2, "total_faturado": 20.0}]
    b = [{"ml_item_id": "MLB1", "titulo": "Cabo", "unidades": 3, "total_faturado": 30.0}]
    out = aggregation.merge_by_key(
        [a, b], "ml_item_id", ["unidades", "total_faturado"], keep_keys=["titulo"]
    )
    assert out == [{"ml_item_id": "MLB1", "titulo": "Cabo", "unidades": 5, "total_faturado": 50.0}]


def test_merge_by_key_trata_none_como_zero():
    a = [{"ml_item_id": "MLB1", "unidades": None}]
    b = [{"ml_item_id": "MLB1", "unidades": 4}]
    out = aggregation.merge_by_key([a, b], "ml_item_id", ["unidades"])
    assert out[0]["unidades"] == 4
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ml-seller-api && python3 -m pytest tests/test_aggregation.py -k merge_by_key -q`
Expected: FAIL — `AttributeError: module 'aggregation' has no attribute 'merge_by_key'`

- [ ] **Step 3: Write minimal implementation**

```python
# adicionar em aggregation.py

def merge_by_key(lists, key, sum_keys, keep_keys=()):
    """Junta várias listas de dicts por `key`, somando `sum_keys`.

    keep_keys: campos não-numéricos preservados (primeiro valor não-vazio).
    Mantém a ordem de primeira aparição.
    """
    acc, order = {}, []
    for lst in (lists or []):
        for row in (lst or []):
            k = row.get(key)
            if k not in acc:
                acc[k] = {key: k}
                for kk in keep_keys:
                    acc[k][kk] = row.get(kk)
                for sk in sum_keys:
                    acc[k][sk] = 0
                order.append(k)
            for sk in sum_keys:
                acc[k][sk] += row.get(sk) or 0
            for kk in keep_keys:
                if not acc[k].get(kk) and row.get(kk):
                    acc[k][kk] = row.get(kk)
    return [acc[k] for k in order]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ml-seller-api && python3 -m pytest tests/test_aggregation.py -k merge_by_key -q`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
cd ml-seller-api
git add aggregation.py tests/test_aggregation.py
git commit -m "feat(agg): merge_by_key para series e tabelas de produto"
```

---

## Task 4: Extrair `fetch_dashboard` (uma conta, sem mudar comportamento)

**Files:**
- Modify: `routes/dashboard.py:222-518`
- Test: `tests/test_dashboard.py`

Refatoração pura: mover o corpo da view `dashboard()` para
`fetch_dashboard(conta_ml, periodo, de, ate) -> dict` (retorna o dict que hoje vai pro
`jsonify`). O handler passa a chamar essa função. Sem mudança de comportamento — o teste
existente do dashboard deve continuar passando.

Mudanças-chave:
1. `fetch_dashboard` recebe `conta_ml` já resolvido (não lê `request`).
2. O `try/except` interno que hoje faz `return jsonify({"erro": ...}), 502` vira `raise`
   (a função interna sinaliza falha via exceção; quem traduz para HTTP é o handler).
3. Além dos campos atuais, `fetch_dashboard` inclui um bloco interno `_merge` com os
   componentes aditivos brutos (atual e anterior) necessários para recomputar KPIs/variações
   no merge. O handler remove `_merge` antes de devolver.

- [ ] **Step 1: Escrever o teste de retrocompatibilidade (deve continuar passando após refactor)**

```python
# adicionar em tests/test_dashboard.py — usa o mesmo padrão de mocks já existente no arquivo
def test_fetch_dashboard_inclui_bloco_merge(monkeypatch):
    """fetch_dashboard devolve os campos de hoje + bloco interno _merge."""
    import routes.dashboard as d

    # Stub das dependências externas para isolar a montagem do payload.
    monkeypatch.setattr(d.ml_client, "renovar_token", lambda c: ("tok", "uid"))
    monkeypatch.setattr(d.ml_client, "periodo_para_datas",
                        lambda *a, **k: (__import__("datetime").date(2026, 6, 1),
                                         __import__("datetime").date(2026, 6, 7)))
    monkeypatch.setattr(d.db_queries, "get_dashboard_data_if_synced",
                        lambda *a, **k: (True, [], [], {}, 0.0, [(None, 0.0)], {}))
    monkeypatch.setattr(d.ml_client, "buscar_ads_por_item", lambda *a, **k: {})

    out = d.fetch_dashboard("YUSO", "7d", None, None)
    assert "kpis" in out and "grafico" in out and "top_produtos" in out
    assert "_merge" in out
    assert "atual" in out["_merge"] and "anterior" in out["_merge"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ml-seller-api && python3 -m pytest tests/test_dashboard.py -k fetch_dashboard -q`
Expected: FAIL — `AttributeError: module 'routes.dashboard' has no attribute 'fetch_dashboard'`

- [ ] **Step 3: Refatorar `routes/dashboard.py`**

Transformar a view em duas partes. O corpo atual (linhas ~225–514) move para `fetch_dashboard`;
as falhas internas viram `raise`; adiciona-se o bloco `_merge` no `return`.

```python
def fetch_dashboard(conta_ml, periodo, de, ate):
    """Monta o payload do dashboard para UMA conta. Levanta exceção em falha
    de dependência externa (token/ML API) — o handler traduz para HTTP."""
    date_from, date_to = ml_client.periodo_para_datas(periodo, de, ate)
    n_dias = (date_to - date_from).days
    prev_fim = date_from - timedelta(days=1)
    prev_inicio = prev_fim - timedelta(days=n_dias)

    # ... (todo o corpo atual entre 'token, user_id = ml_client.renovar_token...'
    #      e o cálculo de 'top_produtos', SEM alterações de lógica) ...
    # IMPORTANTE: o 'except Exception as e: return jsonify({"erro": str(e)}), 502'
    # interno vira simplesmente 'raise' para o fan_out capturar.

    payload = {
        "periodo": {
            "inicio": date_from.strftime("%d/%m/%Y"),
            "fim": date_to.strftime("%d/%m/%Y"),
        },
        "kpis": kpis,
        "grafico": grafico,
        "top_produtos": top_produtos[:15],
        "atualizado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y às %H:%M"),
        # Bloco interno para o merge multi-conta — removido pelo handler.
        "_merge": {
            "atual": {
                "faturamento": atual["faturamento"],
                "liquido_marketplace": atual["liquido_marketplace"],
                "lucro_bruto": atual["lucro_bruto"],
                "n_vendas": atual["n_vendas"],
                "unidades": atual["unidades"],
                "cmv_total": atual["cmv_total"],
                "reclamacoes": len(reclamacoes),
                "valor_ads": valor_ads,
                "lucro_pos_ads": lucro_pos_ads,
            },
            "anterior": {
                "faturamento": anterior["faturamento"],
                "lucro_bruto": anterior["lucro_bruto"],
                "n_vendas": anterior["n_vendas"],
                "ticket_medio": anterior["ticket_medio"],
            },
        },
    }
    return payload


@dashboard_bp.route("/api/dashboard")
@jwt_required
def dashboard():
    contas = aggregation.parse_contas(request, g)
    if not contas:
        return jsonify({"erro": "Usuário sem conta_ml"}), 400
    periodo = request.args.get("periodo", "7d")
    de = request.args.get("de")
    ate = request.args.get("ate")
    payloads, falhas = aggregation.fan_out(
        contas, lambda c: fetch_dashboard(c, periodo, de, ate)
    )
    if not payloads:
        return jsonify({"erro": "Nenhuma loja disponível no momento",
                        "lojas_indisponiveis": falhas}), 424
    resp = merge_dashboard(payloads) if len(payloads) > 1 else payloads[0]
    resp.pop("_merge", None)
    if falhas:
        resp["lojas_indisponiveis"] = falhas
    return jsonify(resp)
```

Adicionar no topo de `routes/dashboard.py`: `import aggregation`.
`merge_dashboard` é implementada na Task 5 — para esta task, defina um stub temporário
`def merge_dashboard(payloads): return payloads[0]` logo abaixo de `fetch_dashboard` para o
código importar (será substituído na Task 5).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ml-seller-api && python3 -m pytest tests/test_dashboard.py -q`
Expected: PASS — o novo teste passa e os testes existentes do dashboard continuam verdes.

- [ ] **Step 5: Commit**

```bash
cd ml-seller-api
git add routes/dashboard.py tests/test_dashboard.py
git commit -m "refactor(dashboard): extrair fetch_dashboard (uma conta) + bloco _merge"
```

---

## Task 5: `merge_dashboard` — somar várias lojas no Dashboard

**Files:**
- Modify: `routes/dashboard.py`
- Test: `tests/test_dashboard.py`

- [ ] **Step 1: Write the failing test**

```python
# adicionar em tests/test_dashboard.py
def test_merge_dashboard_soma_kpis_e_recalcula_medias():
    import routes.dashboard as d
    p1 = {
        "periodo": {"inicio": "01/06/2026", "fim": "07/06/2026"},
        "kpis": {}, "grafico": [{"data": "2026-06-01", "faturamento": 100, "liquido": 80}],
        "top_produtos": [{"ml_item_id": "MLB1", "titulo": "Cabo", "unidades": 2,
                          "total_faturado": 100.0, "lucro": 30.0, "custo_ads": 5.0,
                          "lucro_pos_ads": 25.0, "custo_unitario": 10.0}],
        "atualizado_em": "x",
        "_merge": {"atual": {"faturamento": 100, "liquido_marketplace": 80, "lucro_bruto": 30,
                             "n_vendas": 2, "unidades": 2, "cmv_total": 20, "reclamacoes": 0,
                             "valor_ads": 5, "lucro_pos_ads": 25},
                   "anterior": {"faturamento": 50, "lucro_bruto": 10, "n_vendas": 1,
                                "ticket_medio": 50}},
    }
    p2 = {
        "periodo": {"inicio": "01/06/2026", "fim": "07/06/2026"},
        "kpis": {}, "grafico": [{"data": "2026-06-01", "faturamento": 50, "liquido": 40}],
        "top_produtos": [{"ml_item_id": "MLB1", "titulo": "Cabo", "unidades": 3,
                          "total_faturado": 200.0, "lucro": 60.0, "custo_ads": 5.0,
                          "lucro_pos_ads": 55.0, "custo_unitario": 10.0}],
        "atualizado_em": "y",
        "_merge": {"atual": {"faturamento": 200, "liquido_marketplace": 160, "lucro_bruto": 60,
                             "n_vendas": 3, "unidades": 3, "cmv_total": 40, "reclamacoes": 1,
                             "valor_ads": 5, "lucro_pos_ads": 55},
                   "anterior": {"faturamento": 50, "lucro_bruto": 10, "n_vendas": 1,
                                "ticket_medio": 50}},
    }
    out = d.merge_dashboard([p1, p2])
    assert out["kpis"]["faturamento"] == 300.0
    assert out["kpis"]["n_vendas"] == 5
    assert out["kpis"]["ticket_medio"] == 60.0          # 300/5, recalculado
    assert out["kpis"]["margem"] == 30.0                # 90/300*100, recalculado
    assert out["kpis"]["reclamacoes"] == 1
    # gráfico somado por dia
    assert out["grafico"][0] == {"data": "2026-06-01", "faturamento": 150, "liquido": 120}
    # produto MLB1 somado numa linha
    prod = out["top_produtos"][0]
    assert prod["unidades"] == 5 and prod["total_faturado"] == 300.0 and prod["lucro"] == 90.0
    assert prod["representatividade"] == 100.0          # único produto
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ml-seller-api && python3 -m pytest tests/test_dashboard.py -k merge_dashboard -q`
Expected: FAIL — o stub atual devolve `payloads[0]`, então os totais não batem.

- [ ] **Step 3: Implementar `merge_dashboard` (substitui o stub da Task 4)**

```python
import aggregation

def _variacao(a, b):
    if b == 0:
        return None
    return round(((a - b) / b) * 100, 1)

def merge_dashboard(payloads):
    """Soma o payload do dashboard de várias contas, recalculando médias/variações."""
    A = {k: sum((p["_merge"]["atual"].get(k) or 0) for p in payloads)
         for k in ["faturamento", "liquido_marketplace", "lucro_bruto", "n_vendas",
                   "unidades", "cmv_total", "reclamacoes", "valor_ads", "lucro_pos_ads"]}
    P = {k: sum((p["_merge"]["anterior"].get(k) or 0) for p in payloads)
         for k in ["faturamento", "lucro_bruto", "n_vendas"]}

    fat = A["faturamento"]
    ticket = (fat / A["n_vendas"]) if A["n_vendas"] else 0.0
    ticket_ant = (P["faturamento"] / P["n_vendas"]) if P["n_vendas"] else 0.0
    margem = (A["lucro_bruto"] / fat * 100) if fat else 0.0
    tacos = (A["valor_ads"] / fat * 100) if fat else 0.0
    mpa = (A["lucro_pos_ads"] / fat * 100) if fat else 0.0
    roi = (A["lucro_bruto"] / A["cmv_total"] * 100) if A["cmv_total"] else 0.0

    kpis = {
        "faturamento": round(fat, 2),
        "faturamento_variacao": _variacao(fat, P["faturamento"]),
        "liquido_marketplace": round(A["liquido_marketplace"], 2),
        "lucro_bruto": round(A["lucro_bruto"], 2),
        "lucro_variacao": _variacao(A["lucro_bruto"], P["lucro_bruto"]),
        "margem": round(margem, 2),
        "n_vendas": A["n_vendas"],
        "pedidos_variacao": _variacao(A["n_vendas"], P["n_vendas"]),
        "unidades": A["unidades"],
        "ticket_medio": round(ticket, 2),
        "ticket_variacao": _variacao(ticket, ticket_ant),
        "reclamacoes": A["reclamacoes"],
        "valor_ads": round(A["valor_ads"], 2),
        "tacos": round(tacos, 2),
        "lucro_pos_ads": round(A["lucro_pos_ads"], 2),
        "mpa": round(mpa, 2),
        "roi": round(roi, 2),
        "cmv": round(A["cmv_total"], 2),
    }

    grafico = aggregation.merge_by_key(
        [p["grafico"] for p in payloads], "data", ["faturamento", "liquido"]
    )
    grafico.sort(key=lambda r: r["data"])

    produtos = aggregation.merge_by_key(
        [p["top_produtos"] for p in payloads], "ml_item_id",
        ["unidades", "total_faturado", "lucro", "custo_ads", "lucro_pos_ads"],
        keep_keys=["titulo", "custo_unitario"],
    )
    for prod in produtos:
        tf = prod["total_faturado"]
        prod["preco_medio"] = round(tf / prod["unidades"], 2) if prod["unidades"] else 0.0
        prod["representatividade"] = round(tf / fat * 100, 2) if fat else 0.0
        prod["margem"] = round(prod["lucro"] / tf * 100, 2) if tf else 0.0
        prod["mpa"] = round(prod["lucro_pos_ads"] / tf * 100, 2) if tf else 0.0
        prod["lucro"] = round(prod["lucro"], 2)
        prod["total_faturado"] = round(tf, 2)
        prod["custo_ads"] = round(prod["custo_ads"], 2)
        prod["lucro_pos_ads"] = round(prod["lucro_pos_ads"], 2)
    produtos.sort(key=lambda x: x["total_faturado"], reverse=True)

    return {
        "periodo": payloads[0]["periodo"],
        "kpis": kpis,
        "grafico": grafico,
        "top_produtos": produtos[:15],
        "atualizado_em": payloads[0]["atualizado_em"],
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ml-seller-api && python3 -m pytest tests/test_dashboard.py tests/test_aggregation.py -q`
Expected: PASS (todos verdes)

- [ ] **Step 5: Commit**

```bash
cd ml-seller-api
git add routes/dashboard.py tests/test_dashboard.py
git commit -m "feat(dashboard): merge_dashboard soma multiplas lojas com medias recalculadas"
```

---

## Task 6: `AuthContext` — `activeAccounts` / `editAccount`

**Files:**
- Modify: `src/context/AuthContext.jsx`
- Test: `src/context/AuthContext.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// adicionar em src/context/AuthContext.test.jsx
// (reusa os mocks de supabase/api já presentes no topo do arquivo)
import { render, screen, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

function MultiProbe() {
  const { activeAccounts, activeAccount, editAccount, setActiveAccounts } = useAuth()
  return (
    <div>
      <span data-testid="accounts">{JSON.stringify(activeAccounts)}</span>
      <span data-testid="joined">{activeAccount}</span>
      <span data-testid="edit">{editAccount}</span>
      <button onClick={() => setActiveAccounts(['YUSO', 'M12'])}>multi</button>
    </div>
  )
}

it('activeAccount é a junção das contas e editAccount é a primeira', async () => {
  render(<AuthProvider><MultiProbe /></AuthProvider>)
  await act(async () => {})
  const btn = screen.getByText('multi')
  await act(async () => { btn.click() })
  expect(screen.getByTestId('accounts').textContent).toBe('["YUSO","M12"]')
  expect(screen.getByTestId('joined').textContent).toBe('YUSO,M12')
  expect(screen.getByTestId('edit').textContent).toBe('YUSO')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ml-seller-app && npm test -- src/context/AuthContext.test.jsx`
Expected: FAIL — `activeAccounts`/`editAccount` indefinidos.

- [ ] **Step 3: Implementar no `AuthContext.jsx`**

Trocar o estado `activeAccount` (string) por `activeAccounts` (array) e derivar os demais.

```jsx
// estado
const [activeAccounts, setActiveAccounts] = useState([])

// nos dois pontos que hoje fazem setActiveAccount(meta.conta_ml || null):
setActiveAccounts(meta.conta_ml ? [meta.conta_ml] : [])
// no logout / sessão nula:
setActiveAccounts([])

// derivados (antes do return do provider)
const activeAccount = activeAccounts.join(',')      // p/ páginas de leitura (retrocompatível)
const editAccount = activeAccounts[0] || null       // p/ telas de cadastro/edição

// no value do Provider, expor:
//   activeAccounts, setActiveAccounts, activeAccount, editAccount
// (manter setActiveAccount como atalho de 1 conta p/ não quebrar chamadas existentes:)
const setActiveAccount = (c) => setActiveAccounts(c ? [c] : [])
```

Garantir que o `value={{...}}` inclua: `activeAccounts, setActiveAccounts, activeAccount,
editAccount, setActiveAccount`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ml-seller-app && npm test -- src/context/AuthContext.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ml-seller-app
git add src/context/AuthContext.jsx src/context/AuthContext.test.jsx
git commit -m "feat(auth): activeAccounts (multi) + editAccount derivados"
```

---

## Task 7: `StoreMultiSelect` + integrar no `Header`

**Files:**
- Create: `src/components/StoreMultiSelect.jsx`
- Create: `src/components/StoreMultiSelect.test.jsx`
- Modify: `src/components/Header.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/StoreMultiSelect.test.jsx
import { render, screen, fireEvent } from '@testing-library/react'
import StoreMultiSelect from './StoreMultiSelect'

const CONTAS = ['YUSO', 'LOCITECH', 'J12', 'M12']

it('marca e desmarca lojas chamando onChange', () => {
  const onChange = vi.fn()
  render(<StoreMultiSelect contas={CONTAS} selecionadas={['YUSO']} onChange={onChange} />)
  fireEvent.click(screen.getByText(/YUSO/))           // abre o dropdown
  fireEvent.click(screen.getByLabelText('M12'))       // marca M12
  expect(onChange).toHaveBeenCalledWith(['YUSO', 'M12'])
})

it('botão Todas seleciona todas as lojas', () => {
  const onChange = vi.fn()
  render(<StoreMultiSelect contas={CONTAS} selecionadas={['YUSO']} onChange={onChange} />)
  fireEvent.click(screen.getByText(/YUSO/))
  fireEvent.click(screen.getByLabelText('Todas'))
  expect(onChange).toHaveBeenCalledWith(CONTAS)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ml-seller-app && npm test -- src/components/StoreMultiSelect.test.jsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementar o componente**

```jsx
// src/components/StoreMultiSelect.jsx
import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export default function StoreMultiSelect({ contas, selecionadas, onChange }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const todas = selecionadas.length === contas.length
  const resumo = selecionadas.length === 0 ? 'Selecione'
    : todas ? `Todas (${contas.length})`
    : selecionadas.length === 1 ? selecionadas[0]
    : `${selecionadas[0]} +${selecionadas.length - 1}`

  function toggle(conta) {
    const set = new Set(selecionadas)
    set.has(conta) ? set.delete(conta) : set.add(conta)
    // mantém a ordem canônica de `contas`
    onChange(contas.filter(c => set.has(c)))
  }

  function toggleTodas() {
    onChange(todas ? selecionadas.slice(0, 1) : contas)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        className="flex items-center gap-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        {resumo}
        <ChevronDown size={12} />
      </button>
      {aberto && (
        <div className="absolute z-20 mt-1 min-w-[140px] rounded-lg border border-white/[0.08] bg-[#0d0d0f] p-1 shadow-xl">
          <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-stone-300 hover:bg-white/[0.05] rounded cursor-pointer">
            <input type="checkbox" aria-label="Todas" checked={todas} onChange={toggleTodas} />
            <span className="font-medium">Todas</span>
          </label>
          <div className="my-1 h-px bg-white/[0.06]" />
          {contas.map(c => (
            <label key={c} className="flex items-center gap-2 px-2 py-1.5 text-xs text-stone-300 hover:bg-white/[0.05] rounded cursor-pointer">
              <input
                type="checkbox"
                aria-label={c}
                checked={selecionadas.includes(c)}
                onChange={() => toggle(c)}
              />
              <span>{c}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Integrar no `Header.jsx` e rodar testes**

Substituir o `<select>` (linhas 22–32) por:

```jsx
import StoreMultiSelect from './StoreMultiSelect'
const CONTAS = ['YUSO', 'LOCITECH', 'J12', 'M12']

// dentro do componente:
const { role, activeAccounts, setActiveAccounts } = useAuth()
// ...
{role === 'admin' && (
  <StoreMultiSelect
    contas={CONTAS}
    selecionadas={activeAccounts}
    onChange={setActiveAccounts}
  />
)}
```

Run: `cd ml-seller-app && npm test -- src/components/StoreMultiSelect.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ml-seller-app
git add src/components/StoreMultiSelect.jsx src/components/StoreMultiSelect.test.jsx src/components/Header.jsx
git commit -m "feat(header): seletor multiplo de lojas com checkboxes + Todas"
```

---

## Task 8: Aviso de loja indisponível no Dashboard

**Files:**
- Create: `src/components/LojasIndisponiveisAviso.jsx`
- Modify: `src/pages/Dashboard.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// src/components/LojasIndisponiveisAviso.test.jsx
import { render, screen } from '@testing-library/react'
import LojasIndisponiveisAviso from './LojasIndisponiveisAviso'

it('não renderiza nada quando lista vazia', () => {
  const { container } = render(<LojasIndisponiveisAviso lojas={[]} />)
  expect(container.firstChild).toBeNull()
})

it('lista as lojas indisponíveis', () => {
  render(<LojasIndisponiveisAviso lojas={['LOCITECH', 'J12']} />)
  expect(screen.getByText(/LOCITECH/)).toBeInTheDocument()
  expect(screen.getByText(/J12/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ml-seller-app && npm test -- src/components/LojasIndisponiveisAviso.test.jsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementar o componente**

```jsx
// src/components/LojasIndisponiveisAviso.jsx
import { AlertTriangle } from 'lucide-react'

export default function LojasIndisponiveisAviso({ lojas }) {
  if (!lojas || lojas.length === 0) return null
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
      <AlertTriangle size={14} />
      <span>
        {lojas.length === 1 ? 'Loja indisponível' : 'Lojas indisponíveis'} no momento:{' '}
        <strong>{lojas.join(', ')}</strong>. Os totais mostram apenas as lojas disponíveis.
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Renderizar no `Dashboard.jsx` e rodar testes**

No `Dashboard.jsx`, após obter `data` da query, renderizar o aviso no topo do conteúdo:

```jsx
import LojasIndisponiveisAviso from '../components/LojasIndisponiveisAviso'
// ...
<LojasIndisponiveisAviso lojas={data?.lojas_indisponiveis} />
```

Run: `cd ml-seller-app && npm test -- src/components/LojasIndisponiveisAviso.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ml-seller-app
git add src/components/LojasIndisponiveisAviso.jsx src/components/LojasIndisponiveisAviso.test.jsx src/pages/Dashboard.jsx
git commit -m "feat(dashboard): aviso de loja indisponivel na falha parcial"
```

---

## Task 9: Verificação ponta a ponta (manual)

**Files:** nenhum (smoke test).

- [ ] **Step 1: Backend — suíte completa**

Run: `cd ml-seller-api && python3 -m pytest tests/ -q`
Expected: sem novas falhas (os 401 de auth pré-existentes podem continuar — ver CLAUDE.md).

- [ ] **Step 2: Frontend — suíte completa + build**

Run: `cd ml-seller-app && npm test && npm run build`
Expected: testes verdes e build sem erros.

- [ ] **Step 3: Smoke local**

Subir backend e frontend localmente; logar como admin; marcar 2 lojas no seletor;
confirmar no Dashboard que faturamento/pedidos somam e que ticket/margem fazem sentido;
desmarcar para 1 loja e confirmar que volta ao valor individual.

- [ ] **Step 4: Commit (se houver ajustes do smoke)**

```bash
git add -A && git commit -m "fix: ajustes do smoke test multi-loja no dashboard"
```

---

# Fase 2 — Rollout para as demais rotas (receita)

Cada rota de leitura segue o **mesmo padrão das Tasks 4–5**:

1. Extrair `fetch_<rota>(conta_ml, ...params) -> dict` (uma conta; falha vira `raise`).
2. Acrescentar bloco interno `_merge` com os componentes aditivos necessários para
   recomputar médias/variações (quando a rota tiver médias/variações).
3. Escrever `merge_<rota>(payloads)` aplicando a regra da tabela abaixo.
4. Handler: `parse_contas` → `fan_out` → `merge` (se >1) → `pop _merge` → anexar
   `lojas_indisponiveis`.
5. TDD: teste de retrocompatibilidade (1 conta) + teste de soma (2 contas) + médias
   recalculadas.
6. Frontend: nenhuma mudança de lógica (já manda `conta_ml: activeAccount`); só renderizar
   `<LojasIndisponiveisAviso lojas={data?.lojas_indisponiveis} />`.

### Tabela de regras de merge por rota

| Rota | Soma (aditivos) | Recalcular (derivados) | Listas (merge_by_key) |
|------|-----------------|------------------------|------------------------|
| `/api/vendas` | totais de vendas/qtd | ticket médio, % | linha de venda por `ml_item_id` (ou concat por pedido) |
| `/api/resultado` | faturamento, custos, lucro, ads | margem, MPA, TACOS, ROI | produtos por `ml_item_id` |
| `/api/margem` | — | margem por produto | produtos por `ml_item_id` (somar qtd/faturado, recalc. margem) |
| `/api/pedidos` (lista) | — | — | **concatenar** pedidos + campo `loja`; ordenar por data |
| `/api/graficos` | séries | — | por `data` (cada série somada) |
| `/api/analitico/produtos` | unidades, faturado | margem/representatividade | por `ml_item_id` |
| `/api/analitico/vendas-por-anuncio` | unidades, faturado | — | por `ml_item_id`/anúncio |
| `/api/curva-abc` | faturado por produto | classe A/B/C **recalculada** sobre o total somado | por `ml_item_id`, depois reclassificar |
| `/api/inventario/full` | estoque/saldo | — | por `ml_item_id` (concat; mesmo item em 2 lojas = somar saldos) |
| `/api/gerenciamento/anuncios` (GET) | — | — | concatenar anúncios + campo `loja` |
| `/api/ranqueamento` | — | médias de métricas | concatenar + `loja` |
| `/api/reposicao/semanal` | necessidade/saldo | média semanal por produto | por `ml_item_id` |
| `/api/ads/campanhas` | gasto/cliques/vendas | ACOS/ROAS recalculados | campanhas concatenadas + `loja` |
| `/api/financeiro` + `/resumo` (+anual) | entradas/saídas/saldos | — | por categoria/mês |
| `/api/financeiro/conciliacao` | valores | — | concatenar lançamentos + `loja` |
| `/api/financeiro/projecao` | projeções | — | por data |
| `/api/custos` (GET lista) | — | — | por `ml_item_id` (concat; custo é por loja → manter `loja`) |

### Telas de escrita/cadastro (Fase 2 — banner, NÃO somam)

`custos` (save), `movimentacoes`, `fechamento`, `configuracoes`, `estudio`,
`gerenciamento` (PUT), `ads_manual`, `reposicao` (PUT), `ranqueamento` (POST),
`sync`, `importacao`:

- Frontend: trocar `conta_ml: activeAccount` por `conta_ml: editAccount` nas chamadas de
  **escrita**; renderizar `<EditAccountBanner>` (criar componente: mostra
  "Editando: [loja ▾]" com as lojas marcadas; troca `editAccount`).
- `PedidoDetalhe`: usar a `loja` da linha de origem (vinda da lista combinada) em vez de
  `activeAccount`.

Cada item acima vira um plano curto próprio reusando este documento como referência.

---

## Self-Review (coberto)

- **Cobertura da spec:** seletor múltiplo (Tasks 6–7), soma no backend (Tasks 1–5, +
  receita Fase 2), padrão "abre em 1 loja" (Task 6: init `[meta.conta_ml]`), médias
  recalculadas (Task 5), falha parcial + aviso (Tasks 2, 8), banner de edição (Fase 2),
  testes (todas as tasks). ✔
- **Sem placeholders:** todo passo de código tem o código real. ✔
- **Consistência de tipos:** `parse_contas(request, g)`, `fan_out(contas, fetch_fn) ->
  (payloads, falhas)`, `merge_by_key(lists, key, sum_keys, keep_keys)`,
  `fetch_dashboard(conta_ml, periodo, de, ate)`, `merge_dashboard(payloads)` —
  nomes batem entre tasks. ✔
