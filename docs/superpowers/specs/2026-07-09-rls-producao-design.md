# Habilitar Row Level Security nas tabelas de produção — 09/07/2026

## Contexto

O advisor de segurança do Supabase (projeto "YUSO", `tywirfmaosfztcmalbno`) sinaliza que 29 tabelas do schema `public` estão com Row Level Security (RLS) desabilitado — incluindo `custos_produtos`, `ml_pedidos`, `ml_pedidos_itens`, `conciliacao`, `fechamento_compras/fretes/montagem/despesas`, `planos`, `user_planos`, `ml_perguntas`, `fluxo_caixa_mensal`, `inventario_intencoes`, `despesas_fixas_mensais` (recém-criada), entre outras. Essas tabelas estão totalmente expostas às roles `anon` e `authenticated` do Supabase — usadas pelo `supabase-js` no navegador — significando que qualquer pessoa com a chave pública `anon` (embutida no JS do site) consegue ler ou escrever direto nessas tabelas via API REST do Supabase, ignorando toda autenticação, isolamento por `conta_ml` e regra de negócio do backend Flask.

Confirmado por investigação de código: o frontend (`ml-seller-app`) usa `supabase-js` **somente** para autenticação (`supabase.auth.*` — login, sessão, logout, reset de senha), nunca para `.from()`/`.storage`/`.rpc()` de dado. O backend (`ml-seller-api`) conecta ao Postgres via `DATABASE_URL` usando a role `postgres` (superusuário/dono), que **ignora RLS por padrão** independente de políticas configuradas.

## Objetivo

Habilitar RLS em todas as 29 tabelas sinalizadas, sem nenhuma política de acesso — bloqueio total para as roles `anon`/`authenticated` — fechando o vetor de acesso direto sem passar pelo backend.

## Escopo

- Projeto Supabase: `tywirfmaosfztcmalbno` ("YUSO"), único banco de produção em uso pelo `ml-seller-api`.
- As 29 tabelas exatamente como listadas pelo advisor do Supabase no momento da execução (reconferir a lista antes de aplicar, já que pode ter mudado desde a auditoria).
- Nenhuma política (`CREATE POLICY`) é criada nesta rodada — RLS habilitado sem políticas equivale a negar acesso a todas as roles exceto o dono da tabela/superusuário.
- Fora de escopo: revisar/reduzir os privilégios da role `postgres` usada pelo backend; criar políticas granulares (não é necessário, já que nenhum uso legítimo depende de acesso via `anon`/`authenticated`).

## Risco e mitigação

- **Risco conhecido e descartado:** quebrar o backend Flask — descartado, pois ele conecta como `postgres`, que ignora RLS.
- **Risco conhecido e descartado:** quebrar login/sessão do frontend — descartado, pois `supabase.auth.*` não é afetado por RLS em tabelas do schema `public` (é gerenciado internamente pelo Supabase Auth, schema `auth`, não `public`).
- **Risco residual não verificável a partir do código:** alguma integração externa (ex.: Zapier, n8n, script de terceiro) que use a chave `anon` para acessar essas tabelas diretamente. Não identificado nenhum indício disso no código dos dois repositórios. Caso exista e quebre, o rollback é imediato (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY;` tabela por tabela).

## Execução

1. Confirmar a lista atual de tabelas com RLS desabilitado (`list_tables` via MCP do Supabase).
2. Aplicar `ALTER TABLE public.<tabela> ENABLE ROW LEVEL SECURITY;` para cada uma, via migration.
3. Verificar que o app continua funcionando normalmente após a mudança (checagem rápida ao vivo: login, uma página de leitura, uma ação de escrita).
4. Confirmar via `list_tables` que o advisor de RLS não aponta mais essas 29 tabelas.

## Critérios de sucesso

- As 29 tabelas aparecem com `rls_enabled: true`.
- Nenhuma regressão observável no app (login e uma rota de leitura/escrita testadas ao vivo).
- Nenhuma política nova criada (bloqueio total é o comportamento pretendido).
