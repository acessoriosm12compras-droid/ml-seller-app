const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

let _getToken = () => null

export function setTokenProvider(fn) {
  _getToken = fn
}

async function request(path, options = {}) {
  const token = _getToken()
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.erro || `HTTP ${res.status}`), { status: res.status })
  }
  return res.json()
}

export const api = {
  me: () => request('/auth/me'),
  minhasContas: () => request('/auth/minhas-contas'),
  mlUrl: (conta, redirect = '/onboarding') =>
    request(`/auth/ml/url?conta=${encodeURIComponent(conta)}&redirect=${encodeURIComponent(redirect)}`),
  plano: () => request('/api/plano'),

  dashboard: (params) =>
    request(`/api/dashboard?${new URLSearchParams(params)}`),

  pedidos: (params) =>
    request(`/api/pedidos?${new URLSearchParams(params)}`),

  pedido: (id, params = {}) =>
    request(`/api/pedidos/${id}?${new URLSearchParams(params)}`),

  financeiro: (params) =>
    request(`/api/financeiro?${new URLSearchParams(params)}`),

  fluxoCaixa: (params) =>
    request(`/api/fluxo-caixa?${new URLSearchParams(params)}`),
  salvarFluxoCaixa: (body) =>
    request('/api/fluxo-caixa', { method: 'PUT', body: JSON.stringify(body) }),

  margem: (params) =>
    request(`/api/margem?${new URLSearchParams(params)}`),

  ranqueamento: () =>
    request('/api/ranqueamento'),

  atualizarRanqueamento: () =>
    request('/api/ranqueamento/atualizar', { method: 'POST' }),

  resultado: (params) =>
    request(`/api/resultado?${new URLSearchParams(params)}`),

  custos: {
    list: (params) =>
      request(`/api/custos?${new URLSearchParams(params)}`),
    save: (data) =>
      request('/api/custos', { method: 'POST', body: JSON.stringify(data) }),
  },

  admin: {
    listarUsuarios: () => request('/admin/usuarios'),
    criarUsuario: (data) => request('/admin/usuarios', { method: 'POST', body: JSON.stringify(data) }),
    editarUsuario: (id, data) => request(`/admin/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    toggleAtivo: (id, ativo) => request(`/admin/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify({ ativo }) }),
  },

  pluggy: {
    connectToken: (data) => request('/api/financeiro/pluggy/connect-token', { method: 'POST', body: JSON.stringify(data) }),
    saveItem: (data) => request('/api/financeiro/pluggy/save-item', { method: 'POST', body: JSON.stringify(data) }),
    sync: () => request('/api/financeiro/pluggy/sync', { method: 'POST' }),
  },

  conciliacao: (params) => request(`/api/financeiro/conciliacao?${new URLSearchParams(params)}`),

  projecao: (params) => request(`/api/financeiro/projecao?${new URLSearchParams(params)}`),

  vendas: (params) => request(`/api/vendas?${new URLSearchParams(params)}`),

  graficos: (params) => request(`/api/graficos?${new URLSearchParams(params)}`),

  analitico: {
    produtos: (params) => request(`/api/analitico/produtos?${new URLSearchParams(params)}`),
    vendasPorAnuncio: (params) => request(`/api/analitico/vendas-por-anuncio?${new URLSearchParams(params)}`),
  },

  curvaAbc: (params) => request(`/api/curva-abc?${new URLSearchParams(params)}`),

  movimentacoes: {
    list: (params) => request(`/api/movimentacoes?${new URLSearchParams(params)}`),
    create: (data) => request('/api/movimentacoes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/api/movimentacoes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/api/movimentacoes/${id}`, { method: 'DELETE' }),
  },

  financeiroResumo: {
    mensal: (params) => request(`/api/financeiro/resumo?${new URLSearchParams(params)}`),
    anual: (params) => request(`/api/financeiro/resumo/anual?${new URLSearchParams(params)}`),
  },

  gerenciamento: {
    anuncios: (params) => request(`/api/gerenciamento/anuncios?${new URLSearchParams(params)}`),
    atualizarAnuncio: (itemId, data) => request(`/api/gerenciamento/anuncios/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
  },

  inventario: (params) => request(`/api/inventario/full?${new URLSearchParams(params)}`),

  sync: {
    trigger: (data) => request('/api/sync', { method: 'POST', body: JSON.stringify(data || {}) }),
    status: () => request('/api/sync/status'),
    state: () => request('/api/sync/state'),
  },

  configuracoes: {
    contas: () => request('/api/configuracoes/contas'),
    updateImposto: (nome, imposto) =>
      request(`/api/configuracoes/contas/${encodeURIComponent(nome)}/imposto`, {
        method: 'PATCH',
        body: JSON.stringify({ imposto }),
      }),
  },

  fechamento: {
    compras: {
      list: (params) => request(`/api/fechamento/compras?${new URLSearchParams(params)}`),
      create: (data, params = {}) => request(`/api/fechamento/compras?${new URLSearchParams(params)}`, { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data, params = {}) => request(`/api/fechamento/compras/${id}?${new URLSearchParams(params)}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id, params = {}) => request(`/api/fechamento/compras/${id}?${new URLSearchParams(params)}`, { method: 'DELETE' }),
    },
    fretes: {
      list: (params) => request(`/api/fechamento/fretes?${new URLSearchParams(params)}`),
      create: (data, params = {}) => request(`/api/fechamento/fretes?${new URLSearchParams(params)}`, { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data, params = {}) => request(`/api/fechamento/fretes/${id}?${new URLSearchParams(params)}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id, params = {}) => request(`/api/fechamento/fretes/${id}?${new URLSearchParams(params)}`, { method: 'DELETE' }),
    },
    montagem: {
      list: (params) => request(`/api/fechamento/montagem?${new URLSearchParams(params)}`),
      create: (data, params = {}) => request(`/api/fechamento/montagem?${new URLSearchParams(params)}`, { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data, params = {}) => request(`/api/fechamento/montagem/${id}?${new URLSearchParams(params)}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id, params = {}) => request(`/api/fechamento/montagem/${id}?${new URLSearchParams(params)}`, { method: 'DELETE' }),
    },
    despesas: {
      list: (params) => request(`/api/fechamento/despesas?${new URLSearchParams(params)}`),
      create: (data, params = {}) => request(`/api/fechamento/despesas?${new URLSearchParams(params)}`, { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data, params = {}) => request(`/api/fechamento/despesas/${id}?${new URLSearchParams(params)}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id, params = {}) => request(`/api/fechamento/despesas/${id}?${new URLSearchParams(params)}`, { method: 'DELETE' }),
    },
    contaSimples: {
      status: () => request('/api/fechamento/contasimples/status'),
      sync: (mes_ano, conta_ml) =>
        request(`/api/fechamento/contasimples/sync${conta_ml ? `?conta_ml=${encodeURIComponent(conta_ml)}` : ''}`, {
          method: 'POST',
          body: JSON.stringify({ mes_ano }),
        }),
    },
  },

  ads: (params) =>
    request(`/api/ads/campanhas?${new URLSearchParams(params)}`),

  reposicao: {
    semanal: (params) => request(`/api/reposicao/semanal?${new URLSearchParams(params)}`),
    atualizarEstoqueMinimo: (data) =>
      request('/api/reposicao/estoque-minimo', { method: 'PUT', body: JSON.stringify(data) }),
  },

  estudio: {
    buscar: (params) => request(`/api/estudio/buscar?${new URLSearchParams(params)}`),
    historico: (limit = 20) => request(`/api/estudio/historico?limit=${limit}`),
    get: (id) => request(`/api/estudio/${id}`),
    gerarConteudo: (data) =>
      request('/api/estudio/conteudo', { method: 'POST', body: JSON.stringify(data) }),
    salvarConteudo: (id, conteudo, bloco) =>
      request(`/api/estudio/${id}/conteudo`, {
        method: 'PATCH',
        body: JSON.stringify(bloco ? { bloco, conteudo } : { conteudo }),
      }),
  },
}
