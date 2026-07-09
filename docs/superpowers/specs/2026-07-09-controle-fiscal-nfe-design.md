# Controle Fiscal (NF-e) — Fase 1: Ingestão SEFAZ + Painel NF/Fiscal

## Objetivo

Vendedor não tem hoje nenhum controle centralizado das notas fiscais (NF-e modelo 55) que entram (compras via CNPJ) e saem (vendas emitidas automaticamente pelo Mercado Livre) das contas **M12** e **YUSO**. O objetivo desta fase é capturar automaticamente, direto da SEFAZ, todas as NF-e vinculadas a esses dois CNPJs e disponibilizar isso numa tela nova do sistema — construindo a base sobre a qual, em fases futuras, o sistema vai cruzar essas notas com o Fechamento mensal e montar um pacote pronto pra mandar pro contador.

## Contexto e motivação

- Vendedor emite notas de venda automaticamente via Mercado Livre (usando o certificado da empresa cadastrado no painel fiscal do ML). Não tem hoje nenhum registro dessas notas fora do próprio ML.
- Notas de compra (fornecedores, insumos) hoje não têm nenhum controle automatizado — dependem de recebimento manual de XML/DANFE por e-mail ou WhatsApp, sem garantia de completude.
- Meta final (fases seguintes): fechar o mês com confiança de que todas as NFs relevantes foram capturadas antes de mandar o fechamento + notas pro contador.
- Volume: ~20 mil NF-e/mês somadas entre as duas contas. Isso inviabiliza economicamente gateways pagos de terceiros (ex: Focus NFe cobra ~R$0,65/documento acima de 200/mês — daria ~R$13.000/mês só de custo variável). Por isso a decisão é integrar direto com o webservice oficial da SEFAZ (`NFeDistribuicaoDFe`), que não tem custo por documento.

## Escopo desta fase

**Dentro do escopo:**
- Ingestão automática de NF-e (modelo 55, produtos/mercadorias) vinculadas aos CNPJs de M12 e YUSO, via webservice `NFeDistribuicaoDFe` da SEFAZ (Ambiente Nacional), usando certificado digital A1 (.pfx) de cada CNPJ.
- Classificação automática de cada nota como entrada (compra, CNPJ é destinatário) ou saída (venda, CNPJ é emitente).
- Manifestação automática de "Ciência da Emissão" para notas de compra, passo obrigatório da Receita para liberar o XML completo (sem isso, só o resumo da nota fica disponível).
- Armazenamento do XML completo + dados estruturados de cada nota.
- Alerta de vencimento de certificado digital (Telegram + banner no sistema), 30 dias antes do vencimento.
- Alerta de falha persistente de sincronização (Telegram).
- Nova aba **"NF/Fiscal"** dentro da seção Financeiro do frontend, com banner de aviso de certificado e lista/status das notas capturadas.

**Fora do escopo desta fase (fases futuras):**
- NFS-e (notas de serviço) — sistema municipal totalmente separado da SEFAZ estadual/federal. Fica para uma fase futura, se necessário.
- Cruzamento automático das notas com despesas do Fechamento e com pedidos do Mercado Livre.
- Geração do "pacote mensal" para envio à contabilidade (zip de XMLs + relatório).
- Edição/emissão de notas pelo próprio sistema (o sistema só consome dados que já existem na SEFAZ; a emissão continua sendo feita pelo Mercado Livre).

## Decisões técnicas confirmadas

### Abordagem de captura: integração direta com a SEFAZ

Rejeitada a opção de usar um gateway pago (Focus NFe, PlugNotas, Arquivei) por causa do custo no volume atual (~20 mil notas/mês). A integração direta usa o webservice oficial `NFeDistribuicaoDFe`, centralizado no Ambiente Nacional (não depende do estado do CNPJ). A URL/WSDL exata (produção) deve ser confirmada na documentação oficial do Portal Nacional da NF-e (`nfe.fazenda.gov.br`) no momento da implementação — não deve ser hardcoded a partir de suposição.

### Certificado digital

- Ambos CNPJs (M12, YUSO) têm certificado A1 (.pfx), viável para automação em servidor (diferente do A3, que exige hardware físico).
- Armazenamento: **não** cria infraestrutura de cofre de segredos nova. Segue o padrão já usado no projeto (segredos só em variável de ambiente do EasyPanel, nunca versionados): o .pfx de cada CNPJ vira base64 em `CERT_PFX_BASE64_M12` / `CERT_PFX_BASE64_YUSO`, e a senha em `CERT_PFX_SENHA_M12` / `CERT_PFX_SENHA_YUSO`. O backend decodifica em memória no momento da autenticação mTLS — nunca grava o .pfx em disco.
- O certificado A1 vence 1x por ano. O sistema deve checar a validade (lendo a data de expiração do próprio certificado, via biblioteca `cryptography`) e emitir alerta quando faltar ≤30 dias.

### Regras do webservice (confirmadas via documentação oficial durante o brainstorming)

- **Retenção de 90 dias**: a SEFAZ só mantém histórico consultável dos últimos 90 dias. Ao ativar a ingestão pela primeira vez, o backfill retroativo é limitado a isso (podendo ser menor, dependendo de regras de geração de NSU para CNPJ que nunca consultou o serviço antes). Daí em diante, a captura é contínua e completa.
- **Limite de 20 consultas/hora por CNPJ**: exceder isso bloqueia o CNPJ por 1h na SEFAZ (retorno `cStat=656`). O job de sincronização deve rodar com folga confortável desse limite (ver Agendamento).
- **Fluxo de manifestação**: para notas de compra (CNPJ como destinatário), a SEFAZ inicialmente só entrega um resumo (`resNFe`) via `distNSU`. O sistema deve enviar automaticamente o evento de manifestação "Ciência da Emissão" para essa chave. Em um ciclo de consulta seguinte, a SEFAZ passa a entregar o XML completo (`procNFe`) daquela nota. Para notas de venda (CNPJ como emitente), o XML completo já vem direto, sem necessidade de manifestação.

### Modelo de dados

Nova tabela `notas_fiscais` no Postgres (Supabase), seguindo o padrão de migração já usado no projeto (`migrations/`, `IF NOT EXISTS`):

| Coluna | Tipo | Descrição |
|---|---|---|
| `chave_acesso` | text, único | Chave de acesso de 44 dígitos da NF-e |
| `conta_ml` | text | `M12` ou `YUSO` |
| `tipo` | text | `entrada` (compra) ou `saida` (venda) |
| `cnpj_emitente` | text | |
| `cnpj_destinatario` | text | |
| `valor_total` | numeric | |
| `data_emissao` | timestamptz | |
| `natureza_operacao` | text | |
| `status` | text | `autorizada`, `cancelada`, etc. |
| `xml_raw` | text | XML completo (`procNFe`), quando disponível |
| `dados_estruturados` | jsonb | Resumo/itens parseados do XML |
| `nsu` | text | NSU do documento na distribuição |
| `manifestacao_status` | text | `nao_aplicavel` (saída), `pendente`, `ciencia_enviada`, `xml_completo` (compra) |
| `created_at` | timestamptz | |

Mais uma tabela/estrutura de controle de cursor por CNPJ (`nfe_sync_state`: `conta_ml`, `ultimo_nsu`, `atualizado_em`), usada para saber de onde continuar a cada ciclo de consulta.

### Agendamento e resiliência

- Job novo no APScheduler existente (mesmo padrão dos demais jobs em horário BRT), um ciclo por CNPJ a cada ~20 minutos — bem folgado em relação ao limite de 20 consultas/hora.
- Cada ciclo: consulta `distNSU` a partir do último NSU salvo → classifica documentos recebidos → para resumos de compra sem manifestação, envia "Ciência da Emissão" → grava/atualiza registros em `notas_fiscais` (dedupe por `chave_acesso`) → avança `ultimo_nsu`.
- Falha persistente (ex: certificado inválido, CNPJ bloqueado por rate limit, erro de rede repetido) dispara alerta via o bot do Telegram já usado no projeto (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`), já que é um job de fundo sem tela de acompanhamento direto.

### Frontend — aba "NF/Fiscal"

- Nova rota `/financeiro/notas-fiscais`, adicionada à seção expansível "Financeiro" da Sidebar (mesmo padrão dos itens existentes: Contas a Pagar, Conciliação, Boletos MP etc.), com ícone apropriado do `lucide-react`.
- Banner no topo da página (mesmo padrão de banner inline usado no resto do sistema — sem sistema de toast) avisando quando algum certificado (M12 e/ou YUSO) está a ≤30 dias do vencimento. Calculado on-the-fly a partir da validade do certificado — sem tabela de notificações com estado de lido/não lido (YAGNI: não precisamos disso agora).
- Painel de status por conta: última sincronização bem-sucedida, quantidade de notas capturadas no período.
- Lista das notas capturadas: data, tipo (entrada/saída), conta, CNPJ, valor, chave de acesso — com filtro por período e por conta.
- **Fora do escopo desta tela nesta fase**: link de download do XML/DANFE individual, exportação, e qualquer cruzamento com Fechamento/pedidos — isso é conteúdo das fases seguintes.

## Testes

- Testes unitários para: parsing/classificação de documentos (`resNFe`, `resEvento`, `procNFe`) a partir de fixtures de XML reais (gerados a partir de exemplos oficiais da documentação da SEFAZ ou de notas de teste), lógica de determinação `entrada`/`saida` por comparação de CNPJ, lógica de manifestação automática, avanço de cursor NSU, cálculo de alerta de vencimento de certificado.
- Verificação ao vivo (fim a fim) contra o ambiente da SEFAZ antes de considerar a fase concluída — usando os certificados reais de M12 e YUSO, respeitando o limite de 20 consultas/hora. Se o ambiente de homologação da SEFAZ permitir teste com esses certificados, preferir homologação; caso contrário, uma consulta cuidadosa em produção.

## Riscos e pontos de atenção

- **Correção do parsing de XML fiscal é crítica** — dados incorretos aqui viram base para o contador. Testes com XMLs reais (não só sintéticos) são obrigatórios antes de considerar a fase pronta.
- **Segurança do certificado**: a chave privada do certificado (dentro do .pfx) autentica a empresa perante a Receita Federal. Vazamento é grave. Confirmar que as variáveis de ambiente nunca aparecem em logs (inclusive logs de erro/exceção que possam incluir payloads).
- **Manutenção**: webservices da Receita mudam ocasionalmente (ex: a nota técnica que reduziu o prazo de manifestação de 180 para 90 dias, vigente desde 01/06/2026). Não é um risco bloqueante, mas deve ser monitorado ao longo do tempo.
