# Evidência Real no Estúdio IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alimentar a geração de persona do Estúdio IA com perguntas e avaliações reais de compradores (texto, via API oficial do Mercado Livre) dos 5 anúncios mais vendidos, em vez de só números agregados, e citar essa evidência no resultado final.

**Architecture:** Duas novas funções de busca em `routes/estudio.py` (perguntas via `/questions/search`, avaliações com texto via extensão da chamada `/reviews/item/{id}` já existente) coletadas em paralelo para os top 5 produtos; o resultado é salvo junto do estudo (nova coluna `evidencia` jsonb) e injetado no prompt de `services/estudio_ia_service.py::montar_prompt_bloco`, que hoje só recebe números agregados. A rota `gerar_conteudo()` (o fluxo real usado pelo frontend — **não** a rota SSE `/api/estudio/gerar`, que está morta/não é chamada pelo `EstudioIA.jsx` atual) passa a ler a evidência do estudo salvo e citar a contagem real no campo `justificativa` da persona.

**Tech Stack:** Flask, psycopg2 (jsonb), API REST do Mercado Livre (`/questions/search`, `/reviews/item/{id}`), OpenAI (já integrado, sem mudança de modelo).

## Global Constraints

- Coleta de evidência só para os **top 5 produtos** (por ordem em que já vêm — a lista já é "mais vendidos"), nunca os 15 completos.
- Fontes: só `/questions/search` e `/reviews/item/{id}` (API oficial, já autenticada com o token da conta). Reclame Aqui, redes sociais e Google Trends **não** entram nesta rodada.
- Coleta é best-effort e paralela (mesmo padrão de `_enriquecer_produtos`): falha em um produto ou fonte não derruba a busca inteira, nem os outros produtos.
- Não pode reintroduzir o nome próprio "Cazonato" em nenhum prompt (`tests/test_estudio_ia.py::test_nome_proprio_removido_do_prompt` já garante isso pro prompt antigo — o texto novo desta feature deve respeitar a mesma regra, mesmo não sendo testado pelo mesmo teste).
- Sem mudança de UX/loading no frontend — o spinner "Analisando..." já existe e cobre o tempo extra.
- Citação de evidência ("baseado em N perguntas e M avaliações reais") é gerada pelo **código Python**, não pelo LLM — os números reais já são conhecidos antes de chamar a IA, então não há motivo pra confiar na IA pra reportar uma contagem que ela não vê diretamente.

---

### Task 1: Coluna `evidencia` em `estudos` + `save_estudo` aceita evidência

**Files:**
- Modify: `db.py` (nova função `_ensure_evidencia`, `save_estudo` ganha parâmetro `evidencia=None`)
- Test: `tests/test_db_estudos_evidencia.py`

**Interfaces:**
- Produces: `db.save_estudo(owner_user_id, conta_ml, entrada, conteudo_md, estruturado=None, mercado=None, evidencia=None)` — `evidencia` é um dict `{"perguntas": [...], "avaliacoes": [...], "produtos_cobertos": int}` ou `None`. Persistido na coluna `evidencia` (jsonb) da tabela `estudos`. `db.get_estudo(...)` já retorna a coluna automaticamente (usa `SELECT *`), sem precisar de mudança lá.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/test_db_estudos_evidencia.py`:

```python
"""Testes de persistência da evidência real (perguntas/avaliações) em estudos."""
import pytest
from unittest.mock import MagicMock, patch
import db


def test_save_estudo_persiste_evidencia(monkeypatch):
    captured = {}

    class FakeCursor:
        def __enter__(self):
            return self
        def __exit__(self, *a):
            pass
        def execute(self, sql, params):
            captured["sql"] = sql
            captured["params"] = params
        def fetchone(self):
            return {"id": "11111111-1111-1111-1111-111111111111"}

    class FakeConn:
        def cursor(self, cursor_factory=None):
            return FakeCursor()
        def commit(self):
            pass
        def close(self):
            pass

    monkeypatch.setattr(db, "get_conn", lambda: FakeConn())

    evidencia = {
        "perguntas": [{"pergunta": "Serve pra PC gamer?", "resposta": "Sim, é HDMI 2.1."}],
        "avaliacoes": [{"nota": 5, "texto": "Ótimo cabo, chegou rápido."}],
        "produtos_cobertos": 1,
    }
    entrada = {"termo": "cabo hdmi", "link": "", "tipos": ["busca"], "produtos_analisados": []}

    estudo_id = db.save_estudo("user-1", "YUSO", entrada, "conteudo md", evidencia=evidencia)

    assert estudo_id == "11111111-1111-1111-1111-111111111111"
    assert "evidencia" in captured["sql"]
    # evidencia é o último parâmetro posicional da query (depois de mercado)
    assert captured["params"][-1] is not None


def test_save_estudo_evidencia_none_nao_quebra(monkeypatch):
    class FakeCursor:
        def __enter__(self):
            return self
        def __exit__(self, *a):
            pass
        def execute(self, sql, params):
            pass
        def fetchone(self):
            return {"id": "22222222-2222-2222-2222-222222222222"}

    class FakeConn:
        def cursor(self, cursor_factory=None):
            return FakeCursor()
        def commit(self):
            pass
        def close(self):
            pass

    monkeypatch.setattr(db, "get_conn", lambda: FakeConn())
    entrada = {"termo": "cabo hdmi", "link": "", "tipos": ["busca"], "produtos_analisados": []}

    # sem evidencia (comportamento retrocompatível, evidencia=None por padrão)
    estudo_id = db.save_estudo("user-1", "YUSO", entrada, "conteudo md")
    assert estudo_id == "22222222-2222-2222-2222-222222222222"
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_db_estudos_evidencia.py -v`
Expected: `test_save_estudo_persiste_evidencia` FALHA com `TypeError: save_estudo() got an unexpected keyword argument 'evidencia'` (a função ainda não aceita esse parâmetro).

- [ ] **Step 3: Implementar**

Em `db.py`, logo depois de `_ensure_mercado` (por volta da linha 587), adicione:

```python
def _ensure_evidencia(conn):
    """Coluna evidencia (jsonb) em estudos — perguntas e avaliações reais
    coletadas dos top 5 produtos (ver routes/estudio.py::_coletar_evidencia_real).
    Criada on-the-fly (mesmo padrão de _ensure_conteudo_gerado/_ensure_mercado)."""
    with conn.cursor() as cur:
        cur.execute("ALTER TABLE estudos ADD COLUMN IF NOT EXISTS evidencia jsonb")
    conn.commit()
```

Depois, edite a assinatura e o corpo de `save_estudo` (linha 453) para:

```python
def save_estudo(owner_user_id, conta_ml, entrada, conteudo_md, estruturado=None, mercado=None, evidencia=None):
    """Persiste um estudo gerado pelo Estúdio IA e retorna o id (uuid str).

    entrada: dict com termo, link, tipos (list), produtos_analisados (list).
    conteudo_md: a narrativa longa em markdown (fonte de verdade).
    estruturado: dict opcional com persona, publico_alvo, palavras_chave,
                 titulos_sugeridos, dores, objecoes. Campos ausentes viram NULL/[].
    mercado: dict opcional com o raio-x real do ML (categoria, tendências,
             mais vendidos) — usado pelo workspace da análise.
    evidencia: dict opcional {"perguntas": [...], "avaliacoes": [...],
               "produtos_cobertos": int} — evidência real de compradores
               coletada dos top 5 produtos (ver routes/estudio.py).
    """
    e = estruturado or {}
    conn = get_conn()
    try:
        _ensure_mercado(conn)
        _ensure_evidencia(conn)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO estudos (
                    owner_user_id, conta_ml, termo, link, tipos, produtos_analisados,
                    conteudo_md, persona, publico_alvo,
                    palavras_chave, titulos_sugeridos, dores, objecoes, mercado, evidencia
                ) VALUES (
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s, %s
                )
                RETURNING id
            """, (
                owner_user_id,
                conta_ml,
                (entrada or {}).get("termo"),
                (entrada or {}).get("link"),
                Json((entrada or {}).get("tipos", [])),
                Json((entrada or {}).get("produtos_analisados", [])),
                conteudo_md,
                e.get("persona"),
                e.get("publico_alvo"),
                Json(e.get("palavras_chave", []) or []),
                Json(e.get("titulos_sugeridos", []) or []),
                Json(e.get("dores", []) or []),
                Json(e.get("objecoes", []) or []),
                Json(mercado) if mercado is not None else None,
                Json(evidencia) if evidencia is not None else None,
            ))
            row = cur.fetchone()
        conn.commit()
        return str(row["id"]) if row else None
    finally:
        conn.close()
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_db_estudos_evidencia.py -v`
Expected: `2 passed`

- [ ] **Step 5: Rodar a suíte completa pra garantir que nada quebrou**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/ -q`
Expected: mesma contagem de passed/failed de antes desta task (15 failed pré-existentes documentados, sem nenhuma falha nova).

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add db.py tests/test_db_estudos_evidencia.py
git commit -m "feat: coluna evidencia (jsonb) em estudos + save_estudo aceita evidência real"
```

---

### Task 2: Buscar perguntas e avaliações reais de um produto

**Files:**
- Modify: `routes/estudio.py` (novas funções `_buscar_perguntas_produto`, `_buscar_avaliacoes_texto_produto`)
- Test: `tests/test_estudio_evidencia.py`

**Interfaces:**
- Consumes: `_ml_get(url, token, params=None)` já existente em `routes/estudio.py` (linha ~35), `ML_BASE` (constante já existente).
- Produces:
  - `_buscar_perguntas_produto(item_id, token, limit=20)` → `list[dict]`, cada item `{"pergunta": str, "resposta": str | None}`. Retorna `[]` em qualquer falha (nunca levanta exceção).
  - `_buscar_avaliacoes_texto_produto(item_id, token, limit=30)` → `list[dict]`, cada item `{"nota": int | None, "texto": str}` — só avaliações que **têm** texto (`content`); avaliações só-com-nota são descartadas aqui (não servem de evidência qualitativa). Retorna `[]` em qualquer falha.

Formato real confirmado nas APIs do ML (testado manualmente contra a conta YUSO em produção):
- `GET /questions/search?item_id=<id>&limit=N` → `{"questions": [{"text": "...", "answer": {"text": "..."} | ausente, "status": "ANSWERED"|"UNANSWERED", ...}], "total": int, ...}`.
- `GET /reviews/item/{id}?limit=N` → `{"reviews": [{"content": "..." | null, "rate": 1-5, ...}], "paging": {"total": int, "reviews_with_comment": int, ...}, ...}` — nem toda avaliação tem `content` (a maioria só tem `rate`).

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/test_estudio_evidencia.py`:

```python
"""Testes das funções de coleta de evidência real (perguntas/avaliações) do Estúdio IA."""
from unittest.mock import MagicMock, patch
import routes.estudio as estudio


class _FakeResp:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self._body = body

    def json(self):
        return self._body


def test_buscar_perguntas_produto_extrai_texto_e_resposta():
    fake_body = {
        "questions": [
            {"text": "Serve pra PC gamer?", "status": "ANSWERED",
             "answer": {"text": "Sim, é HDMI 2.1, sem latência perceptível."}},
            {"text": "Tem 7 metros?", "status": "UNANSWERED"},
            {"text": "", "status": "ANSWERED", "answer": {"text": "resposta órfã"}},
        ],
        "total": 3,
    }
    with patch("routes.estudio._ml_get", return_value=_FakeResp(200, fake_body)) as mock_get:
        perguntas = estudio._buscar_perguntas_produto("MLB123", "token-fake", limit=20)

    mock_get.assert_called_once_with(
        f"{estudio.ML_BASE}/questions/search", "token-fake",
        {"item_id": "MLB123", "limit": 20},
    )
    # pergunta com texto vazio (3ª) é descartada; as outras 2 entram
    assert len(perguntas) == 2
    assert perguntas[0] == {"pergunta": "Serve pra PC gamer?",
                             "resposta": "Sim, é HDMI 2.1, sem latência perceptível."}
    # pergunta sem resposta (UNANSWERED) entra com resposta=None
    assert perguntas[1] == {"pergunta": "Tem 7 metros?", "resposta": None}


def test_buscar_perguntas_produto_falha_retorna_lista_vazia():
    with patch("routes.estudio._ml_get", return_value=_FakeResp(500, {})):
        assert estudio._buscar_perguntas_produto("MLB123", "token-fake") == []
    with patch("routes.estudio._ml_get", side_effect=Exception("timeout")):
        assert estudio._buscar_perguntas_produto("MLB123", "token-fake") == []


def test_buscar_avaliacoes_texto_produto_so_inclui_com_texto():
    fake_body = {
        "reviews": [
            {"content": "Ótimo cabo, chegou rápido.", "rate": 5},
            {"content": None, "rate": 4},          # só nota, sem texto — descartada
            {"content": "  ", "rate": 3},           # texto vazio/whitespace — descartada
            {"content": "Veio errado, troquei.", "rate": 2},
        ],
        "paging": {"total": 4, "reviews_with_comment": 2},
    }
    with patch("routes.estudio._ml_get", return_value=_FakeResp(200, fake_body)) as mock_get:
        avaliacoes = estudio._buscar_avaliacoes_texto_produto("MLB123", "token-fake", limit=30)

    mock_get.assert_called_once_with(
        f"{estudio.ML_BASE}/reviews/item/MLB123", "token-fake", {"limit": 30},
    )
    assert len(avaliacoes) == 2
    assert avaliacoes[0] == {"nota": 5, "texto": "Ótimo cabo, chegou rápido."}
    assert avaliacoes[1] == {"nota": 2, "texto": "Veio errado, troquei."}


def test_buscar_avaliacoes_texto_produto_falha_retorna_lista_vazia():
    with patch("routes.estudio._ml_get", return_value=_FakeResp(404, {})):
        assert estudio._buscar_avaliacoes_texto_produto("MLB123", "token-fake") == []
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_estudio_evidencia.py -v`
Expected: `ImportError`/`AttributeError` — `_buscar_perguntas_produto`/`_buscar_avaliacoes_texto_produto` ainda não existem.

- [ ] **Step 3: Implementar**

Em `routes/estudio.py`, logo depois de `_buscar_visitas_30d` (por volta da linha 545), adicione:

```python
def _buscar_perguntas_produto(item_id, token, limit=20):
    """Busca até `limit` perguntas reais de um anúncio via GET /questions/search,
    com a resposta do vendedor quando houver. Best-effort: qualquer falha
    (rede, status != 200) retorna lista vazia, nunca levanta exceção."""
    try:
        r = _ml_get(f"{ML_BASE}/questions/search", token, {"item_id": item_id, "limit": limit})
        if r.status_code != 200:
            return []
        perguntas = []
        for q in (r.json() or {}).get("questions", []):
            texto = (q.get("text") or "").strip()
            if not texto:
                continue
            resposta = ((q.get("answer") or {}).get("text") or "").strip() or None
            perguntas.append({"pergunta": texto, "resposta": resposta})
        return perguntas
    except Exception as e:
        print(f"[estudio/_buscar_perguntas_produto] {item_id} falhou: {e}")
        return []


def _buscar_avaliacoes_texto_produto(item_id, token, limit=30):
    """Busca até `limit` avaliações reais COM TEXTO de um anúncio via
    GET /reviews/item/{id} — nem toda avaliação tem comentário (a maioria só
    tem nota); essa função descarta as que não têm texto, já que servem de
    evidência qualitativa, não de estatística (isso já vem de nota/num_avaliacoes
    em _buscar_reviews_item). Best-effort: qualquer falha retorna lista vazia."""
    try:
        r = _ml_get(f"{ML_BASE}/reviews/item/{item_id}", token, {"limit": limit})
        if r.status_code != 200:
            return []
        avaliacoes = []
        for rv in (r.json() or {}).get("reviews", []):
            texto = (rv.get("content") or "").strip()
            if not texto:
                continue
            avaliacoes.append({"nota": rv.get("rate"), "texto": texto})
        return avaliacoes
    except Exception as e:
        print(f"[estudio/_buscar_avaliacoes_texto_produto] {item_id} falhou: {e}")
        return []
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_estudio_evidencia.py -v`
Expected: `6 passed`

- [ ] **Step 5: Validar contra a API real (smoke test manual, não faz parte da suíte)**

```bash
cd ~/Desktop/ml-seller-api && set -a && source runtime.env && set +a && python3 -c "
import sys; sys.path.insert(0, '.')
import routes.estudio as estudio
import ml_client
token, _ = ml_client.renovar_token('YUSO')
perguntas = estudio._buscar_perguntas_produto('MLB6534792746', token)
avaliacoes = estudio._buscar_avaliacoes_texto_produto('MLB6534792746', token)
print(f'{len(perguntas)} perguntas, {len(avaliacoes)} avaliações com texto')
assert len(perguntas) > 0, 'esperava pelo menos 1 pergunta real pra esse item'
assert len(avaliacoes) > 0, 'esperava pelo menos 1 avaliação com texto pra esse item'
print('OK')
"
```
Expected: imprime uma contagem > 0 pras duas listas e `OK` (o item MLB6534792746 tem 17 perguntas e ~124 avaliações com comentário confirmadas manualmente antes deste plano).

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add routes/estudio.py tests/test_estudio_evidencia.py
git commit -m "feat: busca perguntas e avaliações reais (com texto) de um produto no ML"
```

---

### Task 3: Orquestração paralela (top 5) + integração em `buscar_produtos`

**Files:**
- Modify: `routes/estudio.py` (nova função `_coletar_evidencia_real`; rota `buscar_produtos` passa a chamá-la e salvar o resultado)
- Test: `tests/test_estudio_evidencia.py` (acrescenta casos)

**Interfaces:**
- Consumes: `_buscar_perguntas_produto`, `_buscar_avaliacoes_texto_produto` (Task 2); `ThreadPoolExecutor`/`as_completed` (já importados no arquivo).
- Produces: `_coletar_evidencia_real(produtos, token)` → `dict` `{"perguntas": list[dict], "avaliacoes": list[dict], "produtos_cobertos": int}`. `produtos_cobertos` conta produtos que retornaram pelo menos 1 pergunta OU 1 avaliação (não a quantidade de produtos tentados). Nunca levanta exceção — falha total retorna `{"perguntas": [], "avaliacoes": [], "produtos_cobertos": 0}`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao final de `tests/test_estudio_evidencia.py`:

```python
def test_coletar_evidencia_real_top5_paralelo():
    produtos = [{"id": f"MLB{i}"} for i in range(1, 8)]  # 7 produtos — só os 5 primeiros contam

    def fake_perguntas(item_id, token, limit=20):
        return [{"pergunta": f"pergunta de {item_id}", "resposta": None}]

    def fake_avaliacoes(item_id, token, limit=30):
        if item_id == "MLB3":
            return []  # produto sem avaliação com texto
        return [{"nota": 5, "texto": f"avaliação de {item_id}"}]

    with patch("routes.estudio._buscar_perguntas_produto", side_effect=fake_perguntas), \
         patch("routes.estudio._buscar_avaliacoes_texto_produto", side_effect=fake_avaliacoes):
        resultado = estudio._coletar_evidencia_real(produtos, "token-fake")

    # só os top 5 (MLB1..MLB5) — MLB6 e MLB7 não entram
    assert len(resultado["perguntas"]) == 5
    ids_nas_perguntas = {p["pergunta"].replace("pergunta de ", "") for p in resultado["perguntas"]}
    assert ids_nas_perguntas == {"MLB1", "MLB2", "MLB3", "MLB4", "MLB5"}
    # MLB3 não tem avaliação com texto, mas tem pergunta — ainda conta como coberto
    assert resultado["produtos_cobertos"] == 5
    assert len(resultado["avaliacoes"]) == 4  # todos menos MLB3


def test_coletar_evidencia_real_sem_produtos_ml_retorna_vazio():
    resultado = estudio._coletar_evidencia_real([], "token-fake")
    assert resultado == {"perguntas": [], "avaliacoes": [], "produtos_cobertos": 0}

    # produtos sem id MLB (ex: erro de dado) também não geram chamada nenhuma
    resultado2 = estudio._coletar_evidencia_real([{"id": None}, {"titulo": "sem id"}], "token-fake")
    assert resultado2 == {"perguntas": [], "avaliacoes": [], "produtos_cobertos": 0}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_estudio_evidencia.py -v -k coletar_evidencia`
Expected: `AttributeError: module 'routes.estudio' has no attribute '_coletar_evidencia_real'`

- [ ] **Step 3: Implementar a orquestração**

Em `routes/estudio.py`, logo depois de `_buscar_avaliacoes_texto_produto` (Task 2), adicione:

```python
def _coletar_evidencia_real(produtos, token):
    """Coleta perguntas e avaliações reais dos 5 produtos mais vendidos (a
    lista já vem ordenada por mais vendido — pega os 5 primeiros com id MLB
    válido), em paralelo (mesmo padrão de _enriquecer_produtos).

    Retorna {"perguntas": [...], "avaliacoes": [...], "produtos_cobertos": int}
    — perguntas/avaliacoes são listas achatadas de todos os produtos cobertos;
    produtos_cobertos conta produtos com pelo menos 1 pergunta OU 1 avaliação
    retornada (não a quantidade de produtos tentados).

    Best-effort: nunca levanta exceção — falha total retorna listas vazias.
    """
    top5 = [p for p in produtos if str(p.get("id") or "").startswith("MLB")][:5]
    if not top5:
        return {"perguntas": [], "avaliacoes": [], "produtos_cobertos": 0}

    perguntas_todas = []
    avaliacoes_todas = []
    cobertos = set()
    try:
        with ThreadPoolExecutor(max_workers=10) as pool:
            fut_perg = {pool.submit(_buscar_perguntas_produto, p["id"], token): p["id"] for p in top5}
            fut_aval = {pool.submit(_buscar_avaliacoes_texto_produto, p["id"], token): p["id"] for p in top5}
            for fut in as_completed(list(fut_perg) + list(fut_aval), timeout=25):
                try:
                    if fut in fut_perg:
                        item_id = fut_perg[fut]
                        resultado = fut.result()
                        if resultado:
                            cobertos.add(item_id)
                        perguntas_todas.extend(resultado)
                    else:
                        item_id = fut_aval[fut]
                        resultado = fut.result()
                        if resultado:
                            cobertos.add(item_id)
                        avaliacoes_todas.extend(resultado)
                except Exception:
                    pass
    except Exception as e:
        print(f"[estudio/_coletar_evidencia_real] falhou: {e}")

    return {
        "perguntas": perguntas_todas,
        "avaliacoes": avaliacoes_todas,
        "produtos_cobertos": len(cobertos),
    }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_estudio_evidencia.py -v`
Expected: `8 passed`

- [ ] **Step 5: Integrar em `buscar_produtos`**

Em `routes/estudio.py`, na função `buscar_produtos` (por volta da linha 810-830, logo depois do bloco `_aplicar_vendas_reais` e antes do bloco `# ── Auto-save no histórico`), adicione a coleta e injete no `entrada` salvo:

```python
        try:
            produtos = _aplicar_vendas_reais(produtos)
        except Exception as e:
            print(f"[estudio/buscar] vendas reais falhou (não-fatal): {e}\n{traceback.format_exc()}")

        # ── Evidência real (perguntas + avaliações) dos top 5 (best-effort) ──
        try:
            evidencia = _coletar_evidencia_real(produtos, token)
        except Exception as e:
            print(f"[estudio/buscar] evidência real falhou (não-fatal): {e}\n{traceback.format_exc()}")
            evidencia = {"perguntas": [], "avaliacoes": [], "produtos_cobertos": 0}

        # ── Auto-save no histórico (best-effort, nunca quebra a busca) ──
```

O bloco real de auto-save (dentro de `buscar_produtos`, logo após o comentário `# ── Auto-save no histórico`) hoje é exatamente:

```python
        estudo_id = None
        if produtos:
            chave = termo or link
            try:
                # Dedupe: mesma busca em <2 min reusa o estudo existente
                estudo_id = db.find_estudo_recente(g.user.get("id"), chave, minutos=2, conta_ml=conta_ml)
                if not estudo_id:
                    entrada = {
                        "termo": termo or link,
                        "link": link,
                        "tipos": ["busca"],
                        "produtos_analisados": produtos,
                    }
                    estudo_id = db.save_estudo(
                        g.user.get("id"), conta_ml, entrada, None, mercado=mercado
                    )
                    print(f"[estudio/buscar] estudo {estudo_id} salvo no histórico")
                else:
                    print(f"[estudio/buscar] estudo {estudo_id} reusado (busca repetida)")
            except Exception as e:
                print(f"[estudio/buscar] auto-save falhou (não-fatal): {e}\n{traceback.format_exc()}")
```

`entrada` não muda (a evidência não entra nesse dict — é passada direto como argumento nomeado pra `db.save_estudo`, que já a recebe separadamente desde a Task 1). Troque só a chamada de `db.save_estudo`:

```python
                    estudo_id = db.save_estudo(
                        g.user.get("id"), conta_ml, entrada, None, mercado=mercado, evidencia=evidencia,
                    )
```

- [ ] **Step 6: Validar sintaxe e rodar suíte completa**

```bash
cd ~/Desktop/ml-seller-api
python3 -c "import ast; ast.parse(open('routes/estudio.py').read())"
python3 -m pytest tests/ -q
```
Expected: sintaxe OK; mesma contagem de passed/failed pré-existente + os novos testes desta task passando.

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add routes/estudio.py tests/test_estudio_evidencia.py
git commit -m "feat: coleta evidência real dos top 5 produtos e salva junto do estudo"
```

---

### Task 4: Prompt usa a evidência real (persona)

**Files:**
- Modify: `services/estudio_ia_service.py` (nova função `_evidencia_texto`; `montar_prompt_bloco` e `gerar_bloco` ganham parâmetro `evidencia`; `_BLOCO_SYSTEM` e `_BLOCO_SPECS["persona"]["instrucao"]` atualizados)
- Test: `tests/test_estudio_ia.py` (acrescenta casos)

**Interfaces:**
- Consumes: dict `evidencia` no formato produzido pela Task 3 (`{"perguntas": [...], "avaliacoes": [...], "produtos_cobertos": int}`).
- Produces: `montar_prompt_bloco(bloco, termo, produtos, mercado=None, persona=None, evidencia=None)` — string do prompt, agora incluindo a seção de evidência quando presente. `gerar_bloco(bloco, termo, produtos, mercado=None, persona=None, evidencia=None, api_key=None)` — mesma assinatura anterior + `evidencia`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao final de `tests/test_estudio_ia.py`:

```python
def _evidencia():
    return {
        "perguntas": [{"pergunta": "Serve pra PC gamer?", "resposta": "Sim, é HDMI 2.1."}],
        "avaliacoes": [{"nota": 5, "texto": "Ótimo cabo, chegou rápido."}],
        "produtos_cobertos": 1,
    }


def test_montar_prompt_bloco_inclui_evidencia_real_quando_presente():
    p = svc.montar_prompt_bloco("persona", "cabo hdmi", _produtos(), evidencia=_evidencia())
    assert "Serve pra PC gamer?" in p
    assert "Sim, é HDMI 2.1." in p
    assert "Ótimo cabo, chegou rápido." in p


def test_montar_prompt_bloco_sem_evidencia_nao_quebra():
    p = svc.montar_prompt_bloco("persona", "cabo hdmi", _produtos())
    assert "cabo hdmi" in p  # prompt normal, sem seção de evidência


def test_montar_prompt_bloco_evidencia_vazia_nao_adiciona_secao():
    vazia = {"perguntas": [], "avaliacoes": [], "produtos_cobertos": 0}
    p = svc.montar_prompt_bloco("persona", "cabo hdmi", _produtos(), evidencia=vazia)
    assert "Evidência real de compradores" not in p


def test_bloco_system_nao_probe_mais_usar_avaliacoes_reais():
    # a regra antiga dizia pra NUNCA usar dado de avaliação/pergunta — agora deve
    # permitir quando a seção de evidência real vier preenchida no prompt
    assert "Cazonato" not in svc._BLOCO_SYSTEM
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_estudio_ia.py -v -k "evidencia or bloco_system"`
Expected: `TypeError: montar_prompt_bloco() got an unexpected keyword argument 'evidencia'`

- [ ] **Step 3: Implementar**

Em `services/estudio_ia_service.py`, logo antes de `montar_prompt_bloco` (por volta da linha 793), adicione:

```python
def _evidencia_texto(evidencia):
    """Formata perguntas e avaliações reais coletadas para entrar no prompt.
    Retorna string vazia quando não há evidência (produto sem coleta, ou
    coleta falhou) — nesse caso o prompt segue igual ao comportamento anterior."""
    if not evidencia:
        return ""
    perguntas = evidencia.get("perguntas") or []
    avaliacoes = evidencia.get("avaliacoes") or []
    if not perguntas and not avaliacoes:
        return ""

    linhas = [
        f"\n**Evidência real de compradores** ({len(perguntas)} perguntas, "
        f"{len(avaliacoes)} avaliações com texto, de {evidencia.get('produtos_cobertos', 0)} "
        "dos anúncios mais vendidos analisados):\n"
    ]
    if perguntas:
        linhas.append("Perguntas reais de compradores:")
        for p in perguntas[:40]:
            linha = f'- "{p["pergunta"]}"'
            if p.get("resposta"):
                linha += f' → resposta do vendedor: "{p["resposta"]}"'
            linhas.append(linha)
    if avaliacoes:
        linhas.append("\nAvaliações reais de compradores:")
        for a in avaliacoes[:60]:
            linhas.append(f'- (nota {a.get("nota", "?")}) "{a["texto"]}"')
    return "\n".join(linhas)
```

Substitua a função `montar_prompt_bloco` existente por:

```python
def montar_prompt_bloco(bloco, termo, produtos, mercado=None, persona=None, evidencia=None):
    """Monta o prompt de um bloco das Ferramentas de IA.

    persona: dict do bloco 'persona' já gerado (opcional) — quando presente,
    entra como contexto-guia para direcionar o bloco à persona majoritária.
    evidencia: dict opcional {"perguntas": [...], "avaliacoes": [...],
    "produtos_cobertos": int} — evidência real de compradores dos top 5
    produtos (ver routes/estudio.py::_coletar_evidencia_real). Quando ausente
    ou vazia, o prompt segue sem essa seção (comportamento anterior).
    """
    spec = _BLOCO_SPECS[bloco]
    contexto_persona = _persona_contexto(persona) if bloco != "persona" else ""
    return f"""Com base nos {len(produtos)} produtos mais vendidos no Mercado Livre para o termo **"{termo}"**, gere a ferramenta pedida abaixo.

**Produtos analisados (evidências disponíveis):**
{_produtos_texto(produtos)}
{_mercado_texto(mercado)}
{_evidencia_texto(evidencia)}
{contexto_persona}

---

{spec['instrucao']}

Gere exatamente este JSON:

{spec['formato']}

Regras: use as evidências fornecidas (incluindo perguntas/avaliações reais de compradores, quando presentes); sem evidência suficiente pra um ponto específico, marque como 'hipótese a validar'; sem texto fora do JSON."""
```

Substitua a assinatura e a chamada interna de `gerar_bloco` (linha ~819) por:

```python
def gerar_bloco(bloco, termo, produtos, mercado=None, persona=None, evidencia=None, api_key=None):
    """Gera UM bloco das Ferramentas de IA via IA e devolve o dict normalizado.

    evidencia: ver montar_prompt_bloco.
    Levanta RuntimeError em falha (bloco inválido, chave ausente, resposta
    vazia/inválida) — o route traduz para 424.
    """
    if bloco not in BLOCOS:
        raise RuntimeError(f"bloco inválido: {bloco}")
    prompt = montar_prompt_bloco(bloco, termo, produtos, mercado=mercado, persona=persona, evidencia=evidencia)
    data = _gerar_json(prompt, _BLOCO_SYSTEM, schema=_schema_bloco(bloco), api_key=api_key)
    conteudo = normalizar_bloco(bloco, data)
    campo_principal = _BLOCO_CAMPOS[bloco][0]
    if not conteudo.get(campo_principal):
        if not any(conteudo.get(c) for c in _BLOCO_CAMPOS[bloco]):
            raise RuntimeError("a IA retornou conteúdo vazio")
    return conteudo
```

Por fim, atualize `_BLOCO_SYSTEM` (linha ~496) — a regra de ouro precisa deixar de proibir uso de avaliações/perguntas (agora elas podem vir reais) e passar a exigir uso quando presentes:

```python
_BLOCO_SYSTEM = (
    "Você é um especialista em ofertas direcionadas no Mercado Livre brasileiro. "
    "Filosofia inegociável: o consumidor não compra pelo menor preço — ele compra "
    "o que 'é para ele'; a compra é identidade. Se o anúncio serve para todo mundo, "
    "não serve para ninguém. A oferta vencedora é construída para o público "
    "MAJORITÁRIO (~70% que mais compra aquele produto). Conversão importa mais que "
    "volume. Tom de conversa entre iguais: coloque o produto no mundo da persona, "
    "nunca ficha técnica fria. "
    "Regra de ouro: evidência acima de achismo. Baseie-se nas evidências fornecidas: "
    "títulos, preços e vendas dos produtos analisados; tendências reais da categoria; "
    "e, quando o prompt trouxer uma seção 'Evidência real de compradores' (perguntas "
    "e avaliações reais), use essa linguagem e esses temas reais para dores/objeções "
    "e justificativa — não parafraseie de forma genérica, cite o que os compradores "
    "de fato disseram. Quando essa seção não vier ou vier vazia, não invente dados de "
    "avaliações ou perguntas de clientes que não temos — marque 'hipótese a validar'. "
    "Responda SOMENTE com um objeto JSON válido, sem markdown e sem comentários."
)
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_estudio_ia.py -v`
Expected: todos os testes do arquivo passam, incluindo os novos.

- [ ] **Step 5: Rodar suíte completa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/ -q`
Expected: mesma contagem pré-existente + novos testes passando, nenhuma falha nova.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add services/estudio_ia_service.py tests/test_estudio_ia.py
git commit -m "feat: prompt do bloco persona usa evidência real de compradores quando disponível"
```

---

### Task 5: Rota `gerar_conteudo` passa a evidência salva + citação determinística + verificação ao vivo

**Files:**
- Modify: `routes/estudio.py` (função `gerar_conteudo`)
- Test: manual/ao vivo (esta task não tem teste automatizado novo — a lógica pura já foi testada nas Tasks 2-4; aqui é só fiação da rota, verificada ao vivo no Step 4)

**Interfaces:**
- Consumes: `estudio_ia_service.gerar_bloco(..., evidencia=...)` (Task 4); `estudo.get("evidencia")` (coluna já retornada por `db.get_estudo`, populada pela Task 3).
- Produces: resposta de `POST /api/estudio/conteudo` com `bloco == "persona"` agora inclui, no campo `justificativa`, uma citação determinística da evidência real usada (contagem exata, gerada em Python, não pela IA).

- [ ] **Step 1: Editar `gerar_conteudo` para ler e repassar a evidência**

Em `routes/estudio.py`, dentro de `gerar_conteudo()` (por volta da linha 1032-1043, onde `estudo` é carregado e `produtos` é preenchido a partir dele), adicione a leitura da evidência logo depois:

```python
    estudo = None
    evidencia = None
    if estudo_id:
        try:
            estudo = db.get_estudo(estudo_id, owner_user_id, conta_ml=conta_ml)
        except Exception as e:
            print(f"[estudio/conteudo] erro ao carregar estudo: {e}\n{traceback.format_exc()}")
            return jsonify({"erro": "Erro ao carregar estudo"}), 500
        if not estudo:
            return jsonify({"erro": "Estudo não encontrado"}), 404
        termo = termo or (estudo.get("termo") or estudo.get("link") or "")
        if not produtos:
            produtos = estudo.get("produtos_analisados") or []
        evidencia = estudo.get("evidencia")
```

- [ ] **Step 2: Passar `evidencia` para `gerar_bloco` e adicionar a citação determinística**

Localize o bloco que chama `estudio_ia_service.gerar_bloco(...)` (por volta da linha 1071-1074) e ajuste:

```python
    if bloco:
        # Persona já gerada (se houver) guia os demais blocos
        persona_ctx = None
        if bloco != "persona" and isinstance(conteudo_atual.get("persona"), dict):
            persona_ctx = conteudo_atual["persona"]
        try:
            conteudo = estudio_ia_service.gerar_bloco(
                bloco, termo, produtos, mercado=mercado, persona=persona_ctx, evidencia=evidencia,
            )
        except Exception as e:
            print(f"[estudio/conteudo] bloco {bloco} falhou: {e}\n{traceback.format_exc()}")
            return jsonify({"erro": f"Falha ao gerar '{bloco}' com a IA: {e}"}), 424

        # Citação determinística da evidência real usada (não confiar na IA pra
        # reportar uma contagem que ela não vê diretamente) — só no bloco persona.
        if bloco == "persona" and evidencia:
            n_perguntas = len(evidencia.get("perguntas") or [])
            n_avaliacoes = len(evidencia.get("avaliacoes") or [])
            if n_perguntas or n_avaliacoes:
                citacao = (
                    f" Baseado em {n_perguntas} pergunta{'s' if n_perguntas != 1 else ''} e "
                    f"{n_avaliacoes} avaliaç{'ões' if n_avaliacoes != 1 else 'ão'} reais de "
                    f"{evidencia.get('produtos_cobertos', 0)} dos anúncios mais vendidos analisados."
                )
                justificativa_atual = conteudo.get("justificativa") or ""
                conteudo["justificativa"] = (justificativa_atual + citacao).strip()
    else:
```

(O `else:` final já existe no arquivo — mantenha o corpo dele intocado, só ajuste a indentação/posição do `try/except` do bloco `if bloco:` conforme acima.)

- [ ] **Step 3: Validar sintaxe e rodar suíte completa**

```bash
cd ~/Desktop/ml-seller-api
python3 -c "import ast; ast.parse(open('routes/estudio.py').read())"
python3 -m pytest tests/ -q
```
Expected: sintaxe OK; mesma contagem pré-existente de passed/failed, sem novas falhas.

- [ ] **Step 4: Verificação ao vivo, fim a fim, contra a conta real**

```bash
cd ~/Desktop/ml-seller-api && set -a && source runtime.env && set +a && python3 -c "
import sys; sys.path.insert(0, '.')
import routes.estudio as estudio
import services.estudio_ia_service as svc
import ml_client

token, user_id = ml_client.renovar_token('YUSO')
produtos = estudio._buscar_por_termo('cabo hdmi', token)
produtos = estudio._enriquecer_produtos(produtos, token)
evidencia = estudio._coletar_evidencia_real(produtos, token)
print(f'Evidência coletada: {len(evidencia[\"perguntas\"])} perguntas, '
      f'{len(evidencia[\"avaliacoes\"])} avaliações, '
      f'{evidencia[\"produtos_cobertos\"]} produtos cobertos')
assert evidencia['produtos_cobertos'] > 0, 'esperava evidência real pra \"cabo hdmi\"'

conteudo = svc.gerar_bloco('persona', 'cabo hdmi', produtos[:5], evidencia=evidencia)
print('resumo:', conteudo.get('resumo'))
print('justificativa:', conteudo.get('justificativa')[:300])
assert conteudo.get('resumo'), 'persona não pode vir vazia'
print('OK — persona gerada com evidência real')
"
```
Expected: imprime contagens > 0, gera uma persona real via OpenAI, e a `justificativa` impressa cita elementos que remetem a perguntas/avaliações reais coletadas (conferir manualmente lendo a saída — não é um assert automatizável, é uma leitura humana do resultado).

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add routes/estudio.py
git commit -m "feat: gerar_conteudo usa evidência real salva e cita a contagem no resultado"
```

---

## Self-Review

**Cobertura do spec:** coleta de perguntas/avaliações reais via API oficial (Task 2), escopo top-5 (Task 3), integração no prompt com instrução de uso (Task 4), citação determinística no resultado final (Task 5), sem mudança de UX/loading (nenhuma task mexe em frontend), Reclame Aqui/redes sociais/Google Trends explicitamente fora de escopo (nenhuma task tenta implementá-los).

**Placeholder scan:** nenhum "TBD"/"TODO" — todo código de cada step está completo e testado contra o formato real das APIs do ML (verificado manualmente antes de escrever o plano, ver Task 2). A Task 5 Step 4 pede leitura humana da `justificativa` gerada porque o CONTEÚDO exato de uma resposta de IA generativa não é determinístico — isso é inerente à natureza da feature (avaliar a qualidade textual de uma persona gerada não é um `assert` de igualdade), não um placeholder evitável.

**Consistência de tipos:** `evidencia` é sempre o mesmo shape (`{"perguntas": [...], "avaliacoes": [...], "produtos_cobertos": int}`) da Task 3 (onde é produzido) até a Task 5 (onde é consumido para a citação) — os nomes de campo (`pergunta`, `resposta`, `nota`, `texto`) são idênticos em todas as tasks que os leem/escrevem.
