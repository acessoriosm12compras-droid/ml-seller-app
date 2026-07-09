# Controle Fiscal (NF-e) — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar automaticamente todas as NF-e das contas M12 e YUSO — vendas via API fiscal do Mercado Livre, compras via SEFAZ (`NFeDistribuicaoDFe` + manifestação) — e exibi-las numa nova aba "NF/Fiscal" no frontend.

**Architecture:** Dois pipelines de ingestão independentes rodando como jobs de fundo no APScheduler já existente (repo `ml-seller-api`): um para vendas (reaproveita OAuth do `ml_client.py`, chama a API REST do ML), outro para compras (SOAP + certificado A1 em memória contra a SEFAZ, incluindo o fluxo de manifestação "Ciência da Operação" assinado digitalmente). Ambos convergem numa única tabela `notas_fiscais`. Uma nova rota Flask expõe os dados pra uma nova página React (`ml-seller-app`) sob a seção Financeiro.

**Tech Stack:** Flask, psycopg2 (Postgres/Supabase), `cryptography` (já instalado), `requests-pkcs12` (novo — mTLS em memória), `signxml` (novo — assinatura XMLDSig da manifestação), APScheduler (já instalado), React + Tailwind + React Query (frontend, padrão já usado).

## Global Constraints

- Toda chamada HTTP externa precisa de `timeout` explícito (padrão do projeto: 15s pra ML API — ver `ml_client.py`; usar o mesmo valor pra SEFAZ salvo indicação em contrário).
- Rotas nunca devolvem 502/503/504 — nenhuma chamada à SEFAZ ou ao ML pode acontecer de forma síncrona dentro de uma rota Flask; toda ingestão roda em job de fundo (APScheduler).
- Multi-conta: toda rota nova resolve a conta com o padrão `_conta()` de `routes/fechamento.py` (query param ou body para admin; não-admin travado na própria conta).
- Migrações: `migrations/NNN_nome.sql`, `CREATE TABLE IF NOT EXISTS`, índices com `IF NOT EXISTS`.
- Consultas usam `RealDictCursor`; conexões via `db.get_conn()` e `conn.close()` no `finally`.
- O certificado (.pfx) de cada CNPJ **nunca** é gravado em disco pelo nosso código — decodificado em memória a partir de `CERT_PFX_BASE64_{CONTA}` (env var), senha em `CERT_PFX_SENHA_{CONTA}`. **Nuance confirmada na Task 3**: a biblioteca `requests_pkcs12` grava internamente um arquivo temporário (protegido por senha aleatória de sessão, removido imediatamente no `finally`) durante o handshake mTLS — isso é uma limitação do módulo `ssl` padrão do Python (não tem API de carregar certificado a partir de bytes em memória) e é inevitável com qualquer biblioteca que use `ssl.SSLContext.load_cert_chain`. Aceito como risco residual — a alternativa (adapter customizado via pyOpenSSL) foi avaliada e descartada por complexidade/manutenção desproporcionais ao ganho.
- Nenhum log ou mensagem de exceção deve interpolar o conteúdo de `CERT_PFX_BASE64_*` / `CERT_PFX_SENHA_*`.
- Frontend: sem sistema de toast — feedback por banner inline; toda chamada de API usa o wrapper `request()` de `src/api.js`; páginas usam `activeAccount` do `AuthContext`.
- A URL/WSDL exata dos webservices da SEFAZ (Ambiente Nacional, produção) deve ser confirmada na documentação oficial (`nfe.fazenda.gov.br` → Portal Nacional, Nota Técnica 2014.002) no momento da implementação da Task 3 — o código abaixo usa a URL documentada no momento da escrita deste plano, mas o implementador deve confirmar antes do primeiro teste ao vivo.

---

## Task 1: Migração `notas_fiscais` + `nfe_sync_state` e funções de acesso em `db.py`

**Files:**
- Create: `migrations/020_notas_fiscais.sql`
- Modify: `db.py` (adicionar funções no final do arquivo, mesmo padrão de `_ensure_evidencia`/`save_estudo`)
- Test: `tests/test_db_notas_fiscais.py`

**Interfaces:**
- Produces (usado pelas Tasks 5, 6, 9):
  - `db.upsert_nota_fiscal(dados: dict) -> None` — `dados` tem as chaves: `chave_acesso`, `conta_ml`, `tipo`, `fonte`, `cnpj_emitente`, `cnpj_destinatario`, `valor_total`, `data_emissao`, `natureza_operacao`, `status`, `xml_raw` (pode ser `None`), `dados_estruturados` (dict, pode ser `{}`), `nsu` (pode ser `None`), `manifestacao_status`. Faz `INSERT ... ON CONFLICT (chave_acesso) DO UPDATE` (dedupe).
  - `db.get_nota_por_chave(chave_acesso: str) -> dict | None`
  - `db.atualizar_status_nota(chave_acesso: str, status: str) -> None`
  - `db.list_notas_fiscais(conta_ml=None, tipo=None, data_de=None, data_ate=None, limit=200) -> list[dict]`
  - `db.get_nfe_sync_state(conta_ml: str) -> dict | None` — `{"conta_ml", "ultimo_nsu", "atualizado_em", "ultimo_erro"}`
  - `db.save_nfe_sync_state(conta_ml: str, ultimo_nsu: str, ultimo_erro: str | None = None) -> None` — upsert por `conta_ml`.

- [ ] **Step 1: Escrever a migração**

```sql
-- migrations/020_notas_fiscais.sql
-- Controle fiscal (NF-e): armazena notas de venda (API fiscal do Mercado Livre)
-- e de compra (SEFAZ NFeDistribuicaoDFe) dos CNPJs M12 e YUSO.
CREATE TABLE IF NOT EXISTS notas_fiscais (
    id                  SERIAL       PRIMARY KEY,
    chave_acesso        TEXT         NOT NULL,
    conta_ml            TEXT         NOT NULL,
    tipo                TEXT         NOT NULL,          -- 'entrada' | 'saida'
    fonte               TEXT         NOT NULL,          -- 'sefaz_distribuicao' | 'ml_fiscal_api'
    cnpj_emitente       TEXT,
    cnpj_destinatario   TEXT,
    valor_total         NUMERIC(15,2),
    data_emissao        TIMESTAMPTZ,
    natureza_operacao   TEXT,
    status              TEXT         NOT NULL DEFAULT 'autorizada',
    xml_raw             TEXT,
    dados_estruturados  JSONB        NOT NULL DEFAULT '{}'::jsonb,
    nsu                 TEXT,
    manifestacao_status TEXT         NOT NULL DEFAULT 'nao_aplicavel',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notas_fiscais_chave
    ON notas_fiscais(chave_acesso);

CREATE INDEX IF NOT EXISTS idx_notas_fiscais_conta_data
    ON notas_fiscais(conta_ml, data_emissao);

CREATE TABLE IF NOT EXISTS nfe_sync_state (
    conta_ml     TEXT        PRIMARY KEY,
    ultimo_nsu   TEXT        NOT NULL DEFAULT '0',
    atualizado_em TIMESTAMPTZ,
    ultimo_erro  TEXT
);
```

- [ ] **Step 2: Rodar a migração localmente e confirmar**

Run: `cd ~/Desktop/ml-seller-api && set -a && source runtime.env && set +a && python3 -c "import db; db.init_db()"` (o projeto aplica migrações de `migrations/` na inicialização — confirmar em `db.py::init_db` como as migrações são carregadas antes de assumir esse comando; se `init_db` não varrer o diretório automaticamente, aplicar a migração diretamente via `psql`/`execute_sql` do Supabase MCP).
Expected: sem erro; tabelas `notas_fiscais` e `nfe_sync_state` existentes (conferir com `\d notas_fiscais` no psql ou `list_tables` do MCP do Supabase).

- [ ] **Step 3: Escrever os testes das funções de acesso (falham antes da implementação)**

```python
# tests/test_db_notas_fiscais.py
from unittest.mock import MagicMock, patch
import db


def _fake_conn_cursor():
    """Cria um conn/cursor mockados, no padrão dos demais testes de db.py."""
    cur = MagicMock()
    conn = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    return conn, cur


def test_upsert_nota_fiscal_faz_insert_on_conflict():
    conn, cur = _fake_conn_cursor()
    with patch("db.get_conn", return_value=conn):
        db.upsert_nota_fiscal({
            "chave_acesso": "35" + "0" * 42,
            "conta_ml": "M12",
            "tipo": "entrada",
            "fonte": "sefaz_distribuicao",
            "cnpj_emitente": "11111111000111",
            "cnpj_destinatario": "22222222000122",
            "valor_total": 150.50,
            "data_emissao": "2026-07-01T10:00:00-03:00",
            "natureza_operacao": "Venda",
            "status": "autorizada",
            "xml_raw": "<xml/>",
            "dados_estruturados": {"itens": []},
            "nsu": "123",
            "manifestacao_status": "xml_completo",
        })
    sql = cur.execute.call_args[0][0]
    assert "ON CONFLICT (chave_acesso)" in sql
    assert "INSERT INTO notas_fiscais" in sql
    conn.commit.assert_called_once()
    conn.close.assert_called_once()


def test_get_nota_por_chave_retorna_none_se_nao_existe():
    conn, cur = _fake_conn_cursor()
    cur.fetchone.return_value = None
    with patch("db.get_conn", return_value=conn):
        assert db.get_nota_por_chave("chave-inexistente") is None


def test_atualizar_status_nota_seta_status():
    conn, cur = _fake_conn_cursor()
    with patch("db.get_conn", return_value=conn):
        db.atualizar_status_nota("chave-x", "cancelada")
    sql = cur.execute.call_args[0][0]
    params = cur.execute.call_args[0][1]
    assert "UPDATE notas_fiscais" in sql
    assert params == ("cancelada", "chave-x")


def test_get_nfe_sync_state_retorna_dict():
    conn, cur = _fake_conn_cursor()
    cur.fetchone.return_value = {"conta_ml": "M12", "ultimo_nsu": "500",
                                  "atualizado_em": None, "ultimo_erro": None}
    with patch("db.get_conn", return_value=conn):
        state = db.get_nfe_sync_state("M12")
    assert state["ultimo_nsu"] == "500"


def test_save_nfe_sync_state_upsert():
    conn, cur = _fake_conn_cursor()
    with patch("db.get_conn", return_value=conn):
        db.save_nfe_sync_state("M12", "600", ultimo_erro=None)
    sql = cur.execute.call_args[0][0]
    assert "ON CONFLICT (conta_ml)" in sql
    conn.commit.assert_called_once()
```

- [ ] **Step 4: Rodar os testes e confirmar que falham**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_db_notas_fiscais.py -v`
Expected: FAIL — `AttributeError: module 'db' has no attribute 'upsert_nota_fiscal'` (e equivalentes para as demais funções).

- [ ] **Step 5: Implementar as funções em `db.py`**

Adicionar ao final de `db.py` (mesmo padrão de conexão/commit/close das funções existentes como `save_estudo`):

```python
def upsert_nota_fiscal(dados):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO notas_fiscais (
                    chave_acesso, conta_ml, tipo, fonte, cnpj_emitente,
                    cnpj_destinatario, valor_total, data_emissao, natureza_operacao,
                    status, xml_raw, dados_estruturados, nsu, manifestacao_status
                ) VALUES (
                    %(chave_acesso)s, %(conta_ml)s, %(tipo)s, %(fonte)s, %(cnpj_emitente)s,
                    %(cnpj_destinatario)s, %(valor_total)s, %(data_emissao)s, %(natureza_operacao)s,
                    %(status)s, %(xml_raw)s, %(dados_estruturados)s, %(nsu)s, %(manifestacao_status)s
                )
                ON CONFLICT (chave_acesso) DO UPDATE SET
                    status = EXCLUDED.status,
                    xml_raw = COALESCE(EXCLUDED.xml_raw, notas_fiscais.xml_raw),
                    dados_estruturados = CASE WHEN EXCLUDED.dados_estruturados = '{}'::jsonb
                                              THEN notas_fiscais.dados_estruturados
                                              ELSE EXCLUDED.dados_estruturados END,
                    manifestacao_status = EXCLUDED.manifestacao_status
            """, {**dados, "dados_estruturados": Json(dados.get("dados_estruturados") or {})})
        conn.commit()
    finally:
        conn.close()


def get_nota_por_chave(chave_acesso):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM notas_fiscais WHERE chave_acesso = %s", (chave_acesso,))
            return cur.fetchone()
    finally:
        conn.close()


def atualizar_status_nota(chave_acesso, status):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE notas_fiscais SET status = %s WHERE chave_acesso = %s",
                (status, chave_acesso),
            )
        conn.commit()
    finally:
        conn.close()


def list_notas_fiscais(conta_ml=None, tipo=None, data_de=None, data_ate=None, limit=200):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            clauses, params = [], {}
            if conta_ml:
                clauses.append("conta_ml = %(conta_ml)s")
                params["conta_ml"] = conta_ml
            if tipo:
                clauses.append("tipo = %(tipo)s")
                params["tipo"] = tipo
            if data_de:
                clauses.append("data_emissao >= %(data_de)s")
                params["data_de"] = data_de
            if data_ate:
                clauses.append("data_emissao <= %(data_ate)s")
                params["data_ate"] = data_ate
            where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
            params["limit"] = limit
            cur.execute(f"""
                SELECT * FROM notas_fiscais {where}
                ORDER BY data_emissao DESC LIMIT %(limit)s
            """, params)
            return cur.fetchall()
    finally:
        conn.close()


def get_nfe_sync_state(conta_ml):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM nfe_sync_state WHERE conta_ml = %s", (conta_ml,))
            return cur.fetchone()
    finally:
        conn.close()


def save_nfe_sync_state(conta_ml, ultimo_nsu, ultimo_erro=None):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO nfe_sync_state (conta_ml, ultimo_nsu, atualizado_em, ultimo_erro)
                VALUES (%s, %s, NOW(), %s)
                ON CONFLICT (conta_ml) DO UPDATE SET
                    ultimo_nsu = EXCLUDED.ultimo_nsu,
                    atualizado_em = NOW(),
                    ultimo_erro = EXCLUDED.ultimo_erro
            """, (conta_ml, ultimo_nsu, ultimo_erro))
        conn.commit()
    finally:
        conn.close()
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_db_notas_fiscais.py -v`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add migrations/020_notas_fiscais.sql db.py tests/test_db_notas_fiscais.py
git commit -m "feat: tabela notas_fiscais + nfe_sync_state e funções de acesso"
```

---

## Task 2: Serviço de certificado digital (`nfe_cert_service.py`)

**Files:**
- Create: `services/nfe_cert_service.py`
- Test: `tests/test_nfe_cert_service.py`
- Modify: `requirements.txt` (adicionar `requests-pkcs12`)

**Interfaces:**
- Consumes: variáveis de ambiente `CERT_PFX_BASE64_{CONTA}` / `CERT_PFX_SENHA_{CONTA}` (ainda não configuradas em produção nesta task — serão adicionadas manualmente no EasyPanel antes da Task 8/verificação ao vivo).
- Produces (usado pelas Tasks 3 e 4):
  - `carregar_certificado(conta_ml: str) -> tuple[bytes, bytes]` — retorna `(cert_pem, key_pem)`. Levanta `ValueError` com mensagem genérica (sem vazar o conteúdo do certificado/senha) se a env var não existir ou a senha estiver errada.
  - `validade_certificado(conta_ml: str) -> datetime` — data de expiração (`not_valid_after`, timezone-aware).
  - `dias_para_vencer(conta_ml: str) -> int` — pode ser negativo se já venceu.

- [ ] **Step 1: Escrever os testes (com um certificado autoassinado gerado no próprio teste — sem depender de arquivo externo)**

```python
# tests/test_nfe_cert_service.py
import base64
import datetime
from unittest.mock import patch
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

import services.nfe_cert_service as cert_service


def _gerar_pfx_teste(dias_validade=365, senha=b"senha123"):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    nome = x509.Name([NameOID.COMMON_NAME, x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "TESTE LTDA:11111111000111")
    ])][1])
    agora = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(nome).issuer_name(nome)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(agora - datetime.timedelta(days=1))
        .not_valid_after(agora + datetime.timedelta(days=dias_validade))
        .sign(key, hashes.SHA256())
    )
    pfx_bytes = pkcs12.serialize_key_and_certificates(
        name=b"teste", key=key, cert=cert, cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(senha),
    )
    return base64.b64encode(pfx_bytes).decode(), senha.decode()


def test_carregar_certificado_decodifica_pem_valido(monkeypatch):
    pfx_b64, senha = _gerar_pfx_teste()
    monkeypatch.setenv("CERT_PFX_BASE64_M12", pfx_b64)
    monkeypatch.setenv("CERT_PFX_SENHA_M12", senha)
    cert_pem, key_pem = cert_service.carregar_certificado("M12")
    assert b"BEGIN CERTIFICATE" in cert_pem
    assert b"PRIVATE KEY" in key_pem


def test_carregar_certificado_sem_env_var_levanta_erro(monkeypatch):
    monkeypatch.delenv("CERT_PFX_BASE64_YUSO", raising=False)
    try:
        cert_service.carregar_certificado("YUSO")
        assert False, "deveria ter levantado ValueError"
    except ValueError as e:
        assert "CERT_PFX_BASE64_YUSO" in str(e)
        assert "senha" not in str(e).lower()  # nunca vaza a senha na mensagem


def test_validade_certificado_retorna_not_valid_after(monkeypatch):
    pfx_b64, senha = _gerar_pfx_teste(dias_validade=10)
    monkeypatch.setenv("CERT_PFX_BASE64_M12", pfx_b64)
    monkeypatch.setenv("CERT_PFX_SENHA_M12", senha)
    validade = cert_service.validade_certificado("M12")
    dias = (validade - datetime.datetime.now(datetime.timezone.utc)).days
    assert 8 <= dias <= 10


def test_dias_para_vencer_calcula_diferenca(monkeypatch):
    pfx_b64, senha = _gerar_pfx_teste(dias_validade=25)
    monkeypatch.setenv("CERT_PFX_BASE64_M12", pfx_b64)
    monkeypatch.setenv("CERT_PFX_SENHA_M12", senha)
    dias = cert_service.dias_para_vencer("M12")
    assert 23 <= dias <= 25
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_nfe_cert_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.nfe_cert_service'`.

- [ ] **Step 3: Implementar**

```python
# services/nfe_cert_service.py
"""Carrega o certificado A1 (.pfx) de cada CNPJ a partir de variáveis de
ambiente, decodificando em memória — o .pfx nunca é gravado em disco."""
import base64
import os
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import pkcs12


def _env(conta_ml, sufixo):
    return os.environ.get(f"CERT_PFX_{sufixo}_{conta_ml}")


def _carregar_pkcs12(conta_ml):
    pfx_b64 = _env(conta_ml, "BASE64")
    senha = _env(conta_ml, "SENHA")
    if not pfx_b64:
        raise ValueError(f"CERT_PFX_BASE64_{conta_ml} não configurada")
    if not senha:
        raise ValueError(f"CERT_PFX_SENHA_{conta_ml} não configurada")
    try:
        pfx_bytes = base64.b64decode(pfx_b64)
        key, cert, _ = pkcs12.load_key_and_certificates(pfx_bytes, senha.encode())
    except Exception:
        # nunca interpola a exceção original — pode conter detalhes do pfx/senha
        raise ValueError(f"certificado de {conta_ml} inválido ou senha incorreta")
    return key, cert


def carregar_certificado(conta_ml):
    """Retorna (cert_pem: bytes, key_pem: bytes) prontos pra uso em mTLS."""
    key, cert = _carregar_pkcs12(conta_ml)
    cert_pem = cert.public_bytes(serialization.Encoding.PEM)
    key_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return cert_pem, key_pem


def validade_certificado(conta_ml):
    _, cert = _carregar_pkcs12(conta_ml)
    return cert.not_valid_after_utc


def dias_para_vencer(conta_ml):
    import datetime
    validade = validade_certificado(conta_ml)
    agora = datetime.datetime.now(datetime.timezone.utc)
    return (validade - agora).days
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_nfe_cert_service.py -v`
Expected: 4 passed.

- [ ] **Step 5: Adicionar dependência nova**

Adicionar ao `requirements.txt`:
```
requests-pkcs12==1.25
signxml==3.2.2
```
(`cryptography` já está em `requirements.txt`.)

Run: `cd ~/Desktop/ml-seller-api && pip install -r requirements.txt`
Expected: instala sem erro.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add services/nfe_cert_service.py tests/test_nfe_cert_service.py requirements.txt
git commit -m "feat: serviço de carregamento do certificado A1 em memória"
```

---

## Task 3: Cliente SOAP da SEFAZ — `NFeDistribuicaoDFe` (`nfe_sefaz_service.py`)

**Files:**
- Create: `services/nfe_sefaz_service.py`
- Test: `tests/test_nfe_sefaz_service.py`

**Interfaces:**
- Consumes: `nfe_cert_service.carregar_certificado(conta_ml)` (Task 2).
- Produces (usado pela Task 5):
  - `consultar_dist_nsu(conta_ml: str, cnpj: str, ultimo_nsu: str) -> dict` — retorna `{"cStat": str, "ultNSU": str, "maxNSU": str, "docs": list[dict]}`. Cada item de `docs` é `{"tipo": "resNFe"|"resEvento"|"procNFe", "nsu": str, "chave_acesso": str|None, "xml": str}` (`xml` é o XML decodificado do `docZip`, cru — quem interpreta o conteúdo é a Task 5).

**Antes de implementar**: confirmar a URL de produção do webservice `NFeDistribuicaoDFe` no Portal Nacional da NF-e (`nfe.fazenda.gov.br` → "Consulta Schemas/WebServices" → Ambiente Nacional). A URL usada abaixo (`https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx`) é a documentada na Nota Técnica 2014.002 — reconfirmar antes do Step 6 (teste ao vivo).

- [ ] **Step 1: Escrever o teste do parser de resposta (não depende de rede)**

```python
# tests/test_nfe_sefaz_service.py
from unittest.mock import patch, MagicMock
import base64
import gzip
import services.nfe_sefaz_service as sefaz


def _doc_zip(xml_str):
    return base64.b64encode(gzip.compress(xml_str.encode("utf-8"))).decode()


def _envelope_resposta(cstat="138", ult_nsu="100", max_nsu="105", docs_xml=None):
    docs_xml = docs_xml or []
    docs = "".join(
        f'<docZip NSU="{100+i+1}" schema="resNFe_v1.01.xsd">{_doc_zip(x)}</docZip>'
        for i, x in enumerate(docs_xml)
    )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/envelope/">
  <soap:Body>
    <nfeDistDFeInteresseResult>
      <retDistDFeInt>
        <cStat>{cstat}</cStat>
        <ultNSU>{ult_nsu}</ultNSU>
        <maxNSU>{max_nsu}</maxNSU>
        <loteDistDFeInt>{docs}</loteDistDFeInt>
      </retDistDFeInt>
    </nfeDistDFeInteresseResult>
  </soap:Body>
</soap:Envelope>"""


def test_consultar_dist_nsu_parseia_resumo_de_nota():
    resumo_xml = '<resNFe><chNFe>35260711111111000111550010000000011000000012</chNFe></resNFe>'
    resposta = _envelope_resposta(docs_xml=[resumo_xml])
    fake_resp = MagicMock(status_code=200, text=resposta)
    with patch("services.nfe_sefaz_service._post_soap", return_value=fake_resp), \
         patch("services.nfe_cert_service.carregar_certificado", return_value=(b"cert", b"key")):
        resultado = sefaz.consultar_dist_nsu("M12", "11111111000111", "100")

    assert resultado["cStat"] == "138"
    assert resultado["ultNSU"] == "100"
    assert resultado["maxNSU"] == "105"
    assert len(resultado["docs"]) == 1
    assert resultado["docs"][0]["tipo"] == "resNFe"
    assert resultado["docs"][0]["chave_acesso"] == "35260711111111000111550010000000011000000012"


def test_consultar_dist_nsu_sem_documentos_cstat_137():
    resposta = _envelope_resposta(cstat="137", ult_nsu="100", max_nsu="100", docs_xml=[])
    fake_resp = MagicMock(status_code=200, text=resposta)
    with patch("services.nfe_sefaz_service._post_soap", return_value=fake_resp), \
         patch("services.nfe_cert_service.carregar_certificado", return_value=(b"cert", b"key")):
        resultado = sefaz.consultar_dist_nsu("M12", "11111111000111", "100")
    assert resultado["cStat"] == "137"
    assert resultado["docs"] == []


def test_consultar_dist_nsu_classifica_proc_nfe_e_evento():
    proc_xml = '<procNFe><NFe><infNFe Id="NFe35260711111111000111550010000000011000000012"/></NFe></procNFe>'
    evento_xml = '<resEvento><chNFe>35260711111111000111550010000000022000000023</chNFe><tpEvento>110111</tpEvento></resEvento>'
    resposta = _envelope_resposta(docs_xml=[proc_xml, evento_xml])
    fake_resp = MagicMock(status_code=200, text=resposta)
    with patch("services.nfe_sefaz_service._post_soap", return_value=fake_resp), \
         patch("services.nfe_cert_service.carregar_certificado", return_value=(b"cert", b"key")):
        resultado = sefaz.consultar_dist_nsu("M12", "11111111000111", "100")
    tipos = [d["tipo"] for d in resultado["docs"]]
    assert tipos == ["procNFe", "resEvento"]
    assert resultado["docs"][0]["chave_acesso"] == "35260711111111000111550010000000011000000012"
    assert resultado["docs"][1]["chave_acesso"] == "35260711111111000111550010000000022000000023"
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_nfe_sefaz_service.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

```python
# services/nfe_sefaz_service.py
"""Cliente do webservice NFeDistribuicaoDFe (SEFAZ, Ambiente Nacional) —
usado só pro lado de compras. mTLS com o certificado A1 do CNPJ, em memória."""
import base64
import gzip
import re
import requests_pkcs12
import services.nfe_cert_service as cert_service

# URL do Ambiente Nacional (NT 2014.002) — reconfirmar contra a documentação
# oficial da SEFAZ antes de rodar contra produção pela primeira vez.
URL_DIST_DFE = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"

_TP_AMB_PRODUCAO = "1"
_C_UF_AUTOR = "91"  # Ambiente Nacional (SVAN) — não é um UF real


def _montar_envelope(cnpj, ultimo_nsu):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/envelope/">
  <soap:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>{_TP_AMB_PRODUCAO}</tpAmb>
          <cUFAutor>{_C_UF_AUTOR}</cUFAutor>
          <CNPJ>{cnpj}</CNPJ>
          <distNSU><ultNSU>{ultimo_nsu.zfill(15)}</ultNSU></distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap:Body>
</soap:Envelope>"""


def _post_soap(conta_ml, envelope):
    cert_pem, key_pem = cert_service.carregar_certificado(conta_ml)
    return requests_pkcs12.post(
        URL_DIST_DFE,
        data=envelope.encode("utf-8"),
        headers={"Content-Type": "application/soap+xml; charset=utf-8"},
        pkcs12_data=None, pkcs12_password=None,
        # cert_pem/key_pem já extraídos em memória — usa o adapter de PEM,
        # não o de pkcs12_data direto (evita decodificar o .pfx duas vezes)
        cert=(cert_pem, key_pem),
        timeout=30,
    )


def _extrair_tag(xml, tag):
    m = re.search(fr"<{tag}>(.*?)</{tag}>", xml, re.DOTALL)
    return m.group(1) if m else None


def _classificar_doc(xml_decodificado):
    if "<resNFe>" in xml_decodificado:
        tipo = "resNFe"
    elif "<procNFe>" in xml_decodificado:
        tipo = "procNFe"
    elif "<resEvento>" in xml_decodificado:
        tipo = "resEvento"
    else:
        tipo = "desconhecido"

    if tipo == "procNFe":
        m = re.search(r'Id="NFe(\d{44})"', xml_decodificado)
        chave = m.group(1) if m else None
    else:
        chave = _extrair_tag(xml_decodificado, "chNFe")

    return tipo, chave


def consultar_dist_nsu(conta_ml, cnpj, ultimo_nsu):
    envelope = _montar_envelope(cnpj, ultimo_nsu)
    resp = _post_soap(conta_ml, envelope)
    resp_text = resp.text

    cstat = _extrair_tag(resp_text, "cStat")
    ult_nsu = _extrair_tag(resp_text, "ultNSU")
    max_nsu = _extrair_tag(resp_text, "maxNSU")

    docs = []
    for m in re.finditer(r'<docZip NSU="(\d+)"[^>]*>(.*?)</docZip>', resp_text, re.DOTALL):
        nsu_doc, conteudo_b64 = m.group(1), m.group(2)
        xml_decodificado = gzip.decompress(base64.b64decode(conteudo_b64)).decode("utf-8")
        tipo, chave = _classificar_doc(xml_decodificado)
        docs.append({"tipo": tipo, "nsu": nsu_doc, "chave_acesso": chave, "xml": xml_decodificado})

    return {"cStat": cstat, "ultNSU": ult_nsu, "maxNSU": max_nsu, "docs": docs}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_nfe_sefaz_service.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add services/nfe_sefaz_service.py tests/test_nfe_sefaz_service.py
git commit -m "feat: cliente SOAP do NFeDistribuicaoDFe (consulta por NSU)"
```

- [ ] **Step 6 (não commitado — só verificação manual pontual, feita de novo com força total na Task 11): confirmar a URL do webservice**

Antes da verificação ao vivo final (Task 11), abrir a documentação oficial do Portal Nacional da NF-e e confirmar `URL_DIST_DFE` acima está correta pro Ambiente Nacional de produção. Se divergir, corrigir a constante nesta task antes de prosseguir.

---

## Task 4: Manifestação "Ciência da Operação" (`nfe_manifestacao_service.py`)

**Files:**
- Create: `services/nfe_manifestacao_service.py`
- Test: `tests/test_nfe_manifestacao_service.py`

**Interfaces:**
- Consumes: `nfe_cert_service.carregar_certificado(conta_ml)` (Task 2).
- Produces (usado pela Task 5):
  - `enviar_ciencia_operacao(conta_ml: str, cnpj: str, chave_acesso: str) -> dict` — retorna `{"sucesso": bool, "cstat": str, "ja_manifestada": bool}`. `ja_manifestada=True` quando `cStat == "573"` (Duplicidade de Evento) — tratado como sucesso idempotente, não como erro.

- [ ] **Step 1: Escrever os testes**

```python
# tests/test_nfe_manifestacao_service.py
from unittest.mock import patch, MagicMock
import services.nfe_manifestacao_service as manifestacao


def _resposta(cstat, xmotivo="Evento registrado e vinculado a NF-e"):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/envelope/">
  <soap:Body>
    <nfeRecepcaoEventoResult>
      <retEnvEvento>
        <retEvento>
          <infEvento>
            <cStat>{cstat}</cStat>
            <xMotivo>{xmotivo}</xMotivo>
          </infEvento>
        </retEvento>
      </retEnvEvento>
    </nfeRecepcaoEventoResult>
  </soap:Body>
</soap:Envelope>"""


def test_enviar_ciencia_operacao_sucesso():
    fake_resp = MagicMock(status_code=200, text=_resposta("135"))
    with patch("services.nfe_manifestacao_service._assinar_evento", return_value="<evento-assinado/>"), \
         patch("services.nfe_manifestacao_service._post_soap", return_value=fake_resp), \
         patch("services.nfe_cert_service.carregar_certificado", return_value=(b"cert", b"key")):
        resultado = manifestacao.enviar_ciencia_operacao("M12", "11111111000111", "35" + "0" * 42)
    assert resultado == {"sucesso": True, "cstat": "135", "ja_manifestada": False}


def test_enviar_ciencia_operacao_duplicidade_e_idempotente():
    fake_resp = MagicMock(status_code=200, text=_resposta("573", "Duplicidade de Evento"))
    with patch("services.nfe_manifestacao_service._assinar_evento", return_value="<evento-assinado/>"), \
         patch("services.nfe_manifestacao_service._post_soap", return_value=fake_resp), \
         patch("services.nfe_cert_service.carregar_certificado", return_value=(b"cert", b"key")):
        resultado = manifestacao.enviar_ciencia_operacao("M12", "11111111000111", "35" + "0" * 42)
    assert resultado == {"sucesso": True, "cstat": "573", "ja_manifestada": True}


def test_enviar_ciencia_operacao_erro_real_nao_e_sucesso():
    fake_resp = MagicMock(status_code=200, text=_resposta("280", "Erro de assinatura"))
    with patch("services.nfe_manifestacao_service._assinar_evento", return_value="<evento-assinado/>"), \
         patch("services.nfe_manifestacao_service._post_soap", return_value=fake_resp), \
         patch("services.nfe_cert_service.carregar_certificado", return_value=(b"cert", b"key")):
        resultado = manifestacao.enviar_ciencia_operacao("M12", "11111111000111", "35" + "0" * 42)
    assert resultado == {"sucesso": False, "cstat": "280", "ja_manifestada": False}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_nfe_manifestacao_service.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

```python
# services/nfe_manifestacao_service.py
"""Envia o evento "Ciência da Operação" (210210) pro webservice
RecepcaoEvento da SEFAZ — obrigatório pra liberar o XML completo de uma
nota de compra. O XML do evento precisa ser assinado (XMLDSig) com o
mesmo certificado A1 do CNPJ."""
import datetime
import requests_pkcs12
from signxml import XMLSigner, methods
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from cryptography import x509
import services.nfe_cert_service as cert_service

URL_RECEPCAO_EVENTO = "https://www1.nfe.fazenda.gov.br/NFeRecepcaoEvento/NFeRecepcaoEvento.asmx"

_TP_EVENTO_CIENCIA = "210210"
_DESC_EVENTO = "Ciencia da Operacao"


def _montar_xml_evento(cnpj, chave_acesso, sequencia=1):
    agora = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    id_evento = f"ID{_TP_EVENTO_CIENCIA}{chave_acesso}{str(sequencia).zfill(2)}"
    return f"""<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <infEvento Id="{id_evento}">
    <cOrgao>91</cOrgao>
    <tpAmb>1</tpAmb>
    <CNPJ>{cnpj}</CNPJ>
    <chNFe>{chave_acesso}</chNFe>
    <dhEvento>{agora}</dhEvento>
    <tpEvento>{_TP_EVENTO_CIENCIA}</tpEvento>
    <nSeqEvento>{sequencia}</nSeqEvento>
    <verEvento>1.00</verEvento>
    <detEvento versao="1.00">
      <descEvento>{_DESC_EVENTO}</descEvento>
    </detEvento>
  </infEvento>
</evento>"""


def _assinar_evento(conta_ml, xml_evento):
    cert_pem, key_pem = cert_service.carregar_certificado(conta_ml)
    key = load_pem_private_key(key_pem, password=None)
    cert = x509.load_pem_x509_certificate(cert_pem)
    signer = XMLSigner(method=methods.enveloped, c14n_algorithm="http://www.w3.org/2001/10/xml-exc-c14n#")
    signed_root = signer.sign(xml_evento.encode("utf-8"), key=key, cert=cert)
    return signed_root


def _post_soap(conta_ml, envelope):
    cert_pem, key_pem = cert_service.carregar_certificado(conta_ml)
    return requests_pkcs12.post(
        URL_RECEPCAO_EVENTO,
        data=envelope, headers={"Content-Type": "application/soap+xml; charset=utf-8"},
        cert=(cert_pem, key_pem), timeout=30,
    )


def enviar_ciencia_operacao(conta_ml, cnpj, chave_acesso):
    xml_evento = _montar_xml_evento(cnpj, chave_acesso)
    xml_assinado = _assinar_evento(conta_ml, xml_evento)
    envelope = f"""<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/envelope/">
  <soap:Body>
    <nfeRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento">
      <nfeDadosMsg>{xml_assinado}</nfeDadosMsg>
    </nfeRecepcaoEvento>
  </soap:Body>
</soap:Envelope>"""
    resp = _post_soap(conta_ml, envelope)

    import re
    m_stat = re.search(r"<cStat>(\d+)</cStat>", resp.text)
    cstat = m_stat.group(1) if m_stat else None

    if cstat == "573":
        return {"sucesso": True, "cstat": cstat, "ja_manifestada": True}
    if cstat in ("135", "136"):  # 135=vinculado, 136=vinculado sem match de chave
        return {"sucesso": True, "cstat": cstat, "ja_manifestada": False}
    return {"sucesso": False, "cstat": cstat, "ja_manifestada": False}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_nfe_manifestacao_service.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add services/nfe_manifestacao_service.py tests/test_nfe_manifestacao_service.py
git commit -m "feat: manifestação Ciência da Operação (assinada) pro RecepcaoEvento"
```

---

## Task 5: Orquestração da ingestão de compras (`nfe_compras_service.py`)

**Files:**
- Create: `services/nfe_compras_service.py`
- Test: `tests/test_nfe_compras_service.py`

**Interfaces:**
- Consumes: `db.get_nfe_sync_state`, `db.save_nfe_sync_state`, `db.upsert_nota_fiscal`, `db.atualizar_status_nota`, `db.get_nota_por_chave` (Task 1); `nfe_sefaz_service.consultar_dist_nsu` (Task 3); `nfe_manifestacao_service.enviar_ciencia_operacao` (Task 4).
- Produces (usado pela Task 8 — job do scheduler):
  - `sincronizar_compras(conta_ml: str, cnpj: str) -> dict` — `{"notas_novas": int, "manifestadas": int, "canceladas": int, "cstat_final": str, "erro": str | None}`. Nunca levanta exceção pra fora — captura e devolve em `erro`.

- [ ] **Step 1: Escrever os testes**

```python
# tests/test_nfe_compras_service.py
from unittest.mock import patch, MagicMock
import services.nfe_compras_service as compras


def _resumo(chave):
    return {"tipo": "resNFe", "nsu": "101", "chave_acesso": chave, "xml": f"<resNFe><chNFe>{chave}</chNFe></resNFe>"}


def _proc(chave):
    return {"tipo": "procNFe", "nsu": "102", "chave_acesso": chave,
            "xml": f'<procNFe><NFe><infNFe Id="NFe{chave}"><ide><dhEmi>2026-07-01T10:00:00-03:00</dhEmi><natOp>Compra</natOp></ide>'
                    f'<emit><CNPJ>99999999000199</CNPJ></emit><dest><CNPJ>11111111000111</CNPJ></dest>'
                    f'<total><ICMSTot><vNF>250.00</vNF></ICMSTot></total></infNFe></NFe></procNFe>'}


def _evento_cancelamento(chave):
    return {"tipo": "resEvento", "nsu": "103", "chave_acesso": chave,
            "xml": f"<resEvento><chNFe>{chave}</chNFe><tpEvento>110111</tpEvento></resEvento>"}


def test_sincronizar_compras_drena_ate_max_nsu_e_manifesta_resumo_novo():
    chave = "35" + "0" * 42
    respostas = [
        {"cStat": "138", "ultNSU": "101", "maxNSU": "102", "docs": [_resumo(chave)]},
        {"cStat": "137", "ultNSU": "102", "maxNSU": "102", "docs": []},
    ]
    with patch("services.nfe_compras_service.db.get_nfe_sync_state", return_value=None), \
         patch("services.nfe_compras_service.db.get_nota_por_chave", return_value=None), \
         patch("services.nfe_compras_service.sefaz.consultar_dist_nsu", side_effect=respostas), \
         patch("services.nfe_compras_service.manifestacao.enviar_ciencia_operacao",
               return_value={"sucesso": True, "cstat": "135", "ja_manifestada": False}) as mock_manifesta, \
         patch("services.nfe_compras_service.db.upsert_nota_fiscal") as mock_upsert, \
         patch("services.nfe_compras_service.db.save_nfe_sync_state") as mock_save_state:
        resultado = compras.sincronizar_compras("M12", "11111111000111")

    assert resultado["notas_novas"] == 1
    assert resultado["manifestadas"] == 1
    assert resultado["erro"] is None
    mock_manifesta.assert_called_once_with("M12", "11111111000111", chave)
    mock_upsert.assert_called_once()
    assert mock_upsert.call_args[0][0]["manifestacao_status"] == "ciencia_enviada"
    mock_save_state.assert_called_with("M12", "102", ultimo_erro=None)


def test_sincronizar_compras_proc_nfe_completo_marca_xml_completo():
    chave = "35" + "1" * 42
    respostas = [
        {"cStat": "138", "ultNSU": "101", "maxNSU": "101", "docs": [_proc(chave)]},
    ]
    with patch("services.nfe_compras_service.db.get_nfe_sync_state", return_value=None), \
         patch("services.nfe_compras_service.db.get_nota_por_chave", return_value=None), \
         patch("services.nfe_compras_service.sefaz.consultar_dist_nsu", side_effect=respostas), \
         patch("services.nfe_compras_service.db.upsert_nota_fiscal") as mock_upsert, \
         patch("services.nfe_compras_service.db.save_nfe_sync_state"):
        resultado = compras.sincronizar_compras("M12", "11111111000111")

    assert resultado["notas_novas"] == 1
    dados = mock_upsert.call_args[0][0]
    assert dados["manifestacao_status"] == "xml_completo"
    assert dados["tipo"] == "entrada"
    assert dados["valor_total"] == 250.00
    assert dados["fonte"] == "sefaz_distribuicao"


def test_sincronizar_compras_evento_cancelamento_atualiza_status():
    chave = "35" + "2" * 42
    respostas = [
        {"cStat": "138", "ultNSU": "101", "maxNSU": "101", "docs": [_evento_cancelamento(chave)]},
    ]
    with patch("services.nfe_compras_service.db.get_nfe_sync_state", return_value=None), \
         patch("services.nfe_compras_service.db.get_nota_por_chave", return_value={"chave_acesso": chave}), \
         patch("services.nfe_compras_service.sefaz.consultar_dist_nsu", side_effect=respostas), \
         patch("services.nfe_compras_service.db.atualizar_status_nota") as mock_atualiza, \
         patch("services.nfe_compras_service.db.save_nfe_sync_state"):
        resultado = compras.sincronizar_compras("M12", "11111111000111")

    assert resultado["canceladas"] == 1
    mock_atualiza.assert_called_once_with(chave, "cancelada")


def test_sincronizar_compras_captura_erro_sem_levantar_excecao():
    with patch("services.nfe_compras_service.db.get_nfe_sync_state", return_value=None), \
         patch("services.nfe_compras_service.sefaz.consultar_dist_nsu", side_effect=Exception("timeout")), \
         patch("services.nfe_compras_service.db.save_nfe_sync_state") as mock_save_state:
        resultado = compras.sincronizar_compras("M12", "11111111000111")

    assert resultado["erro"] == "timeout"
    mock_save_state.assert_called_once()
    assert mock_save_state.call_args[1]["ultimo_erro"] == "timeout"
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_nfe_compras_service.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

```python
# services/nfe_compras_service.py
"""Orquestra a ingestão de notas de compra: drena o distNSU até esgotar o
backlog disponível, manifesta ciência das notas novas, aplica eventos de
cancelamento e grava tudo em notas_fiscais."""
import re
import db
import services.nfe_sefaz_service as sefaz
import services.nfe_manifestacao_service as manifestacao

_MAX_CICLOS_POR_CHAMADA = 20  # segurança: nunca laça indefinidamente numa única invocação


def _parse_proc_nfe(xml, chave_acesso):
    def _tag(nome):
        m = re.search(fr"<{nome}>(.*?)</{nome}>", xml, re.DOTALL)
        return m.group(1) if m else None

    return {
        "chave_acesso": chave_acesso,
        "cnpj_emitente": _tag("CNPJ"),  # primeira ocorrência = emitente (dentro de <emit>)
        "cnpj_destinatario": re.search(r"<dest>.*?<CNPJ>(.*?)</CNPJ>", xml, re.DOTALL).group(1)
            if re.search(r"<dest>.*?<CNPJ>(.*?)</CNPJ>", xml, re.DOTALL) else None,
        "valor_total": float(_tag("vNF") or 0),
        "data_emissao": _tag("dhEmi"),
        "natureza_operacao": _tag("natOp"),
    }


def _processar_doc(conta_ml, cnpj, doc, contadores):
    tipo, chave = doc["tipo"], doc["chave_acesso"]
    if not chave:
        return

    if tipo == "resEvento":
        if "110111" in doc["xml"]:  # tpEvento 110111 = Cancelamento
            existente = db.get_nota_por_chave(chave)
            if existente:
                db.atualizar_status_nota(chave, "cancelada")
                contadores["canceladas"] += 1
        return

    if tipo == "resNFe":
        existente = db.get_nota_por_chave(chave)
        if existente and existente.get("manifestacao_status") != "pendente":
            return
        resultado_manifesta = manifestacao.enviar_ciencia_operacao(conta_ml, cnpj, chave)
        db.upsert_nota_fiscal({
            "chave_acesso": chave, "conta_ml": conta_ml, "tipo": "entrada",
            "fonte": "sefaz_distribuicao", "cnpj_emitente": None, "cnpj_destinatario": cnpj,
            "valor_total": None, "data_emissao": None, "natureza_operacao": None,
            "status": "autorizada", "xml_raw": None, "dados_estruturados": {},
            "nsu": doc["nsu"],
            "manifestacao_status": "ciencia_enviada" if resultado_manifesta["sucesso"] else "pendente",
        })
        contadores["notas_novas"] += 1
        if resultado_manifesta["sucesso"]:
            contadores["manifestadas"] += 1
        return

    if tipo == "procNFe":
        dados = _parse_proc_nfe(doc["xml"], chave)
        db.upsert_nota_fiscal({
            "chave_acesso": chave, "conta_ml": conta_ml, "tipo": "entrada",
            "fonte": "sefaz_distribuicao",
            "cnpj_emitente": dados["cnpj_emitente"], "cnpj_destinatario": dados["cnpj_destinatario"],
            "valor_total": dados["valor_total"], "data_emissao": dados["data_emissao"],
            "natureza_operacao": dados["natureza_operacao"], "status": "autorizada",
            "xml_raw": doc["xml"], "dados_estruturados": {}, "nsu": doc["nsu"],
            "manifestacao_status": "xml_completo",
        })
        contadores["notas_novas"] += 1


def sincronizar_compras(conta_ml, cnpj):
    contadores = {"notas_novas": 0, "manifestadas": 0, "canceladas": 0}
    state = db.get_nfe_sync_state(conta_ml)
    ultimo_nsu = state["ultimo_nsu"] if state else "0"
    cstat_final = None

    try:
        for _ in range(_MAX_CICLOS_POR_CHAMADA):
            resultado = sefaz.consultar_dist_nsu(conta_ml, cnpj, ultimo_nsu)
            cstat_final = resultado["cStat"]
            for doc in resultado["docs"]:
                _processar_doc(conta_ml, cnpj, doc, contadores)
            ultimo_nsu = resultado["ultNSU"]
            if resultado["cStat"] == "137" or resultado["ultNSU"] == resultado["maxNSU"]:
                break
        db.save_nfe_sync_state(conta_ml, ultimo_nsu, ultimo_erro=None)
        return {**contadores, "cstat_final": cstat_final, "erro": None}
    except Exception as e:
        db.save_nfe_sync_state(conta_ml, ultimo_nsu, ultimo_erro=str(e))
        return {**contadores, "cstat_final": cstat_final, "erro": str(e)}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_nfe_compras_service.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add services/nfe_compras_service.py tests/test_nfe_compras_service.py
git commit -m "feat: orquestração da ingestão de notas de compra (drenagem NSU + manifestação + cancelamento)"
```

---

## Task 6: Ingestão de vendas via API do Mercado Livre (`nfe_vendas_service.py`)

**Files:**
- Create: `services/nfe_vendas_service.py`
- Test: `tests/test_nfe_vendas_service.py`

**Interfaces:**
- Consumes: `ml_client.renovar_token(conta_ml) -> (token, user_id)` (já existe); `db.upsert_nota_fiscal`, `db.get_nota_por_chave` (Task 1).
- Produces (usado pela Task 8):
  - `sincronizar_vendas(conta_ml: str, dias: int = 2) -> dict` — `{"notas_novas": int, "erro": str | None}`. Nunca levanta exceção pra fora.

**Nota de implementação**: a API de `fiscal_documents` do ML é indexada por `pack_id`, não por período direto — a forma documentada de obter os packs recentes é cruzar com os pedidos já sincronizados (`db` já tem os pedidos via `sync_service`/`ml_client.buscar_pedidos`). Usar a mesma janela de "ontem + hoje" do job `_sync_ml_recente_job` existente (`scheduler.py`) pra descobrir quais `pack_id` verificar, evitando duplicar lógica de busca de pedidos. **Limitação conhecida a confirmar na Task 11**: pedidos sem `pack_id` (venda avulsa, fora de um pacote) não são cobertos por essa implementação — a documentação do ML também permite consulta por `order_id`/`shipment_id`; se a verificação ao vivo (Task 11) mostrar pedidos sem nota capturada por causa disso, estender `_packs_recentes`/`_buscar_fiscal_documents` pra também tentar por `order_id` nesses casos.

- [ ] **Step 1: Escrever os testes**

```python
# tests/test_nfe_vendas_service.py
from unittest.mock import patch, MagicMock
import services.nfe_vendas_service as vendas


def test_sincronizar_vendas_busca_fiscal_documents_por_pack_novo():
    packs = ["1001", "1002"]
    fiscal_docs_1001 = [{"id": "doc-a", "invoice_id": "35" + "0" * 42, "type": "xml"}]
    fiscal_docs_1002 = []  # pack sem nota emitida ainda

    with patch("services.nfe_vendas_service.ml_client.renovar_token", return_value=("token-fake", "user-1")), \
         patch("services.nfe_vendas_service._packs_recentes", return_value=packs), \
         patch("services.nfe_vendas_service._buscar_fiscal_documents",
               side_effect=[fiscal_docs_1001, fiscal_docs_1002]), \
         patch("services.nfe_vendas_service.db.get_nota_por_chave", return_value=None), \
         patch("services.nfe_vendas_service._baixar_xml_nota", return_value="<procNFe>xml completo</procNFe>"), \
         patch("services.nfe_vendas_service.db.upsert_nota_fiscal") as mock_upsert:
        resultado = vendas.sincronizar_vendas("M12", dias=2)

    assert resultado["notas_novas"] == 1
    assert resultado["erro"] is None
    dados = mock_upsert.call_args[0][0]
    assert dados["chave_acesso"] == "35" + "0" * 42
    assert dados["tipo"] == "saida"
    assert dados["fonte"] == "ml_fiscal_api"


def test_sincronizar_vendas_pula_nota_ja_capturada():
    packs = ["1001"]
    fiscal_docs = [{"id": "doc-a", "invoice_id": "35" + "0" * 42, "type": "xml"}]

    with patch("services.nfe_vendas_service.ml_client.renovar_token", return_value=("token-fake", "user-1")), \
         patch("services.nfe_vendas_service._packs_recentes", return_value=packs), \
         patch("services.nfe_vendas_service._buscar_fiscal_documents", return_value=fiscal_docs), \
         patch("services.nfe_vendas_service.db.get_nota_por_chave", return_value={"chave_acesso": "35" + "0" * 42}), \
         patch("services.nfe_vendas_service.db.upsert_nota_fiscal") as mock_upsert:
        resultado = vendas.sincronizar_vendas("M12")

    assert resultado["notas_novas"] == 0
    mock_upsert.assert_not_called()


def test_sincronizar_vendas_captura_erro_sem_levantar_excecao():
    with patch("services.nfe_vendas_service.ml_client.renovar_token", side_effect=Exception("token expirado")):
        resultado = vendas.sincronizar_vendas("M12")
    assert resultado["notas_novas"] == 0
    assert resultado["erro"] == "token expirado"
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_nfe_vendas_service.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

```python
# services/nfe_vendas_service.py
"""Ingestão de notas de venda (saída) — vêm da API fiscal do próprio
Mercado Livre, reaproveitando o OAuth já existente em ml_client.py.
Sem certificado, sem manifestação: o ML já emite e guarda o XML."""
from datetime import date, timedelta
import requests
import db
import ml_client

BASE_URL = "https://api.mercadolibre.com"


def _packs_recentes(token, user_id, dias):
    """Pedidos das últimas `dias` dias — reaproveita buscar_pedidos existente
    em ml_client.py pra descobrir quais pack_id verificar."""
    hoje = date.today()
    de = hoje - timedelta(days=dias)
    pedidos = ml_client.buscar_pedidos(token, user_id, de, hoje)
    return sorted({p["pack_id"] for p in pedidos if p.get("pack_id")})


def _buscar_fiscal_documents(token, pack_id):
    resp = requests.get(
        f"{BASE_URL}/packs/{pack_id}/fiscal_documents",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    if resp.status_code != 200:
        return []
    return resp.json() if isinstance(resp.json(), list) else resp.json().get("fiscal_documents", [])


def _baixar_xml_nota(token, pack_id, doc_id):
    resp = requests.get(
        f"{BASE_URL}/packs/{pack_id}/fiscal_documents/{doc_id}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.text


def sincronizar_vendas(conta_ml, dias=2):
    try:
        token, user_id = ml_client.renovar_token(conta_ml)
    except Exception as e:
        return {"notas_novas": 0, "erro": str(e)}

    notas_novas = 0
    try:
        for pack_id in _packs_recentes(token, user_id, dias):
            for doc in _buscar_fiscal_documents(token, pack_id):
                chave = doc.get("invoice_id")
                if not chave or db.get_nota_por_chave(chave):
                    continue
                xml_raw = _baixar_xml_nota(token, pack_id, doc["id"])
                db.upsert_nota_fiscal({
                    "chave_acesso": chave, "conta_ml": conta_ml, "tipo": "saida",
                    "fonte": "ml_fiscal_api", "cnpj_emitente": None, "cnpj_destinatario": None,
                    "valor_total": None, "data_emissao": None, "natureza_operacao": None,
                    "status": "autorizada", "xml_raw": xml_raw, "dados_estruturados": {"pack_id": pack_id},
                    "nsu": None, "manifestacao_status": "nao_aplicavel",
                })
                notas_novas += 1
        return {"notas_novas": notas_novas, "erro": None}
    except Exception as e:
        return {"notas_novas": notas_novas, "erro": str(e)}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_nfe_vendas_service.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add services/nfe_vendas_service.py tests/test_nfe_vendas_service.py
git commit -m "feat: ingestão de notas de venda via API fiscal do Mercado Livre"
```

---

## Task 7: Alertas — certificado a vencer e falha persistente de sync

**Files:**
- Create: `services/nfe_alertas_service.py`
- Test: `tests/test_nfe_alertas_service.py`

**Interfaces:**
- Consumes: `nfe_cert_service.dias_para_vencer(conta_ml)` (Task 2); `services.telegram.enviar_mensagem` (já existe).
- Produces (usado pela Task 8 e pela Task 9 — rota de status pro banner do frontend):
  - `verificar_certificados_vencendo(contas: list[str]) -> list[dict]` — retorna `[{"conta_ml": str, "dias_para_vencer": int}]` só das contas com ≤30 dias (ou já vencidas — `dias_para_vencer` negativo).
  - `alertar_certificados_vencendo(contas: list[str]) -> None` — chama `verificar_certificados_vencendo` e envia uma mensagem única ao Telegram se houver alguma pendência.
  - `alertar_falha_sync(conta_ml: str, tipo: str, erro: str) -> None` — `tipo` é `"compras"` ou `"vendas"`.

- [ ] **Step 1: Escrever os testes**

```python
# tests/test_nfe_alertas_service.py
from unittest.mock import patch
import services.nfe_alertas_service as alertas


def test_verificar_certificados_vencendo_filtra_por_30_dias():
    with patch("services.nfe_alertas_service.cert_service.dias_para_vencer",
               side_effect=lambda c: {"M12": 45, "YUSO": 12}[c]):
        resultado = alertas.verificar_certificados_vencendo(["M12", "YUSO"])
    assert resultado == [{"conta_ml": "YUSO", "dias_para_vencer": 12}]


def test_verificar_certificados_vencendo_ignora_conta_sem_certificado_configurado():
    with patch("services.nfe_alertas_service.cert_service.dias_para_vencer",
               side_effect=ValueError("CERT_PFX_BASE64_J12 não configurada")):
        resultado = alertas.verificar_certificados_vencendo(["J12"])
    assert resultado == []


def test_alertar_certificados_vencendo_envia_mensagem_quando_ha_pendencia():
    with patch("services.nfe_alertas_service.verificar_certificados_vencendo",
               return_value=[{"conta_ml": "YUSO", "dias_para_vencer": 12}]), \
         patch("services.nfe_alertas_service.telegram.enviar_mensagem") as mock_envia:
        alertas.alertar_certificados_vencendo(["M12", "YUSO"])
    mock_envia.assert_called_once()
    assert "YUSO" in mock_envia.call_args[0][0]
    assert "12" in mock_envia.call_args[0][0]


def test_alertar_certificados_vencendo_nao_envia_sem_pendencia():
    with patch("services.nfe_alertas_service.verificar_certificados_vencendo", return_value=[]), \
         patch("services.nfe_alertas_service.telegram.enviar_mensagem") as mock_envia:
        alertas.alertar_certificados_vencendo(["M12", "YUSO"])
    mock_envia.assert_not_called()


def test_alertar_falha_sync_envia_mensagem_com_contexto():
    with patch("services.nfe_alertas_service.telegram.enviar_mensagem") as mock_envia:
        alertas.alertar_falha_sync("M12", "compras", "timeout SEFAZ")
    mensagem = mock_envia.call_args[0][0]
    assert "M12" in mensagem and "compras" in mensagem and "timeout SEFAZ" in mensagem
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_nfe_alertas_service.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

```python
# services/nfe_alertas_service.py
"""Alertas do controle fiscal via Telegram: certificado prestes a vencer
e falha persistente nos jobs de sincronização."""
import services.nfe_cert_service as cert_service
import services.telegram as telegram

LIMIAR_DIAS_ALERTA = 30


def verificar_certificados_vencendo(contas):
    pendencias = []
    for conta_ml in contas:
        try:
            dias = cert_service.dias_para_vencer(conta_ml)
        except ValueError:
            continue  # conta sem certificado configurado — nada a verificar
        if dias <= LIMIAR_DIAS_ALERTA:
            pendencias.append({"conta_ml": conta_ml, "dias_para_vencer": dias})
    return pendencias


def alertar_certificados_vencendo(contas):
    pendencias = verificar_certificados_vencendo(contas)
    if not pendencias:
        return
    linhas = [f"- {p['conta_ml']}: vence em {p['dias_para_vencer']} dia(s)" for p in pendencias]
    texto = "⚠️ Certificado(s) digital(is) do Controle Fiscal prestes a vencer:\n" + "\n".join(linhas)
    telegram.enviar_mensagem(texto)


def alertar_falha_sync(conta_ml, tipo, erro):
    texto = f"⚠️ Falha na sincronização de notas fiscais ({tipo}) da conta {conta_ml}: {erro}"
    telegram.enviar_mensagem(texto)
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_nfe_alertas_service.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add services/nfe_alertas_service.py tests/test_nfe_alertas_service.py
git commit -m "feat: alertas de certificado a vencer e falha de sincronização"
```

---

## Task 8: Jobs do APScheduler

**Files:**
- Modify: `scheduler.py`

**Interfaces:**
- Consumes: `nfe_compras_service.sincronizar_compras` (Task 5), `nfe_vendas_service.sincronizar_vendas` (Task 6), `nfe_alertas_service.alertar_certificados_vencendo`/`alertar_falha_sync` (Task 7).
- CNPJs por conta: hardcode local nesta task (`_NFE_CONTAS = {"M12": "11111111000111", "YUSO": "22222222000122"}` — **implementador deve substituir pelos CNPJs reais de M12 e YUSO antes de rodar em produção**, obtidos com o usuário).

- [ ] **Step 1: Adicionar as funções de job em `scheduler.py`** (logo antes de `def init_scheduler`)

```python
# Valores abaixo são placeholders de desenvolvimento — a Task 11 (Step 1)
# substitui pelos CNPJs reais de M12 e YUSO, obtidos com o usuário, antes
# de qualquer execução contra a SEFAZ/ML em produção.
_NFE_CONTAS = {
    "M12": "00000000000000",
    "YUSO": "00000000000000",
}


def _nfe_compras_job():
    import services.nfe_compras_service as compras_service
    import services.nfe_alertas_service as alertas_service
    for conta_ml, cnpj in _NFE_CONTAS.items():
        resultado = compras_service.sincronizar_compras(conta_ml, cnpj)
        if resultado["erro"]:
            print(f"[scheduler] nfe_compras {conta_ml} erro: {resultado['erro']}")
            alertas_service.alertar_falha_sync(conta_ml, "compras", resultado["erro"])
        else:
            print(f"[scheduler] nfe_compras {conta_ml}: {resultado}")


def _nfe_vendas_job():
    import services.nfe_vendas_service as vendas_service
    import services.nfe_alertas_service as alertas_service
    for conta_ml in _NFE_CONTAS:
        resultado = vendas_service.sincronizar_vendas(conta_ml)
        if resultado["erro"]:
            print(f"[scheduler] nfe_vendas {conta_ml} erro: {resultado['erro']}")
            alertas_service.alertar_falha_sync(conta_ml, "vendas", resultado["erro"])
        else:
            print(f"[scheduler] nfe_vendas {conta_ml}: {resultado}")


def _nfe_certificados_job():
    import services.nfe_alertas_service as alertas_service
    alertas_service.alertar_certificados_vencendo(list(_NFE_CONTAS.keys()))
```

**Nota**: `_nfe_compras_job` roda um ciclo de drenagem (já limitado internamente a 20 iterações por chamada, ver Task 5) — se o backfill inicial de 90 dias não couber num único ciclo, o job seguinte (20 min depois) continua de onde parou (via `nfe_sync_state.ultimo_nsu`), então não precisa de lógica extra aqui pro backfill multi-dia citado no spec.

- [ ] **Step 2: Registrar os jobs em `init_scheduler`**

Adicionar dentro de `init_scheduler`, antes de `scheduler.start()`:

```python
    scheduler.add_job(_nfe_compras_job, trigger="interval", minutes=20,
                      id="nfe_compras", jitter=60, replace_existing=True)
    scheduler.add_job(_nfe_vendas_job, trigger="interval", minutes=20,
                      id="nfe_vendas", jitter=60, replace_existing=True)
    scheduler.add_job(_nfe_certificados_job, trigger="cron", hour=9, minute=0,
                      id="nfe_certificados", replace_existing=True)
```

E atualizar a mensagem de log final (`print(f"[scheduler] APScheduler iniciado — ...")`) acrescentando `", notas fiscais (compras/vendas) a cada 20min, alerta de certificado 09:00 BRT"` ao final da string existente.

- [ ] **Step 3: Verificar que o app sobe sem erro com os jobs novos registrados**

Run: `cd ~/Desktop/ml-seller-api && set -a && source runtime.env && set +a && python3 -c "
from app import create_app
app = create_app()
print('jobs registrados:', [j.id for j in app.scheduler.get_jobs()])
"`
Expected: a lista impressa inclui `nfe_compras`, `nfe_vendas`, `nfe_certificados` junto com os jobs já existentes; sem traceback.

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add scheduler.py
git commit -m "feat: jobs de ingestão fiscal (compras/vendas) e alerta de certificado no scheduler"
```

---

## Task 9: Rotas backend (`routes/notas_fiscais.py`)

**Files:**
- Create: `routes/notas_fiscais.py`
- Modify: `app.py` (registrar o novo blueprint)
- Test: `tests/test_routes_notas_fiscais.py`

**Interfaces:**
- Consumes: `db.list_notas_fiscais`, `db.get_nfe_sync_state` (Task 1); `nfe_alertas_service.verificar_certificados_vencendo` (Task 7); padrão `_conta()` de `routes/fechamento.py`.
- Produces (usado pela Task 10):
  - `GET /api/notas-fiscais?conta_ml=&tipo=&data_de=&data_ate=` → `{"notas": [...]}`
  - `GET /api/notas-fiscais/status?conta_ml=` → `{"status": [{"conta_ml", "ultima_sincronizacao", "ultimo_erro"}], "certificados_vencendo": [...]}`

- [ ] **Step 1: Escrever os testes** (usa os fixtures `client`/`auth_headers`/`admin_headers` já existentes em `tests/conftest.py`)

```python
# tests/test_routes_notas_fiscais.py
from unittest.mock import patch


def test_listar_notas_fiscais_requer_autenticacao(client):
    resp = client.get("/api/notas-fiscais")
    assert resp.status_code == 401


def test_listar_notas_fiscais_retorna_lista(client, auth_headers):
    with patch("routes.notas_fiscais.db.list_notas_fiscais", return_value=[
        {"chave_acesso": "35" + "0" * 42, "tipo": "entrada", "valor_total": 100.0}
    ]):
        resp = client.get("/api/notas-fiscais", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.get_json()["notas"]) == 1


def test_listar_notas_fiscais_nao_admin_trava_na_propria_conta(client, auth_headers):
    with patch("routes.notas_fiscais.db.list_notas_fiscais", return_value=[]) as mock_list:
        client.get("/api/notas-fiscais?conta_ml=YUSO", headers=auth_headers)
    # auth_headers usa conta_ml="J12" (ver conftest.py) — não pode ser sobrescrito pra YUSO
    assert mock_list.call_args[1]["conta_ml"] == "J12"


def test_status_notas_fiscais_retorna_sync_state_e_certificados(client, auth_headers):
    with patch("routes.notas_fiscais.db.get_nfe_sync_state",
               return_value={"conta_ml": "J12", "ultimo_nsu": "500", "atualizado_em": None, "ultimo_erro": None}), \
         patch("routes.notas_fiscais.alertas.verificar_certificados_vencendo", return_value=[]):
        resp = client.get("/api/notas-fiscais/status", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["certificados_vencendo"] == []
    assert body["status"][0]["conta_ml"] == "J12"
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_routes_notas_fiscais.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'routes.notas_fiscais'`.

- [ ] **Step 3: Implementar**

```python
# routes/notas_fiscais.py
from flask import Blueprint, request, jsonify, g
from middleware import jwt_required
import db
import services.nfe_alertas_service as alertas

notas_fiscais_bp = Blueprint("notas_fiscais", __name__)

_CONTAS_COM_FISCAL = ["M12", "YUSO"]


def _conta():
    conta = request.args.get("conta_ml") or g.user.get("conta_ml")
    if g.user.get("role") != "admin":
        conta = g.user.get("conta_ml")
    return conta


@notas_fiscais_bp.route("/api/notas-fiscais", methods=["GET"])
@jwt_required
def listar():
    conta_ml = _conta()
    notas = db.list_notas_fiscais(
        conta_ml=conta_ml,
        tipo=request.args.get("tipo"),
        data_de=request.args.get("data_de"),
        data_ate=request.args.get("data_ate"),
    )
    return jsonify({"notas": notas})


@notas_fiscais_bp.route("/api/notas-fiscais/status", methods=["GET"])
@jwt_required
def status():
    conta_ml = _conta()
    contas = [conta_ml] if conta_ml in _CONTAS_COM_FISCAL else _CONTAS_COM_FISCAL
    status_list = []
    for c in contas:
        state = db.get_nfe_sync_state(c)
        status_list.append({
            "conta_ml": c,
            "ultima_sincronizacao": state["atualizado_em"] if state else None,
            "ultimo_erro": state["ultimo_erro"] if state else None,
        })
    certificados_vencendo = alertas.verificar_certificados_vencendo(contas)
    return jsonify({"status": status_list, "certificados_vencendo": certificados_vencendo})
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/test_routes_notas_fiscais.py -v`
Expected: 4 passed.

- [ ] **Step 5: Registrar o blueprint em `app.py`**

Adicionar `from routes.notas_fiscais import notas_fiscais_bp` junto aos demais imports de blueprint (perto da linha 75, junto de `from routes.boletos import boletos_bp`), e `notas_fiscais_bp` na lista do `for bp in [...]` (linha ~77-83).

- [ ] **Step 6: Confirmar que o app ainda sobe**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/ -q`
Expected: mesma contagem de falhas pré-existentes de antes desta task (nenhuma nova falha).

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/ml-seller-api
git add routes/notas_fiscais.py app.py tests/test_routes_notas_fiscais.py
git commit -m "feat: rotas de listagem e status do controle fiscal"
```

---

## Task 10: Frontend — aba "NF/Fiscal"

**Files:**
- Create: `src/pages/NotasFiscais.jsx`
- Modify: `src/api.js` (adicionar namespace `notasFiscais`)
- Modify: `src/components/Sidebar.jsx` (adicionar item em `FIN_NAV` e prefixo em `FIN_PREFIXES`)
- Modify: `src/App.jsx` (adicionar rota)

**Interfaces:**
- Consumes: `GET /api/notas-fiscais`, `GET /api/notas-fiscais/status` (Task 9).

- [ ] **Step 1: Adicionar o namespace `notasFiscais` em `src/api.js`**

Adicionar após o bloco `estudio: { ... }` (por volta da linha 185-200, ver estrutura já lida do arquivo):

```javascript
  notasFiscais: {
    listar: (params) => request(`/api/notas-fiscais?${new URLSearchParams(params)}`),
    status: (params = {}) => request(`/api/notas-fiscais/status?${new URLSearchParams(params)}`),
  },
```

- [ ] **Step 2: Criar `src/pages/NotasFiscais.jsx`**

```jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, FileCheck2 } from 'lucide-react'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'

function formatBRL(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function CertificadoBanner({ certificadosVencendo }) {
  if (!certificadosVencendo?.length) return null
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div>
        {certificadosVencendo.map((c) => (
          <p key={c.conta_ml}>
            Certificado digital de <strong>{c.conta_ml}</strong> vence em {c.dias_para_vencer} dia(s) — renove pra não interromper a captura de notas.
          </p>
        ))}
      </div>
    </div>
  )
}

export default function NotasFiscais() {
  const { activeAccount, role } = useAuth()
  const [tipo, setTipo] = useState('')

  const params = { ...(activeAccount ? { conta_ml: activeAccount } : {}), ...(tipo ? { tipo } : {}) }

  const { data: statusData } = useQuery({
    queryKey: ['notas-fiscais-status', activeAccount],
    queryFn: () => api.notasFiscais.status(activeAccount ? { conta_ml: activeAccount } : {}),
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['notas-fiscais', activeAccount, tipo],
    queryFn: () => api.notasFiscais.listar(params),
  })

  const notas = data?.notas || []
  const contasSemFiscal = ['J12', 'LOCITECH']
  const contaSemFiscalConfigurado = activeAccount && contasSemFiscal.includes(activeAccount)

  return (
    <div className="p-6">
      <Header title="NF / Fiscal" subtitle="Notas fiscais de venda e compra capturadas automaticamente" />

      <CertificadoBanner certificadosVencendo={statusData?.certificados_vencendo} />

      {contaSemFiscalConfigurado ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
          A conta {activeAccount} ainda não tem certificado/captura fiscal configurados.
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
            >
              <option value="">Todas</option>
              <option value="entrada">Compras (entrada)</option>
              <option value="saida">Vendas (saída)</option>
            </select>
          </div>

          {isLoading && <p className="text-sm text-stone-500">Carregando...</p>}
          {error && <p className="text-sm text-red-600">Erro ao carregar notas fiscais.</p>}

          {!isLoading && !error && notas.length === 0 && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
              Nenhuma nota fiscal capturada ainda pra esse filtro.
            </div>
          )}

          {notas.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-left text-xs text-stone-500">
                  <tr>
                    <th className="px-4 py-2">Data</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Conta</th>
                    <th className="px-4 py-2">Valor</th>
                    <th className="px-4 py-2">Chave de acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {notas.map((n) => (
                    <tr key={n.chave_acesso} className="border-t border-stone-100">
                      <td className="px-4 py-2">{formatDate(n.data_emissao)}</td>
                      <td className="px-4 py-2 flex items-center gap-1">
                        <FileCheck2 size={13} className={n.tipo === 'saida' ? 'text-emerald-500' : 'text-sky-500'} />
                        {n.tipo === 'saida' ? 'Venda' : 'Compra'}
                      </td>
                      <td className="px-4 py-2">{n.conta_ml}</td>
                      <td className="px-4 py-2">{formatBRL(n.valor_total)}</td>
                      <td className="px-4 py-2 font-mono text-xs text-stone-500">{n.chave_acesso}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Adicionar o item na Sidebar**

Em `src/components/Sidebar.jsx`, adicionar ao array `FIN_NAV` (após a linha do item `Boletos MP`):

```javascript
  { to: '/financeiro/notas-fiscais',    label: 'NF/Fiscal',        icon: FileCheck2 },
```

E adicionar `FileCheck2` ao import de ícones do `lucide-react` no topo do arquivo (junto dos demais ícones já importados).

Adicionar `'/financeiro/notas-fiscais'` ao array `FIN_PREFIXES` já existente (não é estritamente necessário já que a rota já começa com `/financeiro`, mas deixar explícito por clareza — conferir se `FIN_PREFIXES` já cobre `/financeiro` genericamente antes de duplicar).

- [ ] **Step 4: Adicionar a rota em `src/App.jsx`**

Adicionar `import NotasFiscais from './pages/NotasFiscais'` junto aos demais imports de página de `financeiro/`, e a rota:

```jsx
                <Route path="financeiro/notas-fiscais" element={<NotasFiscais />} />
```

(logo após a linha `<Route path="financeiro/regras" element={<RegrasCategorização />} />`)

- [ ] **Step 5: Testar manualmente no navegador**

Run: `cd ~/Desktop/ml-seller-app && npm run dev`
Abrir `http://localhost:5173/financeiro/notas-fiscais` logado, conferir: item "NF/Fiscal" aparece na Sidebar dentro de Financeiro; a página carrega sem erro (lista vazia é esperado até a Task 11 popular dados reais); trocar o filtro "Tipo" não quebra a tela.

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ml-seller-app
git add src/pages/NotasFiscais.jsx src/api.js src/components/Sidebar.jsx src/App.jsx
git commit -m "feat: aba NF/Fiscal em Financeiro (lista e status de notas fiscais)"
```

---

## Task 11: Configuração de credenciais + verificação ao vivo (compras e vendas)

**Files:** nenhum arquivo novo — task de configuração e verificação.

**Interfaces:** nenhuma nova — valida as Tasks 2-9 contra os serviços reais.

- [ ] **Step 1: Confirmar os CNPJs reais de M12 e YUSO com o usuário e atualizar `_NFE_CONTAS` em `scheduler.py`** (placeholder deixado na Task 8)

- [ ] **Step 2: Obter o .pfx de cada CNPJ, converter pra base64 e configurar no EasyPanel**

```bash
base64 -i caminho/para/m12.pfx | tr -d '\n'
```

Adicionar no EasyPanel (aba Ambiente do serviço `backend`, mesmo padrão das demais variáveis): `CERT_PFX_BASE64_M12`, `CERT_PFX_SENHA_M12`, `CERT_PFX_BASE64_YUSO`, `CERT_PFX_SENHA_YUSO`. Replicar as mesmas variáveis em `runtime.env` local (sem versionar) pra rodar a verificação abaixo localmente antes do deploy.

- [ ] **Step 3: Confirmar a URL exata do `NFeDistribuicaoDFe` e do `RecepcaoEvento`**

Checar a documentação oficial vigente no Portal Nacional da NF-e antes de prosseguir — corrigir `URL_DIST_DFE` (Task 3) e `URL_RECEPCAO_EVENTO` (Task 4) se divergirem do valor usado no plano.

- [ ] **Step 4: Verificação ao vivo — lado de compras (valida a assunção crítica do spec)**

```bash
cd ~/Desktop/ml-seller-api && set -a && source runtime.env && set +a && python3 -c "
import services.nfe_compras_service as compras
resultado = compras.sincronizar_compras('M12', '<CNPJ_REAL_M12>')
print(resultado)
"
```
Expected: `erro` é `None`; `cstat_final` é `137` ou `138` (não um erro de autenticação/schema); se houver notas de compra reais nos últimos 90 dias, `notas_novas > 0`. Se retornar erro de conexão/autenticação, revisar a URL (Step 3) e o certificado (Step 2) antes de prosseguir.

- [ ] **Step 5: Verificação ao vivo — lado de vendas**

```bash
cd ~/Desktop/ml-seller-api && set -a && source runtime.env && set +a && python3 -c "
import services.nfe_vendas_service as vendas
resultado = vendas.sincronizar_vendas('M12', dias=5)
print(resultado)
"
```
Expected: `erro` é `None`; se M12 teve vendas com nota emitida nos últimos 5 dias, `notas_novas > 0`.

- [ ] **Step 6: Conferir os dados gravados**

```bash
cd ~/Desktop/ml-seller-api && set -a && source runtime.env && set +a && python3 -c "
import db
print(db.list_notas_fiscais(conta_ml='M12', limit=5))
"
```
Expected: lista com notas reais, `tipo` e `fonte` corretos pra cada uma.

- [ ] **Step 7: Rodar a suíte completa uma última vez**

Run: `cd ~/Desktop/ml-seller-api && python3 -m pytest tests/ -q`
Expected: mesma contagem de falhas pré-existentes documentada no `CLAUDE.md`, nenhuma nova falha introduzida por esta fase.

- [ ] **Step 8: Commit da atualização do CNPJ real em `scheduler.py`**

```bash
cd ~/Desktop/ml-seller-api
git add scheduler.py
git commit -m "chore: configura CNPJs reais de M12/YUSO nos jobs de ingestão fiscal"
```
