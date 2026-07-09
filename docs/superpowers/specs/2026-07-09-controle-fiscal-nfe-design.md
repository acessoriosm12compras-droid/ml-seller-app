# Controle Fiscal (NF-e) — Fase 1: Ingestão (SEFAZ + API Mercado Livre) + Painel NF/Fiscal

## Objetivo

Vendedor não tem hoje nenhum controle centralizado das notas fiscais (NF-e modelo 55) que entram (compras via CNPJ) e saem (vendas emitidas automaticamente pelo Mercado Livre) das contas **M12** e **YUSO**. O objetivo desta fase é capturar automaticamente essas NF-e — compras direto da SEFAZ, vendas direto da API fiscal do Mercado Livre (ver "Duas fontes de ingestão") — e disponibilizar isso numa tela nova do sistema, construindo a base sobre a qual, em fases futuras, o sistema vai cruzar essas notas com o Fechamento mensal e montar um pacote pronto pra mandar pro contador.

## Contexto e motivação

- Vendedor emite notas de venda automaticamente via Mercado Livre (usando o certificado da empresa cadastrado no painel fiscal do ML). Não tem hoje nenhum registro dessas notas fora do próprio ML.
- Notas de compra (fornecedores, insumos) hoje não têm nenhum controle automatizado — dependem de recebimento manual de XML/DANFE por e-mail ou WhatsApp, sem garantia de completude.
- Meta final (fases seguintes): fechar o mês com confiança de que todas as NFs relevantes foram capturadas antes de mandar o fechamento + notas pro contador.
- Volume: ~20 mil NF-e/mês somadas entre as duas contas (a grande maioria são vendas). Isso inviabiliza economicamente gateways pagos de terceiros pro lado de compras (ex: Focus NFe cobra ~R$0,65/documento acima de 200/mês — daria ~R$13.000/mês só de custo variável). Por isso a decisão é integrar direto com o webservice oficial da SEFAZ (`NFeDistribuicaoDFe`) pra compras — o lado de vendas usa a própria API oficial do Mercado Livre (ver "Duas fontes de ingestão" abaixo), sem custo adicional nenhum.

## Escopo desta fase

**Dentro do escopo:**
- Ingestão automática de NF-e (modelo 55, produtos/mercadorias) de **duas fontes distintas** (ver "Duas fontes de ingestão" abaixo), cobrindo os CNPJs de M12 e YUSO.
- Classificação automática de cada nota como entrada (compra) ou saída (venda).
- Manifestação automática de "Ciência da Operação" (evento 210210) para notas de compra, passo obrigatório da Receita para liberar o XML completo (sem isso, só o resumo da nota fica disponível).
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

### Duas fontes de ingestão (correção importante em relação à primeira versão deste spec)

A primeira versão deste spec assumia que **tanto** compras quanto vendas viriam pelo mesmo webservice da SEFAZ (`NFeDistribuicaoDFe`). Isso está **errado**: documentação oficial confirma que a SEFAZ **não redistribui, pelo `NFeDistribuicaoDFe`, os documentos emitidos pelo próprio CNPJ consultante** — esse serviço existe para entregar ao *destinatário* (e a transportadoras/terceiros envolvidos), não para devolver ao emitente as próprias notas. Como M12 e YUSO são as emitentes das notas de venda (via certificado cadastrado no Mercado Livre), essas notas — a maior parte do volume (~20 mil/mês) — não apareceriam nesse canal.

A correção usa duas fontes, cada uma a fonte natural e mais simples para o seu lado:

**1. Notas de venda (saída) → API fiscal do próprio Mercado Livre**, não SEFAZ.
O Mercado Livre expõe uma API REST oficial pra isso (`developers.mercadolivre.com.br` → "Obtendo nota fiscal"): `GET /packs/{pack_id}/fiscal_documents` retorna os documentos fiscais (XML e o DANFE em PDF) de cada venda, com consulta por `invoice_id`, `order_id` ou `shipment_id`, e suporte a download em lote por período. Essa é a fonte oficial e mais direta — reaproveita a integração OAuth com o ML que o backend já tem em `ml_client.py`, e **não precisa de certificado digital nem de manifestação** para o lado de vendas. Isso simplifica bastante essa metade do escopo.

**2. Notas de compra (entrada) → SEFAZ `NFeDistribuicaoDFe`**, como no desenho original.
Aqui sim o certificado A1 e o fluxo de manifestação são necessários — SEFAZ entrega, pra quem consulta como destinatário, primeiro um resumo e depois o XML completo após a manifestação (ver seção "Fluxo de manifestação" abaixo).

Rejeitada a opção de usar um gateway pago (Focus NFe, PlugNotas, Arquivei) pro lado de compras, por causa do custo no volume atual (~20 mil notas/mês somando os dois lados). A integração direta usa o webservice oficial `NFeDistribuicaoDFe`, centralizado no Ambiente Nacional (não depende do estado do CNPJ). A URL/WSDL exata (produção) deve ser confirmada na documentação oficial do Portal Nacional da NF-e (`nfe.fazenda.gov.br`) no momento da implementação — não deve ser hardcoded a partir de suposição.

### Certificado digital

- Ambos CNPJs (M12, YUSO) têm certificado A1 (.pfx), viável para automação em servidor (diferente do A3, que exige hardware físico). Usado **só** para o lado de compras (SEFAZ) — o lado de vendas (API do ML) usa o OAuth que o projeto já tem.
- Armazenamento: **não** cria infraestrutura de cofre de segredos nova. Segue o padrão já usado no projeto (segredos só em variável de ambiente do EasyPanel, nunca versionados): o .pfx de cada CNPJ vira base64 em `CERT_PFX_BASE64_M12` / `CERT_PFX_BASE64_YUSO`, e a senha em `CERT_PFX_SENHA_M12` / `CERT_PFX_SENHA_YUSO`. O backend decodifica em memória no momento da autenticação mTLS — nunca grava o .pfx em disco.
- **Biblioteca para mTLS em memória**: nem `requests` (`cert=`) nem o `ssl.SSLContext` padrão do Python aceitam certificado/chave a partir de bytes em memória — só a partir de caminho de arquivo, o que forçaria gravar o .pfx em disco (violando a regra acima). Usar `requests-pkcs12` (mantém o material em memória) ou um `HTTPAdapter` customizado que monta um `SSLContext` a partir do PEM extraído em memória via `cryptography`. Isso deve ser decidido e nomeado explicitamente no plano de implementação, não descoberto durante a implementação.
- O certificado A1 vence 1x por ano. O sistema deve checar a validade (lendo a data de expiração do próprio certificado, via `cryptography.load_key_and_certificates` → `not_valid_after`) e emitir alerta quando faltar ≤30 dias.
- **Segurança adicional**: os handlers de exceção que tocarem código de certificado/SEFAZ não devem deixar vazar o conteúdo das variáveis `CERT_*`/`*_SENHA` em mensagens de erro ou logs. Se o projeto usar algum serviço de captura de erro no futuro, confirmar que ele não serializa `os.environ` inteiro nos eventos.

### Regras do webservice `NFeDistribuicaoDFe` (só para o lado de compras)

- **Retenção de 90 dias**: a SEFAZ só mantém histórico consultável dos últimos 90 dias. Ao ativar a ingestão pela primeira vez, o backfill retroativo é limitado a isso (podendo ser menor, dependendo de regras de geração de NSU para CNPJ que nunca consultou o serviço antes). Daí em diante, a captura é contínua e completa. **Não confundir com o prazo de manifestação** (abaixo) — são dois "90 dias" diferentes e não relacionados.
- **Limite de consultas por hora**: exceder o limite bloqueia o CNPJ por 1h na SEFAZ (retorno `cStat=656`, "Consumo Indevido"). O número exato de consultas permitidas deve ser reconfirmado contra a Nota Técnica vigente no momento da implementação (a versão pesquisada durante o brainstorming indicava 20/hora, mas isso deve ser tratado como referência a validar, não como valor fixo). Na prática, o gatilho real do bloqueio costuma ser **consultar de novo cedo demais depois de um retorno "nenhum documento localizado" (`cStat=137`)** — então o job deve fazer um back-off de ~1h após receber `cStat=137`, e não simplesmente contar chamadas.
- **`distNSU` não drena tudo de uma vez**: cada chamada retorna no máximo um lote limitado de documentos (`docZip`) mais os campos `ultNSU`/`maxNSU`. Um ciclo de sincronização precisa **fazer `distNSU` em loop enquanto `maxNSU > ultNSU`** (respeitando o rate limit), não uma única chamada por ciclo — senão o backfill inicial de dias/semanas de notas de compra nunca termina de drenar. O primeiro backfill pode legitimamente levar várias horas ou dias até zerar a diferença entre `ultNSU` e `maxNSU`.
- **Fluxo de manifestação (compras)**: para notas de compra (CNPJ como destinatário), a SEFAZ inicialmente só entrega um resumo (`resNFe`) via `distNSU`. O sistema deve enviar automaticamente o evento **"Ciência da Operação"** (código de evento `210210` — o nome técnico correto; "Ciência da Emissão" usado na primeira versão deste spec era impreciso). Esse evento é enviado a um webservice **diferente** do `distNSU`: o `RecepcaoEvento` (`nfeRecepcaoEvento`), também no Ambiente Nacional. O XML do evento precisa ser **assinado digitalmente (XMLDSig, enveloped, C14N)** com o mesmo certificado A1 do CNPJ — isso é uma sub-etapa de implementação real (ex: biblioteca `signxml`), não um detalhe trivial. Reenviar a manifestação de uma chave já manifestada retorna `cStat=573` ("Duplicidade de Evento") — o job deve tratar isso como sucesso (idempotência), útil por exemplo se o processo cair entre enviar a manifestação e gravar isso no banco. Só depois da manifestação bem-sucedida (ou já confirmada), um ciclo de `distNSU` seguinte passa a entregar o XML completo (`procNFe`) daquela nota.
- **Eventos de cancelamento**: além de `resNFe`/`procNFe`, o `distNSU` também retorna eventos de terceiros sobre notas já existentes (`resEvento`/`procEventoNFe`), incluindo cancelamentos. O job deve casar esses eventos pela `chave_acesso` (`chNFe`) com uma nota já capturada e atualizar `status` para `cancelada`. Carta de Correção (CC-e) e outros tipos de evento podem ser apenas registrados/logados nesta fase, sem processamento adicional — mas a lista de tipos tratados vs. ignorados deve ficar explícita no plano de implementação, não deve ser algo "descoberto" durante o desenvolvimento.

### Modelo de dados

Nova tabela `notas_fiscais` no Postgres (Supabase), seguindo o padrão de migração já usado no projeto (`migrations/NNN_nome.sql`, `IF NOT EXISTS`):

| Coluna | Tipo | Descrição |
|---|---|---|
| `chave_acesso` | text, único (índice único) | Chave de acesso de 44 dígitos da NF-e — usada pro dedupe no upsert |
| `conta_ml` | text | `M12` ou `YUSO` |
| `tipo` | text | `entrada` (compra) ou `saida` (venda) |
| `fonte` | text | `sefaz_distribuicao` (compras) ou `ml_fiscal_api` (vendas) — de onde a nota foi capturada |
| `cnpj_emitente` | text | |
| `cnpj_destinatario` | text | |
| `valor_total` | numeric(15,2) | |
| `data_emissao` | timestamptz | |
| `natureza_operacao` | text | |
| `status` | text | `autorizada`, `cancelada`, etc. |
| `xml_raw` | text | XML completo, quando disponível |
| `dados_estruturados` | jsonb | Resumo/itens parseados do XML |
| `nsu` | text | NSU do documento na distribuição (nulo para notas vindas da API do ML) |
| `manifestacao_status` | text | `nao_aplicavel` (venda), `pendente`, `ciencia_enviada`, `xml_completo` (compra) |
| `created_at` | timestamptz | |

Índice adicional em `(conta_ml, data_emissao)` para os filtros por período/conta da tela NF/Fiscal.

Mais uma tabela/estrutura de controle de cursor por CNPJ (`nfe_sync_state`: `conta_ml`, `ultimo_nsu`, `atualizado_em`), usada só pelo lado de compras (SEFAZ) para saber de onde continuar a cada ciclo de consulta.

### Agendamento e resiliência

- **Compras (SEFAZ):** job novo no APScheduler existente (mesmo padrão dos demais jobs em horário BRT), um ciclo por CNPJ. Cada ciclo faz `distNSU` **em loop até `maxNSU == ultNSU`** (drenando o backlog disponível, respeitando o rate limit) → classifica documentos recebidos → para resumos de compra sem manifestação, envia "Ciência da Operação" (assinada) ao `RecepcaoEvento`, tratando `cStat=573` como sucesso → casa eventos de cancelamento com notas já capturadas → grava/atualiza registros em `notas_fiscais` (dedupe por `chave_acesso`) → avança `ultimo_nsu`. Ao receber `cStat=137` ("nenhum documento localizado"), o job dá um back-off de ~1h antes do próximo ciclo, em vez de tentar de novo no intervalo normal.
- **Vendas (API do ML):** job novo, mais simples — usa o token OAuth já existente por conta (`ml_client.py`) para consultar `GET /packs/{pack_id}/fiscal_documents` das vendas do período e baixar XML/DANFE das que ainda não estão em `notas_fiscais`.
- Falha persistente em qualquer um dos dois jobs (ex: certificado inválido, CNPJ bloqueado por rate limit, erro de rede repetido) dispara alerta via o bot do Telegram já usado no projeto (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`), já que são jobs de fundo sem tela de acompanhamento direto.
- Qualquer futuro botão de "sincronizar agora" na tela NF/Fiscal deve sempre disparar essa mesma lógica de job em background — nunca fazer a chamada à SEFAZ/ML de forma síncrona dentro de uma rota, pra não violar a regra do projeto de não devolver 502/503/504 (rotas têm timeout curto; consultas à SEFAZ/backfill podem demorar bem mais que isso).

### Frontend — aba "NF/Fiscal"

- Nova rota `/financeiro/notas-fiscais`, adicionada à seção expansível "Financeiro" da Sidebar (mesmo padrão dos itens existentes: Contas a Pagar, Conciliação, Boletos MP etc.), com ícone apropriado do `lucide-react`.
- Banner no topo da página (mesmo padrão de banner inline usado no resto do sistema — sem sistema de toast) avisando quando algum certificado (M12 e/ou YUSO) está a ≤30 dias do vencimento. Calculado on-the-fly a partir da validade do certificado — sem tabela de notificações com estado de lido/não lido (YAGNI: não precisamos disso agora).
- Painel de status por conta: última sincronização bem-sucedida, quantidade de notas capturadas no período.
- Lista das notas capturadas: data, tipo (entrada/saída), conta, CNPJ, valor, chave de acesso — com filtro por período e por conta. O filtro de conta lista só M12 e YUSO (únicas com certificado/fiscal configurado nesta fase) — J12 e LOCITECH não aparecem nesse filtro, e a tela deve deixar claro (estado vazio explicativo, não um erro) que essas duas contas simplesmente não têm dados fiscais habilitados ainda.
- **Fora do escopo desta tela nesta fase**: link de download do XML/DANFE individual, exportação, e qualquer cruzamento com Fechamento/pedidos — isso é conteúdo das fases seguintes.

## Testes

- Testes unitários (lado compras/SEFAZ): parsing/classificação de documentos (`resNFe`, `resEvento`/`procEventoNFe`, `procNFe`) a partir de fixtures de XML reais (gerados a partir de exemplos oficiais da documentação da SEFAZ ou de notas de teste), lógica de loop de drenagem por NSU (`maxNSU`/`ultNSU`), assinatura XMLDSig do evento de manifestação, tratamento idempotente de `cStat=573`, atualização de status por evento de cancelamento, cálculo de alerta de vencimento de certificado.
- Testes unitários (lado vendas/ML): parsing da resposta de `fiscal_documents`, dedupe por `chave_acesso`.
- Verificação ao vivo (fim a fim) contra a SEFAZ antes de considerar o lado de compras concluído — usando os certificados reais de M12 e YUSO, com cautela quanto ao rate limit (confirmar o limite vigente antes de rodar testes repetidos). Se o ambiente de homologação da SEFAZ permitir teste com esses certificados, preferir homologação; caso contrário, uma consulta cuidadosa em produção — e essa é a oportunidade de validar cedo a assunção sobre o comportamento do `distNSU` citada em "Riscos e pontos de atenção".
- Verificação ao vivo (fim a fim) contra a API do Mercado Livre antes de considerar o lado de vendas concluído — usando uma conta real (M12 ou YUSO) com vendas recentes com nota emitida.

## Riscos e pontos de atenção

- **Correção do parsing de XML fiscal é crítica** — dados incorretos aqui viram base para o contador. Testes com XMLs reais (não só sintéticos) são obrigatórios antes de considerar a fase pronta.
- **Segurança do certificado**: a chave privada do certificado (dentro do .pfx) autentica a empresa perante a Receita Federal. Vazamento é grave. Confirmar que as variáveis de ambiente nunca aparecem em logs (inclusive logs de erro/exceção que possam incluir payloads), e considerar que o próprio painel do EasyPanel guarda o valor em texto plano na sua interface — risco aceito, consistente com os demais segredos do projeto, não algo a resolver nesta fase.
- **Manutenção**: webservices da Receita mudam ocasionalmente (ex: uma nota técnica reduziu o prazo de manifestação para confirmação/desconhecimento da operação de 180 para 90 dias). Esse prazo de manifestação **não é o mesmo** dos 90 dias de retenção de histórico do `NFeDistribuicaoDFe` citados acima — são limites diferentes e não devem ser confundidos na implementação. Não é um risco bloqueante, mas deve ser monitorado ao longo do tempo.
- **Assunção que precisa de verificação empírica antes/durante a implementação**: este spec já corrigiu a suposição errada de que vendas viriam pela SEFAZ (ver "Duas fontes de ingestão"), com base em documentação. Ainda assim, o primeiro passo de implementação do lado de compras deve incluir uma consulta real de `distNSU` contra a SEFAZ com o certificado de um dos CNPJs, cedo, pra confirmar o comportamento antes de construir o resto do fluxo em cima de uma suposição não testada.
