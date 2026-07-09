# Evidência real no Estúdio IA (metodologia Gabriel Cazonato) — 09/07/2026

## Contexto

O Estúdio IA (`routes/estudio.py` + `services/estudio_ia_service.py`) gera persona/oferta direcionada usando a metodologia do Gabriel Cazonato como referência conceitual (o prompt já usa os mesmos termos: "persona majoritária", "oferta direcionada", estrutura dor→solução→objeção). A skill real (`~/.claude/skills/identificador-persona-gabriel-cazonato/SKILL.md`) é um processo de 6 fases com coleta de evidência real — perguntas de compradores, avaliações, Reclame Aqui, redes sociais, Google Trends — cada conclusão da persona precisa vir de um dado coletado.

Hoje o backend do Estúdio IA não coleta nenhuma dessas evidências: manda pro GPT-4o-mini só números agregados por produto (preço, `vendas_dia_media`, `visitas_30d`, `nota`, `num_avaliacoes`) e pede pra ele inferir a persona num único prompt. A chamada a `/reviews/item/{id}` (já existente em `_buscar_reviews_item`) já traz o texto dos comentários de avaliação na resposta, mas o código só extrai `rating_average` e `total` — descarta o resto.

## Objetivo

Alimentar a geração de persona do Estúdio IA com evidência real de compradores — perguntas e avaliações com texto, via API oficial do Mercado Livre — em vez de só números agregados, aproximando o resultado da metodologia original sem depender de scraping de fontes sem API oficial (Reclame Aqui, redes sociais, Google Trends ficam fora do escopo).

## Escopo

- Repositório: `ml-seller-api`. Sem mudança de frontend além de uma possível linha extra no texto do resultado (a UI já renderiza o markdown/texto gerado, não precisa de campo estruturado novo).
- Evidência coletada apenas para os **top 5 produtos** do resultado de busca (mesmo escopo da metodologia original — não os 15 retornados pro mercado geral).
- Fontes cobertas: **perguntas** (`GET /questions/search?item=<id>`) e **avaliações com texto** (extensão de `_buscar_reviews_item`, que já chama `/reviews/item/{id}`).
- Fora de escopo: Reclame Aqui, redes sociais (TikTok/Instagram/Pinterest/YouTube), Google Trends/autocomplete — sem API oficial, ficam de fora; o resultado final deixa essa limitação explícita.
- Fora de escopo: fluxo de checkpoints do usuário por fase (a skill real é interativa; o Estúdio IA continua sendo um fluxo automático de um clique — "Analisar").

## Coleta de evidência

Nova função em `routes/estudio.py`, chamada logo após `_enriquecer_produtos`/`_aplicar_vendas_reais` em `buscar_produtos`, só para os 5 produtos de maior `total_faturado`/mais vendidos do resultado:

- **Perguntas:** `GET /questions/search?item=<item_id>` (paginado), até 20 perguntas por produto. Para cada uma: texto da pergunta + resposta do vendedor (quando houver, campo `answer.text`).
- **Avaliações:** extensão de `_buscar_reviews_item` — extrair também o array `reviews` (campo de comentário/texto de cada avaliação, quando presente — nem toda avaliação tem texto, várias são só nota), até 30 avaliações com texto por produto.
- Busca paralela (`ThreadPoolExecutor`, mesmo padrão de `_enriquecer_produtos`), best-effort: falha em um produto não derruba os outros nem a busca inteira — produto sem evidência coletada simplesmente entra no prompt sem essa seção, sem erro visível ao usuário.
- Resultado agregado (contagem total de perguntas e avaliações coletadas, e a lista de textos) fica disponível para o prompt e para a citação de fonte no resultado final.

## Prompt

`services/estudio_ia_service.py::montar_prompt` ganha uma nova seção (texto real, antes da seção de persona) com as perguntas e avaliações coletadas, formatadas de forma legível (ex: `"Pergunta: ... | Resposta: ..."`, `"Avaliação (nota X): ..."`). O prompt de persona (`SECAO_PERSONA`) passa a instruir explicitamente: basear dores/objeções nesse texto real quando disponível, e não inventar quando a evidência for escassa (mesmo princípio de "não invente" já usado no `_EXTRACAO_SYSTEM`).

## Transparência do resultado

O texto gerado passa a citar a evidência usada, no mesmo espírito do cabeçalho `> Fontes consultadas` da skill original — ex.: "Baseado em 38 perguntas e 95 avaliações reais dos 5 anúncios mais vendidos." Quando a coleta vier vazia ou parcial (produto sem perguntas/avaliações, ou falha da API), o texto deve declarar isso em vez de omitir silenciosamente.

## Erro/latência

- Mesma UX atual (spinner "Analisando..."); a coleta roda em paralelo e adiciona alguns segundos ao tempo total — sem mudança de interface.
- Falha total da coleta de evidência (ex: `/questions/search` fora do ar) não deve quebrar a análise — cai para o comportamento atual (números agregados apenas), com a citação de fonte refletindo isso ("Análise baseada em dados de mercado; perguntas e avaliações não puderam ser coletadas desta vez").

## Critérios de sucesso

- Para uma busca com produtos que têm perguntas/avaliações reais no Mercado Livre, o resultado final cita a contagem real coletada (não um valor fixo/fantasma).
- As dores/objeções geradas fazem referência a temas que aparecem de fato no texto das perguntas/avaliações coletadas (verificável por amostragem manual).
- Falha de coleta em um produto não impede a análise dos outros 4, nem quebra o fluxo de geração.
- Nenhuma tentativa de coletar Reclame Aqui/redes sociais/Google Trends nesta rodada — texto do resultado não afirma ter analisado essas fontes.
