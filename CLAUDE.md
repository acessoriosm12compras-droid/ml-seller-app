# Seller ML — Frontend (ml-seller-app)

Contexto essencial para sessões de IA (Claude Code / Cowork) e novos devs.

## O que é

Frontend React do dashboard Seller ML (vendedores Mercado Livre, contas YUSO/M12/J12/LOCITECH). Produção: https://app.sellerml.com.br

- **Stack:** React + Vite, React Query, Tailwind CSS, lucide-react
- **Backend:** repo `ml-seller-api-` (Flask) — base URL e client HTTP em `src/api.js` (wrapper `request()` injeta o JWT Supabase)
- **Deploy:** EasyPanel — push na `main` dispara build automático

## Padrões do projeto

1. Toda chamada de API passa `conta_ml: activeAccount` (do `AuthContext`) como query param quando presente, e inclui `activeAccount` nas queryKeys do React Query (cache separado por conta). Ver `src/pages/Fechamento.jsx` e `PedidoDetalhe.jsx` como referência.
2. Sem sistema de toast — feedback é por banners inline (verde sucesso / vermelho erro), padrão das páginas.
3. Sidebar (`src/components/Sidebar.jsx`): fixa (sticky, h-screen), sempre expandida (200px), "Sair" preso no rodapé. Mobile usa bottom tab bar separada — não mexer ao alterar a sidebar desktop.
4. Rotas: a página de custos é `/custos-produtos` (a rota antiga `/configuracoes/custos` NÃO existe — já causou bug de link 404 no dashboard).

## Fechamento (atualizado em 12/06/2026)

`src/pages/Fechamento.jsx`: seções Compras, Fretes, Montagem e Despesas Variáveis por mês (`<input type="month">`) e conta ativa. Na seção Despesas há o botão "Sincronizar Conta Simples" → `api.fechamento.contaSimples.sync(mes_ano, conta_ml)`; após sucesso invalida a query das despesas. GET `/api/fechamento/contasimples/status` controla habilitação do botão.

## Comandos

- Build: `npm run build` (em sandbox com pasta montada, use `npx vite build --outDir /tmp/dist` por causa de EPERM ao esvaziar `dist/`)
- Dev: `npm run dev` (localhost:5173)
