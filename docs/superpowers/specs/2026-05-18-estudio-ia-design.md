# Estúdio IA — Design Spec
_Data: 2026-05-18_

## Resumo

Nova página `/estudio-ia` no ML Seller Dashboard que usa Claude para gerar estudos de produto completos com base nos melhores vendedores do Mercado Livre para um termo de busca. O formato de saída espelha o "Estudo de Persona" (ex: `persona-cabo-hdmi-yuso.md`) validado por Gabriel.

---

## Fluxo do Usuário

1. Usuária digita um termo de busca (ex: "suporte para notebook")
2. Sistema busca os top 5 produtos mais vendidos no ML para esse termo
3. Usuária seleciona o tipo de conteúdo a gerar (Estudo Completo / Prompts Imagem / Prompts Vídeo / Tudo)
4. Claude gera o conteúdo via streaming
5. Resultado exibido em tabs (Estudo | Imagem | Vídeo) com botão copiar

---

## Arquitetura

### Backend — `routes/estudio.py`

**`GET /api/estudio/buscar?termo=<termo>`**
- Usa ML Search API pública: `https://api.mercadolivre.com.br/sites/MLB/search?q=<termo>&sort=sold_quantity_desc&limit=5`
- Não exige token de usuário (API pública do ML)
- Retorna: `[{ id, title, price, sold_quantity, thumbnail, permalink }]`

**`POST /api/estudio/gerar`** (streaming SSE)
- Body: `{ termo, produtos: [...], tipos: ["estudo", "imagem", "video"] }`
- Usa SDK Anthropic (`anthropic.Anthropic`) com streaming
- Retorna `text/event-stream` com chunks do Claude
- Modelo: `claude-sonnet-4-5` (suficiente, custo/benefício)

### Frontend — `src/pages/EstudioIA.jsx`

**Step 1 — Busca:**
- Input de texto para o termo
- Botão "Buscar no ML"
- Lista dos 5 resultados com thumbnail, título, preço, vendas
- Clique para selecionar produto (highlight azul)

**Step 2 — O que gerar:**
- Pills selecionáveis: Estudo Completo | Prompts Imagem | Prompts Vídeo | Tudo

**Step 3 — Resultado:**
- Tabs: Estudo | Imagem | Vídeo
- Conteúdo com streaming visível (texto aparece progressivamente)
- Botão "Copiar tudo" por tab
- Botão "Regenerar"

---

## Conteúdo Gerado pelo Claude

### Tab Estudo Completo (5 seções)
1. **Público-alvo & Avatar** — quem compra, dores, desejos, faixa etária
2. **Copy & Argumentos de Venda** — headline, bullets de benefícios, CTA, objeções
3. **Palavras-chave & SEO ML** — termos relevantes para título e descrição
4. **Posicionamento & Diferenciais** — como se destacar, proposta de valor única
5. **Descrição otimizada** — texto pronto para colar no ML

### Tab Prompts Imagem
- **Midjourney**: prompt com `--ar 1:1 --style raw --v 6` etc.
- **Genérico**: prompt universal detalhado

### Tab Prompts Vídeo
- **Kling AI**: prompt focado em movimento realista de produto
- **Script Reels/TikTok**: roteiro gravado (gancho + demonstração + CTA)

---

## Prompt Claude (sistema)

```
Você é um especialista em e-commerce e Mercado Livre com foco em produtos brasileiros.
Com base nos dados dos top {N} vendedores do ML para "{termo}", gere um estudo completo.

Produtos encontrados:
{lista de produtos com título, preço, vendas}

Formato: markdown limpo, seções com ##, bullets, tabelas onde relevante.
Idioma: Português brasileiro, tom profissional mas direto.
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---|---|
| `ml-seller-api/requirements.txt` | Adicionar `anthropic>=0.28.0` |
| `ml-seller-api/routes/estudio.py` | Criar (blueprint `estudio_bp`) |
| `ml-seller-api/app.py` | Registrar `estudio_bp` |
| `ml-seller-app/src/pages/EstudioIA.jsx` | Criar página |
| `ml-seller-app/src/App.jsx` | Adicionar route `/estudio-ia` |
| `ml-seller-app/src/components/Sidebar.jsx` | Adicionar item nav com ícone `Sparkles` |

---

## Decisões Técnicas

- **Streaming via SSE**: Flask `Response` com `stream_with_context` + `text/event-stream`; frontend usa `fetch` com `getReader()` para consumir chunks
- **Sem auth em `/buscar`**: ML search API é pública; `/gerar` exige `jwt_required` (consome API Anthropic paga)
- **Nenhum produto próprio**: busca sempre no ML por termo, não por ID de anúncio da usuária
- **Claude model**: `claude-sonnet-4-5` — balanço ideal entre qualidade e custo para este caso de uso
- **Sem persistência**: resultados não são salvos no DB (v1); usuária copia o que precisar

---

## Fora do Escopo (v1)

- Salvar histórico de estudos
- Buscar avaliações reais dos produtos (precisaria scraping)
- Seleção múltipla de produtos para comparação
- Export para PDF
