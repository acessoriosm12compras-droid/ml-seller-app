# Contas a Pagar Inteligente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a aba mockada "Contas a Pagar" (localStorage) por uma funcionalidade real: lançamento manual ou via upload de PDF (com extração automática por IA, sempre revisada pelo usuário antes de salvar), e unificar as despesas do Fechamento numa lista só, alimentada por essa nova tabela + o histórico congelado de `fechamento_despesas`.

**Architecture:** Nova tabela `contas_a_pagar` (granularidade por lançamento). Extração de PDF em duas etapas: texto extraído localmente (`pypdf`), depois enviado como prompt pra OpenAI reaproveitando o padrão `_gerar_json` já usado no Estúdio IA — sempre retorna sugestão, nunca salva sozinho. Fluxo de Caixa e Fechamento passam a ler da nova tabela; `fechamento_despesas` vira read-only (histórico).

**Tech Stack:** Flask + Postgres (backend), React + Vite + Tailwind + React Query (frontend), OpenAI (extração), `pypdf` (novo — extração de texto de PDF).

## Global Constraints

- Toda chamada HTTP externa (OpenAI) precisa de `timeout` explícito.
- Rotas nunca devolvem 502/503/504 — falha de extração por IA responde 424 (mesma convenção do Estúdio IA), nunca 5xx; nenhuma chamada bloqueante sem timeout.
- Multi-conta: rotas resolvem a conta com o padrão `_conta()` de `routes/fechamento.py` (query param/body pra admin; não-admin travado na própria conta).
- Migrações: `migrations/NNN_nome.sql`, `CREATE TABLE IF NOT EXISTS`, índices com `IF NOT EXISTS`.
- Consultas usam `RealDictCursor`; conexões via `db.get_conn()` e `conn.close()` no `finally`.
- Frontend: sem sistema de toast — feedback por banner inline; toda chamada de API usa `conta_ml: activeAccount` do `AuthContext`, incluído nas queryKeys do React Query.
- `fechamento_despesas` é **read-only** a partir desta feature — nenhum código novo grava nela. O botão manual "adicionar despesa" e o botão "Sincronizar Conta Simples" (serviço não usado mais) são removidos do Fechamento.
- A extração por IA é **sempre uma sugestão** — nunca salva automaticamente. O usuário confirma antes de qualquer gravação.

---

## Task 1: Migração `contas_a_pagar` + funções de acesso em `db.py`

**Files:**
- Create: `migrations/022_contas_a_pagar.sql`
- Modify: `db.py` (funções novas no final do arquivo)
- Test: `tests/test_db_contas_a_pagar.py`

**Interfaces:**
- Produces (usado pelas Tasks 4, 5, 6):
  - `db.criar_conta_pagar(dados: dict) -> dict` — `dados` tem: `conta_ml`, `descricao`, `categoria`, `valor`, `vencimento`, `competencia`, `status` (default `'a_pagar'`), `fonte`, `pdf_nome_original`. Retorna a linha criada (com `id`).
  - `db.listar_contas_pagar(conta_ml: str, status=None, competencia=None) -> list[dict]`
  - `db.atualizar_conta_pagar(id: int, conta_ml: str, dados: dict) -> dict | None` — atualiza os campos presentes em `dados`; se `dados["status"] == "pago"` e o status anterior não era `pago`, seta `pago_em = NOW()`. Retorna `None` se não encontrado (id + conta_ml não bate).
  - `db.deletar_conta_pagar(id: int, conta_ml: str) -> bool` — `True` se deletou, `False` se não encontrado.
  - `db.somar_contas_pagar_por_competencia(conta_ml: str, competencia: str) -> float` — soma `valor` de todos os lançamentos daquela competência (independente de status).
  - `db.somar_contas_pagar_por_vencimento(conta_ml: str, ano_mes: str) -> float` — soma `valor` de todos os lançamentos cujo `vencimento` cai naquele `AAAA-MM`.

- [ ] **Step 1: Escrever a migração**

```sql
-- migrations/022_contas_a_pagar.sql
-- Controle de contas a pagar (por lançamento individual, não agregado por
-- mês) — substitui despesas_fixas_mensais (vazia) como fonte de despesa
-- pro Fluxo de Caixa e pro Fechamento (junto com o histórico congelado de
-- fechamento_despesas). Ver spec 2026-07-10-contas-a-pagar-inteligente-design.md.
CREATE TABLE IF NOT EXISTS contas_a_pagar (
    id                 SERIAL       PRIMARY KEY,
    conta_ml           TEXT         NOT NULL,
    descricao          TEXT         NOT NULL,
    categoria          TEXT         NOT NULL,
    valor              NUMERIC(12,2) NOT NULL,
    vencimento         DATE         NOT NULL,
    competencia        TEXT         NOT NULL,  -- formato 'AAAA-MM'
    status             TEXT         NOT NULL DEFAULT 'a_pagar',
    fonte              TEXT         NOT NULL DEFAULT 'manual',
    pdf_nome_original  TEXT,
    criado_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    pago_em            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_conta_vencimento
    ON contas_a_pagar(conta_ml, vencimento);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_conta_competencia
    ON contas_a_pagar(conta_ml, competencia);
```

- [ ] **Step 2: Aplicar a migração**

Run: `cd ~/Desktop/ml-seller-api && set -a && source runtime.env && set +a && python3 -c "
import db
conn = db.get_conn()
try:
    with conn.cursor() as cur:
        with open('migrations/022_contas_a_pagar.sql') as f:
            cur.execute(f.read())
    conn.commit()
    print('migração aplicada')
finally:
    conn.close()
"`
Expected: `migração aplicada`, sem erro.

- [ ] **Step 3: Escrever os testes das funções de acesso (falham antes da implementação)**

```python
# tests/test_db_contas_a_pagar.py
from unittest.mock import MagicMock, patch
import db


def _fake_conn_cursor():
    cur = MagicMock()
    conn = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    return conn, cur


def test_criar_conta_pagar_insere_e_retorna_linha():
    conn, cur = _fake_conn_cursor()
    cur.fetchone.return_value = {"id": 1, "conta_ml": "M12", "descricao": "Luz", "status": "a_pagar"}
    with patch("db.get_conn", return_value=conn):
        row = db.criar_conta_pagar({
            "conta_ml": "M12", "descricao": "Luz", "categoria": "Luz",
            "valor": 150.0, "vencimento": "2026-08-10", "competencia": "2026-07",
            "status": "a_pagar", "fonte": "manual", "pdf_nome_original": None,
        })
    sql = cur.execute.call_args[0][0]
    assert "INSERT INTO contas_a_pagar" in sql
    assert row["id"] == 1
    conn.commit.assert_called_once()


def test_atualizar_conta_pagar_seta_pago_em_quando_muda_pra_pago():
    conn, cur = _fake_conn_cursor()
    cur.fetchone.side_effect = [
        {"id": 1, "status": "a_pagar"},  # leitura do status atual
        {"id": 1, "status": "pago", "pago_em": "2026-07-10T10:00:00"},  # retorno do update
    ]
    with patch("db.get_conn", return_value=conn):
        row = db.atualizar_conta_pagar(1, "M12", {"status": "pago"})
    assert row["status"] == "pago"
    update_sql = cur.execute.call_args_list[-1][0][0]
    assert "pago_em" in update_sql


def test_atualizar_conta_pagar_retorna_none_se_nao_encontrado():
    conn, cur = _fake_conn_cursor()
    cur.fetchone.return_value = None
    with patch("db.get_conn", return_value=conn):
        assert db.atualizar_conta_pagar(999, "M12", {"status": "pago"}) is None


def test_deletar_conta_pagar_retorna_false_se_nao_encontrado():
    conn, cur = _fake_conn_cursor()
    cur.rowcount = 0
    with patch("db.get_conn", return_value=conn):
        assert db.deletar_conta_pagar(999, "M12") is False


def test_somar_contas_pagar_por_competencia():
    conn, cur = _fake_conn_cursor()
    cur.fetchone.return_value = [450.75]
    with patch("db.get_conn", return_value=conn):
        total = db.somar_contas_pagar_por_competencia("M12", "2026-07")
    assert total == 450.75
    sql = cur.execute.call_args[0][0]
    assert "competencia" in sql


def test_somar_contas_pagar_por_vencimento():
    conn, cur = _fake_conn_cursor()
    cur.fetchone.return_value = [300.0]
    with patch("db.get_conn", return_value=conn):
        total = db.somar_contas_pagar_por_vencimento("M12", "2026-07")
    assert total == 300.0
    sql = cur.execute.call_args[0][0]
    assert "vencimento" in sql
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_db_contas_a_pagar.py -v`
Expected: FAIL — `AttributeError: module 'db' has no attribute 'criar_conta_pagar'`.

- [ ] **Step 5: Implementar em `db.py`**

```python
def criar_conta_pagar(dados):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO contas_a_pagar (
                    conta_ml, descricao, categoria, valor, vencimento,
                    competencia, status, fonte, pdf_nome_original
                ) VALUES (
                    %(conta_ml)s, %(descricao)s, %(categoria)s, %(valor)s, %(vencimento)s,
                    %(competencia)s, %(status)s, %(fonte)s, %(pdf_nome_original)s
                ) RETURNING *
            """, dados)
            row = cur.fetchone()
        conn.commit()
        return dict(row)
    finally:
        conn.close()


def listar_contas_pagar(conta_ml, status=None, competencia=None):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            clauses, params = ["conta_ml = %(conta_ml)s"], {"conta_ml": conta_ml}
            if status:
                clauses.append("status = %(status)s")
                params["status"] = status
            if competencia:
                clauses.append("competencia = %(competencia)s")
                params["competencia"] = competencia
            cur.execute(f"""
                SELECT * FROM contas_a_pagar WHERE {' AND '.join(clauses)}
                ORDER BY vencimento ASC
            """, params)
            return cur.fetchall()
    finally:
        conn.close()


def atualizar_conta_pagar(id, conta_ml, dados):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT status FROM contas_a_pagar WHERE id = %s AND conta_ml = %s",
                (id, conta_ml),
            )
            atual = cur.fetchone()
            if not atual:
                return None

            campos, valores = [], []
            for campo in ("descricao", "categoria", "valor", "vencimento", "competencia", "status"):
                if campo in dados:
                    campos.append(f"{campo} = %s")
                    valores.append(dados[campo])
            if dados.get("status") == "pago" and atual["status"] != "pago":
                campos.append("pago_em = NOW()")
            if not campos:
                cur.execute("SELECT * FROM contas_a_pagar WHERE id = %s AND conta_ml = %s", (id, conta_ml))
                return dict(cur.fetchone())

            valores.extend([id, conta_ml])
            cur.execute(f"""
                UPDATE contas_a_pagar SET {', '.join(campos)}
                WHERE id = %s AND conta_ml = %s RETURNING *
            """, valores)
            row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None
    finally:
        conn.close()


def deletar_conta_pagar(id, conta_ml):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM contas_a_pagar WHERE id = %s AND conta_ml = %s", (id, conta_ml))
            deletou = cur.rowcount > 0
        conn.commit()
        return deletou
    finally:
        conn.close()


def somar_contas_pagar_por_competencia(conta_ml, competencia):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COALESCE(SUM(valor), 0) FROM contas_a_pagar
                WHERE conta_ml = %s AND competencia = %s
            """, (conta_ml, competencia))
            return float(cur.fetchone()[0])
    finally:
        conn.close()


def somar_contas_pagar_por_vencimento(conta_ml, ano_mes):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COALESCE(SUM(valor), 0) FROM contas_a_pagar
                WHERE conta_ml = %s AND to_char(vencimento, 'YYYY-MM') = %s
            """, (conta_ml, ano_mes))
            return float(cur.fetchone()[0])
    finally:
        conn.close()
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_db_contas_a_pagar.py -v`
Expected: 6 passed.

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add migrations/022_contas_a_pagar.sql db.py tests/test_db_contas_a_pagar.py
git commit -m "feat: tabela contas_a_pagar e funções de acesso"
```

---

## Task 2: Extração de texto de PDF + parser de valor em formato brasileiro

**Files:**
- Create: `services/contas_pagar_pdf.py`
- Test: `tests/test_contas_pagar_pdf.py`
- Modify: `requirements.txt` (adicionar `pypdf`)

**Interfaces:**
- Produces (usado pela Task 3):
  - `extrair_texto_pdf(conteudo_bytes: bytes) -> str` — extrai o texto de todas as páginas de um PDF a partir dos bytes brutos (em memória, sem gravar em disco). Retorna string vazia se não conseguir extrair nada (PDF de imagem/escaneado) — nunca levanta exceção pra fora, captura qualquer erro de parsing e retorna `""`.
  - `texto_suficiente(texto: str) -> bool` — `True` se `len(texto.strip()) >= 50` (limiar mínimo — texto real de conta/boleto sempre passa disso; PDF de imagem sem OCR devolve string vazia ou quase vazia).
  - `parsear_valor_brl(valor) -> float | None` — aceita `float`/`int` (já numérico, devolve direto) ou `str` em formato brasileiro (`"1.234,56"` → `1234.56`, `"150,00"` → `150.0`, `"R$ 89,90"` → `89.9`) ou americano (`"150.00"` → `150.0`). Retorna `None` se não conseguir parsear (nunca levanta exceção).

- [ ] **Step 1: Escrever os testes**

```python
# tests/test_contas_pagar_pdf.py
import io
from pypdf import PdfWriter
import services.contas_pagar_pdf as pdf_service


def _pdf_com_texto(texto):
    """Gera um PDF real e mínimo em memória, só pra testar a extração —
    pypdf não escreve texto real facilmente, então testamos o caminho de
    'sem texto extraível' com um PDF de página em branco (comportamento
    real de PDF de imagem/escaneado: extract_text() devolve string vazia)."""
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_extrair_texto_pdf_pdf_invalido_retorna_vazio():
    assert pdf_service.extrair_texto_pdf(b"isso nao e um pdf de verdade") == ""


def test_extrair_texto_pdf_pagina_em_branco_retorna_vazio():
    conteudo = _pdf_com_texto("")
    assert pdf_service.extrair_texto_pdf(conteudo) == ""


def test_texto_suficiente_limiar():
    assert pdf_service.texto_suficiente("a" * 50) is True
    assert pdf_service.texto_suficiente("a" * 49) is False
    assert pdf_service.texto_suficiente("") is False
    assert pdf_service.texto_suficiente("   ") is False


def test_parsear_valor_brl_formato_brasileiro():
    assert pdf_service.parsear_valor_brl("1.234,56") == 1234.56
    assert pdf_service.parsear_valor_brl("150,00") == 150.0
    assert pdf_service.parsear_valor_brl("R$ 89,90") == 89.9
    assert pdf_service.parsear_valor_brl("R$1.500,00") == 1500.0


def test_parsear_valor_brl_ja_numerico():
    assert pdf_service.parsear_valor_brl(150.5) == 150.5
    assert pdf_service.parsear_valor_brl(150) == 150.0


def test_parsear_valor_brl_formato_invalido_retorna_none():
    assert pdf_service.parsear_valor_brl("não é um valor") is None
    assert pdf_service.parsear_valor_brl(None) is None
    assert pdf_service.parsear_valor_brl("") is None
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_contas_pagar_pdf.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.contas_pagar_pdf'`.

- [ ] **Step 3: Adicionar dependência e implementar**

Adicionar ao `requirements.txt`: `pypdf==4.3.1`

```python
# services/contas_pagar_pdf.py
"""Extração de texto de PDF (em memória, sem gravar em disco) e parsing de
valores em formato brasileiro — usados na sugestão automática de Contas a
Pagar via upload de PDF."""
import io
import re
from pypdf import PdfReader

_LIMIAR_MIN_CARACTERES = 50


def extrair_texto_pdf(conteudo_bytes):
    try:
        reader = PdfReader(io.BytesIO(conteudo_bytes))
        partes = [pagina.extract_text() or "" for pagina in reader.pages]
        return "\n".join(partes).strip()
    except Exception:
        return ""


def texto_suficiente(texto):
    return bool(texto) and len(texto.strip()) >= _LIMIAR_MIN_CARACTERES


def parsear_valor_brl(valor):
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    if not isinstance(valor, str):
        return None

    texto = valor.strip().replace("R$", "").strip()
    if not texto:
        return None

    tem_virgula = "," in texto
    tem_ponto = "." in texto
    try:
        if tem_virgula and tem_ponto:
            # formato brasileiro: ponto = milhar, vírgula = decimal
            texto = texto.replace(".", "").replace(",", ".")
        elif tem_virgula:
            texto = texto.replace(",", ".")
        return float(texto)
    except ValueError:
        return None
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && pip install pypdf==4.3.1 && python3 -m pytest tests/test_contas_pagar_pdf.py -v`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add services/contas_pagar_pdf.py tests/test_contas_pagar_pdf.py requirements.txt
git commit -m "feat: extração de texto de PDF e parser de valor em formato brasileiro"
```

---

## Task 3: Extração dos campos via IA (`services/contas_pagar_ia.py`)

**Files:**
- Create: `services/contas_pagar_ia.py`
- Test: `tests/test_contas_pagar_ia.py`

**Interfaces:**
- Consumes: `services.estudio_ia_service._gerar_json(prompt, system, schema=None, max_tokens=4096, api_key=None) -> dict` (já existe, reaproveitado diretamente — mesma função, sem duplicar). `services.contas_pagar_pdf.parsear_valor_brl` (Task 2).
- Produces (usado pela Task 4):
  - `CATEGORIAS = ['Luz', 'Água', 'Gás', 'Internet', 'Fornecedor', 'Folha de Pagamento', 'Aluguel', 'Marketing / Ads', 'Logística', 'Contador', 'Impostos', 'Outros']`
  - `extrair_dados_conta(texto_pdf: str, api_key=None) -> dict` — retorna `{"descricao": str, "categoria": str, "valor": float|None, "vencimento": str|None, "competencia": str|None}`. Se a IA falhar (exceção, JSON inválido, timeout), retorna todos os campos `None`/`""` (nunca levanta exceção pra fora — quem chama decide o que fazer, mas essa função em si é resiliente). Se `categoria` retornada não estiver na lista `CATEGORIAS`, cai pra `"Outros"`.

- [ ] **Step 1: Adicionar timeout explícito ao cliente OpenAI compartilhado (constraint global desta fase)**

`services/estudio_ia_service.py::_client()` hoje não define timeout nenhum (`OpenAI(api_key=key)`), usando o default do SDK (~600s — muito acima do que o Traefik tolera antes de derrubar a conexão, violando a regra do projeto de nunca deixar uma rota estourar em 502/503/504). Essa função é compartilhada com o Estúdio IA — a correção beneficia os dois, sem quebrar a assinatura existente:

```python
# services/estudio_ia_service.py — trocar a função _client() por:
def _client(api_key=None):
    key = api_key or os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY não configurada")
    return OpenAI(api_key=key, timeout=45.0)
```

Rodar a suíte do Estúdio IA depois dessa mudança pra confirmar que nada quebrou: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_estudio_ia.py -q` — deve continuar no mesmo estado de antes (os testes mockam a chamada à API, então um timeout maior/explícito no client não deveria mudar nenhum resultado).

- [ ] **Step 2: Escrever os testes**

```python
# tests/test_contas_pagar_ia.py
from unittest.mock import patch
import services.contas_pagar_ia as ia


def test_extrair_dados_conta_sucesso():
    resposta_ia = {
        "descricao": "Conta de luz - CPFL - competência 06/2026",
        "categoria": "Luz",
        "valor": "450,90",
        "vencimento": "2026-07-15",
        "competencia": "2026-06",
    }
    with patch("services.contas_pagar_ia._gerar_json", return_value=resposta_ia):
        dados = ia.extrair_dados_conta("CPFL ENERGIA texto extraído da conta de luz...")
    assert dados["descricao"] == "Conta de luz - CPFL - competência 06/2026"
    assert dados["categoria"] == "Luz"
    assert dados["valor"] == 450.90
    assert dados["vencimento"] == "2026-07-15"
    assert dados["competencia"] == "2026-06"


def test_extrair_dados_conta_categoria_invalida_vira_outros():
    resposta_ia = {
        "descricao": "Algo", "categoria": "Categoria Inventada Pela IA",
        "valor": "100,00", "vencimento": "2026-07-01", "competencia": "2026-07",
    }
    with patch("services.contas_pagar_ia._gerar_json", return_value=resposta_ia):
        dados = ia.extrair_dados_conta("texto qualquer")
    assert dados["categoria"] == "Outros"


def test_extrair_dados_conta_falha_ia_retorna_campos_vazios():
    with patch("services.contas_pagar_ia._gerar_json", side_effect=RuntimeError("falha na IA")):
        dados = ia.extrair_dados_conta("texto qualquer")
    assert dados == {"descricao": "", "categoria": "Outros", "valor": None, "vencimento": None, "competencia": None}


def test_extrair_dados_conta_valor_invalido_vira_none():
    resposta_ia = {
        "descricao": "Algo", "categoria": "Outros",
        "valor": "não é número", "vencimento": "2026-07-01", "competencia": "2026-07",
    }
    with patch("services.contas_pagar_ia._gerar_json", return_value=resposta_ia):
        dados = ia.extrair_dados_conta("texto qualquer")
    assert dados["valor"] is None
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_contas_pagar_ia.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 4: Implementar**

```python
# services/contas_pagar_ia.py
"""Extrai descrição/categoria/valor/vencimento/competência de uma conta ou
boleto a partir do texto extraído do PDF, via IA — reaproveita o mesmo
cliente/padrão de JSON forçado do Estúdio IA. Sempre uma sugestão: quem
chama nunca deve tratar o retorno como dado final sem revisão do usuário."""
from services.estudio_ia_service import _gerar_json
from services.contas_pagar_pdf import parsear_valor_brl

CATEGORIAS = [
    "Luz", "Água", "Gás", "Internet", "Fornecedor", "Folha de Pagamento",
    "Aluguel", "Marketing / Ads", "Logística", "Contador", "Impostos", "Outros",
]

_SYSTEM = (
    "Você extrai dados de contas/boletos brasileiros (conta de consumo, "
    "nota fiscal/boleto de fornecedor, holerite, despesa geral) a partir do "
    "texto extraído de um PDF. Nunca invente valores que não estão no "
    "texto — se não tiver certeza de um campo, deixe null."
)

_CAMPOS_VAZIOS = {"descricao": "", "categoria": "Outros", "valor": None, "vencimento": None, "competencia": None}


def _schema():
    return {
        "descricao": "string curta descrevendo a conta (ex: 'Conta de luz - CPFL - competência 06/2026')",
        "categoria": f"uma destas categorias, exatamente: {CATEGORIAS}",
        "valor": "valor total a pagar, como aparece no documento (pode ser string com vírgula decimal)",
        "vencimento": "data de vencimento no formato AAAA-MM-DD, ou null se não encontrado",
        "competencia": "mês de referência da despesa no formato AAAA-MM, ou null se não identificável",
    }


def extrair_dados_conta(texto_pdf, api_key=None):
    prompt = f"Texto extraído do documento:\n\n{texto_pdf[:8000]}"
    try:
        dados = _gerar_json(prompt, _SYSTEM, schema=_schema(), api_key=api_key)
    except Exception:
        return dict(_CAMPOS_VAZIOS)

    categoria = dados.get("categoria")
    if categoria not in CATEGORIAS:
        categoria = "Outros"

    return {
        "descricao": dados.get("descricao") or "",
        "categoria": categoria,
        "valor": parsear_valor_brl(dados.get("valor")),
        "vencimento": dados.get("vencimento") or None,
        "competencia": dados.get("competencia") or None,
    }
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_contas_pagar_ia.py -v`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add services/estudio_ia_service.py services/contas_pagar_ia.py tests/test_contas_pagar_ia.py
git commit -m "feat: extração de dados de conta/boleto via IA + timeout explícito no cliente OpenAI compartilhado"
```

---

## Task 4: Rotas backend (`routes/contas_a_pagar.py`)

**Files:**
- Create: `routes/contas_a_pagar.py`
- Modify: `app.py` (registrar blueprint)
- Test: `tests/test_routes_contas_a_pagar.py`

**Interfaces:**
- Consumes: `db.criar_conta_pagar/listar_contas_pagar/atualizar_conta_pagar/deletar_conta_pagar` (Task 1); `services.contas_pagar_pdf.extrair_texto_pdf/texto_suficiente` (Task 2); `services.contas_pagar_ia.extrair_dados_conta` (Task 3).
- Produces (usado pela Task 7 — frontend):
  - `POST /api/contas-a-pagar/extrair` (multipart, campo `arquivo`) → `{"descricao", "categoria", "valor", "vencimento", "competencia", "extraido": bool}` — `extraido=False` quando o PDF não tinha texto suficiente (todos os outros campos vazios/null nesse caso).
  - `GET /api/contas-a-pagar?status=&competencia=` → `{"contas": [...]}`
  - `POST /api/contas-a-pagar` → cria, `201`
  - `PATCH /api/contas-a-pagar/<id>` → atualiza, `200` ou `404`
  - `DELETE /api/contas-a-pagar/<id>` → `200` ou `404`

- [ ] **Step 1: Escrever os testes**

```python
# tests/test_routes_contas_a_pagar.py
import io
from unittest.mock import patch


def test_extrair_requer_arquivo(client, auth_headers):
    resp = client.post("/api/contas-a-pagar/extrair", headers=auth_headers, data={}, content_type="multipart/form-data")
    assert resp.status_code == 400


def test_extrair_arquivo_nao_pdf_rejeitado(client, auth_headers):
    data = {"arquivo": (io.BytesIO(b"nao e pdf"), "arquivo.txt")}
    resp = client.post("/api/contas-a-pagar/extrair", headers=auth_headers, data=data, content_type="multipart/form-data")
    assert resp.status_code == 400


def test_extrair_pdf_sem_texto_nao_chama_ia(client, auth_headers):
    data = {"arquivo": (io.BytesIO(b"%PDF-1.4 conteudo minimo"), "conta.pdf")}
    with patch("routes.contas_a_pagar.extrair_texto_pdf", return_value=""), \
         patch("routes.contas_a_pagar.extrair_dados_conta") as mock_ia:
        resp = client.post("/api/contas-a-pagar/extrair", headers=auth_headers, data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    assert resp.get_json()["extraido"] is False
    mock_ia.assert_not_called()


def test_extrair_pdf_com_texto_chama_ia(client, auth_headers):
    data = {"arquivo": (io.BytesIO(b"%PDF-1.4 conteudo minimo"), "conta.pdf")}
    with patch("routes.contas_a_pagar.extrair_texto_pdf", return_value="a" * 100), \
         patch("routes.contas_a_pagar.extrair_dados_conta", return_value={
             "descricao": "Luz", "categoria": "Luz", "valor": 100.0,
             "vencimento": "2026-08-01", "competencia": "2026-07",
         }):
        resp = client.post("/api/contas-a-pagar/extrair", headers=auth_headers, data=data, content_type="multipart/form-data")
    body = resp.get_json()
    assert resp.status_code == 200
    assert body["extraido"] is True
    assert body["categoria"] == "Luz"


def test_criar_conta_pagar(client, auth_headers):
    with patch("routes.contas_a_pagar.db.criar_conta_pagar", return_value={"id": 1}) as mock_criar:
        resp = client.post("/api/contas-a-pagar", headers=auth_headers, json={
            "descricao": "Luz", "categoria": "Luz", "valor": 100.0,
            "vencimento": "2026-08-01", "competencia": "2026-07",
        })
    assert resp.status_code == 201
    assert mock_criar.call_args[0][0]["conta_ml"] == "J12"  # auth_headers usa conta_ml=J12 (conftest.py)


def test_atualizar_conta_pagar_nao_encontrado_404(client, auth_headers):
    with patch("routes.contas_a_pagar.db.atualizar_conta_pagar", return_value=None):
        resp = client.patch("/api/contas-a-pagar/999", headers=auth_headers, json={"status": "pago"})
    assert resp.status_code == 404


def test_deletar_conta_pagar_nao_encontrado_404(client, auth_headers):
    with patch("routes.contas_a_pagar.db.deletar_conta_pagar", return_value=False):
        resp = client.delete("/api/contas-a-pagar/999", headers=auth_headers)
    assert resp.status_code == 404
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_routes_contas_a_pagar.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'routes.contas_a_pagar'`.

- [ ] **Step 3: Implementar**

```python
# routes/contas_a_pagar.py
from flask import Blueprint, request, jsonify, g
from middleware import jwt_required
import db
from services.contas_pagar_pdf import extrair_texto_pdf, texto_suficiente
from services.contas_pagar_ia import extrair_dados_conta

contas_a_pagar_bp = Blueprint("contas_a_pagar", __name__)

_TAMANHO_MAX_ARQUIVO = 10 * 1024 * 1024  # 10MB


def _conta():
    conta = request.args.get("conta_ml") or (request.get_json(silent=True) or {}).get("conta_ml") or g.user.get("conta_ml")
    if g.user.get("role") != "admin":
        conta = g.user.get("conta_ml")
    return conta


@contas_a_pagar_bp.route("/api/contas-a-pagar/extrair", methods=["POST"])
@jwt_required
def extrair():
    if "arquivo" not in request.files:
        return jsonify({"erro": "Arquivo não enviado"}), 400
    arquivo = request.files["arquivo"]
    if not arquivo.filename.lower().endswith(".pdf"):
        return jsonify({"erro": "Apenas arquivos PDF são aceitos"}), 400

    conteudo = arquivo.read(_TAMANHO_MAX_ARQUIVO + 1)
    if len(conteudo) > _TAMANHO_MAX_ARQUIVO:
        return jsonify({"erro": "Arquivo maior que 10MB"}), 400
    if not conteudo.startswith(b"%PDF"):
        return jsonify({"erro": "Arquivo não é um PDF válido"}), 400

    texto = extrair_texto_pdf(conteudo)
    if not texto_suficiente(texto):
        return jsonify({
            "descricao": "", "categoria": "Outros", "valor": None,
            "vencimento": None, "competencia": None, "extraido": False,
        })

    dados = extrair_dados_conta(texto)
    return jsonify({**dados, "extraido": True})


@contas_a_pagar_bp.route("/api/contas-a-pagar", methods=["GET"])
@jwt_required
def listar():
    contas = db.listar_contas_pagar(
        _conta(), status=request.args.get("status"), competencia=request.args.get("competencia"),
    )
    return jsonify({"contas": contas})


@contas_a_pagar_bp.route("/api/contas-a-pagar", methods=["POST"])
@jwt_required
def criar():
    d = request.get_json() or {}
    row = db.criar_conta_pagar({
        "conta_ml": _conta(),
        "descricao": d.get("descricao") or "",
        "categoria": d.get("categoria") or "Outros",
        "valor": d.get("valor") or 0,
        "vencimento": d.get("vencimento"),
        "competencia": d.get("competencia") or (d.get("vencimento") or "")[:7],
        "status": d.get("status") or "a_pagar",
        "fonte": d.get("fonte") or "manual",
        "pdf_nome_original": d.get("pdf_nome_original"),
    })
    return jsonify(row), 201


@contas_a_pagar_bp.route("/api/contas-a-pagar/<int:id>", methods=["PATCH"])
@jwt_required
def atualizar(id):
    row = db.atualizar_conta_pagar(id, _conta(), request.get_json() or {})
    if not row:
        return jsonify({"erro": "não encontrado"}), 404
    return jsonify(row)


@contas_a_pagar_bp.route("/api/contas-a-pagar/<int:id>", methods=["DELETE"])
@jwt_required
def deletar(id):
    if not db.deletar_conta_pagar(id, _conta()):
        return jsonify({"erro": "não encontrado"}), 404
    return jsonify({"ok": True})
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_routes_contas_a_pagar.py -v`
Expected: 7 passed.

- [ ] **Step 5: Registrar o blueprint em `app.py`**

Adicionar `from routes.contas_a_pagar import contas_a_pagar_bp` junto aos demais imports de blueprint, e `contas_a_pagar_bp` na lista do `for bp in [...]`.

- [ ] **Step 6: Confirmar suíte completa sem regressão**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/ -q`
Expected: mesma contagem de falhas pré-existentes documentada, nenhuma nova.

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add routes/contas_a_pagar.py app.py tests/test_routes_contas_a_pagar.py
git commit -m "feat: rotas de contas a pagar (CRUD + extração via PDF)"
```

---

## Task 5: Fechamento — despesas unificadas (backend)

**Files:**
- Modify: `routes/fechamento.py` (nova rota; **não** remove as rotas antigas de `/api/fechamento/despesas` ainda — ver nota)
- Test: `tests/test_fechamento_despesas_unificadas.py`

**Interfaces:**
- Consumes: `db.listar_contas_pagar` (Task 1); tabela `fechamento_despesas` (leitura, já existe).
- Produces (usado pela Task 8 — frontend):
  - `GET /api/fechamento/despesas-unificadas?competencia=AAAA-MM` → `{"despesas": [...], "total": float}`. `despesas` é a união de: linhas de `contas_a_pagar` daquela competência (todas, formatadas com `origem: "contas_a_pagar"`) + linhas de `fechamento_despesas` do `mes_ano` correspondente (formatadas com `origem: "fechamento_despesas"`, **somente leitura** — sem `id` editável do lado do frontend, ou com um campo `editavel: false`).

**Nota**: as rotas antigas `POST/PUT/DELETE /api/fechamento/despesas` (que gravam em `fechamento_despesas`) ficam no código por enquanto, mas deixam de ser chamadas pelo frontend a partir da Task 8 — remover essas rotas fica fora do escopo desta fase (não é preciso apagar código morto agora; se sobrar, é um cleanup pontual futuro).

- [ ] **Step 1: Escrever os testes**

```python
# tests/test_fechamento_despesas_unificadas.py
from unittest.mock import patch


def test_despesas_unificadas_junta_as_duas_fontes(client, auth_headers):
    contas_pagar = [{"id": 1, "descricao": "Luz", "categoria": "Luz", "valor": 100.0, "competencia": "2026-07"}]
    fechamento_desp = [{"id": 5, "descricao": "Frete extra", "valor": 50.0, "mes_ano": "2026-07"}]
    with patch("routes.fechamento.db.listar_contas_pagar", return_value=contas_pagar), \
         patch("routes.fechamento._buscar_fechamento_despesas_mes", return_value=fechamento_desp):
        resp = client.get("/api/fechamento/despesas-unificadas?competencia=2026-07", headers=auth_headers)
    body = resp.get_json()
    assert resp.status_code == 200
    assert len(body["despesas"]) == 2
    assert body["total"] == 150.0
    origens = {d["origem"] for d in body["despesas"]}
    assert origens == {"contas_a_pagar", "fechamento_despesas"}


def test_despesas_unificadas_fechamento_despesas_nao_editavel(client, auth_headers):
    with patch("routes.fechamento.db.listar_contas_pagar", return_value=[]), \
         patch("routes.fechamento._buscar_fechamento_despesas_mes", return_value=[{"id": 5, "descricao": "X", "valor": 10.0}]):
        resp = client.get("/api/fechamento/despesas-unificadas?competencia=2026-07", headers=auth_headers)
    despesa = resp.get_json()["despesas"][0]
    assert despesa["editavel"] is False
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_fechamento_despesas_unificadas.py -v`
Expected: FAIL — `AttributeError` ou rota 404.

- [ ] **Step 3: Implementar**

Adicionar em `routes/fechamento.py` (perto das rotas de despesas existentes):

```python
def _buscar_fechamento_despesas_mes(conta_ml, mes_ano):
    conn = db.get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM fechamento_despesas WHERE conta_ml=%s AND mes_ano=%s ORDER BY id",
                (conta_ml, mes_ano),
            )
            return cur.fetchall()
    finally:
        conn.close()


@fechamento_bp.route("/api/fechamento/despesas-unificadas", methods=["GET"])
@jwt_required
def despesas_unificadas():
    competencia = request.args.get("competencia", "")
    if not _mes_ano_valido(competencia):
        return jsonify({"erro": "competencia inválida"}), 400

    conta_ml = _conta()
    novas = db.listar_contas_pagar(conta_ml, competencia=competencia)
    antigas = _buscar_fechamento_despesas_mes(conta_ml, competencia)

    despesas = []
    for d in novas:
        d = dict(d)
        for k, v in d.items():
            if hasattr(v, "isoformat"):
                d[k] = v.isoformat()
        despesas.append({**d, "origem": "contas_a_pagar", "editavel": True})
    for d in antigas:
        d = dict(d)
        for k, v in d.items():
            if hasattr(v, "isoformat"):
                d[k] = v.isoformat()
        despesas.append({**d, "origem": "fechamento_despesas", "editavel": False})

    total = sum(float(d["valor"] or 0) for d in despesas)
    return jsonify({"despesas": despesas, "total": round(total, 2)})
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_fechamento_despesas_unificadas.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add routes/fechamento.py tests/test_fechamento_despesas_unificadas.py
git commit -m "feat: rota de despesas unificadas do Fechamento (contas_a_pagar + histórico congelado)"
```

---

## Task 6: Fluxo de Caixa — troca de fonte (backend)

**Files:**
- Modify: `services/fluxo_caixa_service.py:174` (função `get_despesas_fixas_total`)
- Test: `tests/test_fluxo_caixa_despesas.py`

**Interfaces:**
- Consumes: `db.somar_contas_pagar_por_vencimento` (Task 1).
- Produces: `get_despesas_fixas_total(conn, conta_ml, ano_mes)` mantém a mesma assinatura e mesmo uso pelos chamadores existentes (`montar_payload_conta`) — só troca a fonte por dentro.

- [ ] **Step 1: Escrever o teste**

```python
# tests/test_fluxo_caixa_despesas.py
from unittest.mock import patch
import services.fluxo_caixa_service as fc


def test_get_despesas_fixas_total_usa_contas_a_pagar():
    with patch("services.fluxo_caixa_service.db.somar_contas_pagar_por_vencimento", return_value=250.0) as mock_soma:
        total = fc.get_despesas_fixas_total(conn=None, conta_ml="M12", ano_mes="2026-07")
    assert total == 250.0
    mock_soma.assert_called_once_with("M12", "2026-07")
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_fluxo_caixa_despesas.py -v`
Expected: FAIL (a função atual consulta `despesas_fixas_mensais` direto, não chama `db.somar_contas_pagar_por_vencimento`).

- [ ] **Step 3: Implementar**

Ler `services/fluxo_caixa_service.py::get_despesas_fixas_total` (linha 174) primeiro, pra ver a assinatura exata (recebe `conn` — usado hoje pra reaproveitar a mesma conexão/transação; `db.somar_contas_pagar_por_vencimento` abre sua própria conexão, então o parâmetro `conn` deixa de ser usado dentro da função, mas a assinatura é mantida idêntica pra não quebrar os chamadores). Substituir o corpo da função por:

```python
def get_despesas_fixas_total(conn, conta_ml, ano_mes):
    return db.somar_contas_pagar_por_vencimento(conta_ml, ano_mes)
```

(Adicionar `import db` no topo do arquivo se ainda não existir.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_fluxo_caixa_despesas.py -v`
Expected: 1 passed.

- [ ] **Step 5: Confirmar suíte completa sem regressão**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/ -q`

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add services/fluxo_caixa_service.py tests/test_fluxo_caixa_despesas.py
git commit -m "feat: Fluxo de Caixa passa a somar contas_a_pagar (despesas_fixas_mensais estava vazia)"
```

---

## Task 7: Frontend — `api.js` + página `ContasPagar.jsx` real

**Files:**
- Modify: `src/api.js` (novo namespace `contasAPagar`)
- Modify: `src/pages/financeiro/ContasPagar.jsx` (reescrita completa — sai do modelo localStorage)

**Interfaces:**
- Consumes: rotas da Task 4 (`/api/contas-a-pagar*`).

- [ ] **Step 1: Adicionar o namespace em `src/api.js`**

Adicionar após o bloco `despesasFixas: { ... }`:

```javascript
  contasAPagar: {
    listar: (params = {}) => request(`/api/contas-a-pagar?${new URLSearchParams(params)}`),
    criar: (data) => request('/api/contas-a-pagar', { method: 'POST', body: JSON.stringify(data) }),
    atualizar: (id, data) => request(`/api/contas-a-pagar/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remover: (id) => request(`/api/contas-a-pagar/${id}`, { method: 'DELETE' }),
  },
```

- [ ] **Step 2: Reescrever `src/pages/financeiro/ContasPagar.jsx`**

Ler o arquivo atual primeiro pra confirmar a estrutura exata dos componentes visuais reaproveitáveis (`KpiCard`, formatação `formatBRL`) antes de reescrever — manter o mesmo estilo visual (cores/classes Tailwind já usadas ali), só trocar a fonte de dados de `localStorage` pra API real, e adicionar o fluxo de upload de PDF. Padrão de referência pra upload de arquivo: `src/pages/CustosProdutos.jsx::handleImport` (usa `fetch` direto com `FormData`, sem passar pelo wrapper `request()` de `api.js`, porque upload de arquivo não é JSON).

```jsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Upload, Trash2, CheckCircle2 } from 'lucide-react'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../api'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const CATEGORIAS = ['Luz', 'Água', 'Gás', 'Internet', 'Fornecedor', 'Folha de Pagamento', 'Aluguel', 'Marketing / Ads', 'Logística', 'Contador', 'Impostos', 'Outros']

function formatBRL(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const defaultForm = { descricao: '', categoria: 'Outros', valor: '', vencimento: '', competencia: '', status: 'a_pagar' }

export default function ContasPagar() {
  const { activeAccount, getToken } = useAuth()
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [camposIA, setCamposIA] = useState({})  // { campo: true } pros campos que vieram da IA
  const [enviandoPdf, setEnviandoPdf] = useState(false)
  const [erroUpload, setErroUpload] = useState(null)

  const params = activeAccount ? { conta_ml: activeAccount } : {}

  const listaQ = useQuery({
    queryKey: ['contas-a-pagar', activeAccount],
    queryFn: () => api.contasAPagar.listar(params),
  })

  const criarM = useMutation({
    mutationFn: (data) => api.contasAPagar.criar({ ...data, conta_ml: activeAccount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contas-a-pagar', activeAccount] })
      setShowModal(false); setForm(defaultForm); setCamposIA({})
    },
  })

  const atualizarM = useMutation({
    mutationFn: ({ id, data }) => api.contasAPagar.atualizar(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contas-a-pagar', activeAccount] }),
  })

  const removerM = useMutation({
    mutationFn: (id) => api.contasAPagar.remover(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contas-a-pagar', activeAccount] }),
  })

  async function handleUploadPdf(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setEnviandoPdf(true)
    setErroUpload(null)
    try {
      const body = new FormData()
      body.append('arquivo', file)
      const resp = await fetch(`${BASE}/api/contas-a-pagar/extrair`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body,
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.erro || `HTTP ${resp.status}`)

      if (data.extraido) {
        setForm({
          descricao: data.descricao || '', categoria: data.categoria || 'Outros',
          valor: data.valor ?? '', vencimento: data.vencimento || '',
          competencia: data.competencia || '', status: 'a_pagar',
        })
        setCamposIA({
          descricao: !!data.descricao, categoria: !!data.categoria,
          valor: data.valor != null, vencimento: !!data.vencimento, competencia: !!data.competencia,
        })
      } else {
        setForm(defaultForm)
        setCamposIA({})
        setErroUpload('Não consegui ler esse PDF automaticamente (provavelmente é uma imagem escaneada) — preencha manualmente.')
      }
      setShowModal(true)
    } catch (err) {
      setErroUpload(err.message)
    } finally {
      setEnviandoPdf(false)
    }
  }

  const contas = listaQ.data?.contas || []

  return (
    <div className="p-6">
      <Header title="Contas a Pagar" subtitle="Controle de despesas — lance manual ou suba o PDF da conta" />

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => { setForm(defaultForm); setCamposIA({}); setShowModal(true) }}
          className="flex items-center gap-1.5 text-sm bg-stone-800 hover:bg-stone-700 text-white px-3 py-2 rounded-lg"
        >
          <Plus size={15} /> Lançar manual
        </button>
        <label className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg cursor-pointer">
          <Upload size={15} /> {enviandoPdf ? 'Lendo PDF...' : 'Subir PDF'}
          <input type="file" accept="application/pdf" className="hidden" onChange={handleUploadPdf} disabled={enviandoPdf} />
        </label>
      </div>

      {erroUpload && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {erroUpload}
        </div>
      )}

      {listaQ.isLoading && <p className="text-sm text-stone-500">Carregando...</p>}

      {!listaQ.isLoading && contas.length === 0 && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
          Nenhuma conta lançada ainda.
        </div>
      )}

      {contas.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-500">
              <tr>
                <th className="px-4 py-2">Vencimento</th>
                <th className="px-4 py-2">Descrição</th>
                <th className="px-4 py-2">Categoria</th>
                <th className="px-4 py-2">Valor</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => {
                const vencido = c.status === 'a_pagar' && c.vencimento && new Date(c.vencimento) < new Date()
                return (
                  <tr key={c.id} className="border-t border-stone-100">
                    <td className="px-4 py-2">{c.vencimento}</td>
                    <td className="px-4 py-2">{c.descricao}</td>
                    <td className="px-4 py-2">{c.categoria}</td>
                    <td className="px-4 py-2">{formatBRL(c.valor)}</td>
                    <td className="px-4 py-2">
                      {c.status === 'pago'
                        ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={14} /> Pago</span>
                        : vencido
                          ? <span className="text-red-600">Vencido</span>
                          : <span className="text-amber-600">A pagar</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {c.status !== 'pago' && (
                        <button onClick={() => atualizarM.mutate({ id: c.id, data: { status: 'pago' } })} className="text-xs text-emerald-600 hover:underline mr-3">
                          Marcar pago
                        </button>
                      )}
                      <button onClick={() => removerM.mutate(c.id)} className="text-stone-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold mb-3">Lançar conta</h3>
            {Object.values(camposIA).some(Boolean) && (
              <p className="text-xs text-emerald-600 mb-3">✨ Campos sugeridos pela IA — confira antes de salvar (marcados abaixo)</p>
            )}
            <div className="space-y-2">
              {[
                ['descricao', 'Descrição', 'text'],
                ['valor', 'Valor', 'number'],
                ['vencimento', 'Vencimento', 'date'],
                ['competencia', 'Competência (AAAA-MM)', 'text'],
              ].map(([campo, label, tipo]) => (
                <div key={campo}>
                  <label className="text-xs text-stone-500 flex items-center gap-1">
                    {label} {camposIA[campo] && <span className="text-emerald-500">✨</span>}
                  </label>
                  <input
                    type={tipo}
                    value={form[campo]}
                    onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-sm ${camposIA[campo] ? 'border-emerald-300 bg-emerald-50' : 'border-stone-300'}`}
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-stone-500 flex items-center gap-1">
                  Categoria {camposIA.categoria && <span className="text-emerald-500">✨</span>}
                </label>
                <select
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-1.5 text-sm ${camposIA.categoria ? 'border-emerald-300 bg-emerald-50' : 'border-stone-300'}`}
                >
                  {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="text-sm px-3 py-1.5 text-stone-500">Cancelar</button>
              <button
                onClick={() => criarM.mutate(form)}
                disabled={criarM.isPending}
                className="text-sm px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
              >
                {criarM.isPending ? 'Salvando...' : 'Confirmar e salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

**Nota**: confirmar se `useAuth()` expõe `getToken()` (ver `src/pages/CustosProdutos.jsx` pra confirmar o nome exato usado lá — se for diferente, ex: `getAccessToken` ou algo do `AuthContext`, ajustar a chamada acima pro nome real).

- [ ] **Step 3: Testar manualmente**

Run: `cd ~/Desktop/ml-seller-app && npm run dev`
Abrir `/financeiro/contas-pagar` logado: confirmar que a lista carrega vazia (sem erro), lançar uma conta manual e confirmar que aparece na lista, testar o botão de marcar como pago.

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/ml-seller-app
git add src/api.js src/pages/financeiro/ContasPagar.jsx
git commit -m "feat: Contas a Pagar real — CRUD + upload de PDF com sugestão via IA"
```

---

## Task 8: Frontend — Fechamento.jsx unifica despesas

**Files:**
- Modify: `src/pages/Fechamento.jsx`

**Interfaces:**
- Consumes: `GET /api/fechamento/despesas-unificadas?competencia=` (Task 5).

- [ ] **Step 1: Ler o arquivo atual nos trechos relevantes antes de editar**

Ler `src/pages/Fechamento.jsx` nas áreas: linhas ~207-213 (`CostChart`), ~300-310 (`despesasQ`/`fixasQ`), ~440-461 (totais), ~617-683 (as duas `Section` de despesas) — os números de linha citados aqui são de uma versão anterior do arquivo e podem ter mudado com os commits desta sessão; usar como referência aproximada, confirmar contra o conteúdo real antes de editar.

- [ ] **Step 2: Substituir as duas queries por uma só**

Trocar `despesasQ` e `fixasQ` (e toda a lógica de `csStatusQ`/`syncCS` — sincronização Conta Simples, serviço não usado mais) por:

```javascript
const despesasUnifQ = useQuery({
  queryKey: ['despesas-unificadas', mesAno, activeAccount],
  queryFn: () => api.fechamento.despesasUnificadas({ competencia: mesAno, ...accountParams }),
})
```

Adicionar em `src/api.js`, dentro do bloco `fechamento: { ... }`:
```javascript
    despesasUnificadas: (params) => request(`/api/fechamento/despesas-unificadas?${new URLSearchParams(params)}`),
```

- [ ] **Step 3: Trocar os totais**

Onde hoje é `totalDespesas` e `totalFixas` (usados em `totalGeral`, `CostChart`, e nos cards de KPI), usar um único `totalDespesasUnificado = despesasUnifQ.data?.total || 0`. Ajustar `totalGeral` pra `totalCompras + totalFretes + totalMontagem + totalDespesasUnificado`. Ajustar `CostChart` pra receber uma única série "Despesas" no lugar das duas.

- [ ] **Step 4: Substituir as duas `Section` por uma só**

No lugar dos dois blocos `{/* Despesas Variáveis */}` e `{/* Custos Fixos Mensais */}` (incluindo o botão "Sincronizar Conta Simples" e o botão manual de adicionar despesa), uma única `Section` de despesas:
- Lista `despesasUnifQ.data?.despesas || []`, mostrando `categoria`, `descricao`, `valor`, e a origem (`fechamento_despesas` sem botão de editar/apagar — `editavel: false`; `contas_a_pagar` com um link "Editar em Contas a Pagar" que navega pra `/financeiro/contas-pagar` em vez de editar inline).
- Sem botão de "adicionar" nessa seção do Fechamento — lançamento novo só pela tela Contas a Pagar (link/atalho visível pra lá).

- [ ] **Step 5: Testar manualmente**

Run: `cd ~/Desktop/ml-seller-app && npm run dev`
Abrir `/fechamento`, trocar de mês, confirmar que a lista de despesas mistura os dois tipos (se houver dado de `fechamento_despesas` no mês escolhido) sem erro no console.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ml-seller-app
git add src/pages/Fechamento.jsx src/api.js
git commit -m "feat: Fechamento unifica despesas (Custos Fixos + Despesas Variáveis viram uma lista só)"
```

---

## Task 9: Verificação ao vivo

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Testar upload de um PDF real**

Com um PDF real de conta de luz/água/boleto em mãos, subir pela tela `/financeiro/contas-pagar` em produção ou local (com `OPENAI_API_KEY` configurada) e conferir se os campos sugeridos (`descricao`, `categoria`, `valor`, `vencimento`, `competencia`) batem com o documento.

- [ ] **Step 2: Testar o fallback de PDF sem texto**

Subir um PDF de imagem/escaneado (ou uma foto salva como PDF) e confirmar que o formulário abre em branco com o aviso, sem travar.

- [ ] **Step 3: Confirmar Fechamento e Fluxo de Caixa**

Lançar uma conta em Contas a Pagar com vencimento no mês corrente, e conferir: aparece no total do Fluxo de Caixa daquele mês; aparece na lista unificada do Fechamento na competência lançada.

- [ ] **Step 4: Rodar a suíte completa uma última vez**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/ -q`
Expected: mesma contagem de falhas pré-existentes documentada, nenhuma nova.
