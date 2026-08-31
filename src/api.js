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
    // `body` carrega o payload de erro inteiro (ex.: ja_capturado_em do 409
    // de estoque_mensal) — algumas telas precisam de mais do que a mensagem.
    throw Object.assign(new Error(err.erro || `HTTP ${res.status}`), { status: res.status, body: err })
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
    convidar: (data) => request('/admin/usuarios/convidar', { method: 'POST', body: JSON.stringify(data) }),
    linkAcesso: (id) => request(`/admin/usuarios/${id}/link-acesso`, { method: 'POST' }),
  },

  vendas: (params) => request(`/api/vendas?${new URLSearchParams(params)}`),

  graficos: (params) => request(`/api/graficos?${new URLSearchParams(params)}`),

  analitico: {
    produtos: (params) => request(`/api/analitico/produtos?${new URLSearchParams(params)}`),
    vendasPorAnuncio: (params) => request(`/api/analitico/vendas-por-anuncio?${new URLSearchParams(params)}`),
  },

  curvaAbc: (params) => request(`/api/curva-abc?${new URLSearchParams(params)}`),

  gerenciamento: {
    anuncios: (params) => request(`/api/gerenciamento/anuncios?${new URLSearchParams(params)}`),
    atualizarAnuncio: (itemId, data) => request(`/api/gerenciamento/anuncios/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
  },

  inventario: (params) => request(`/api/inventario/full?${new URLSearchParams(params)}`),
  inventarioIntencao: (body) => request('/api/inventario/intencao', { method: 'POST', body: JSON.stringify(body) }),

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
    despesasUnificadas: (params) => request(`/api/fechamento/despesas-unificadas?${new URLSearchParams(params)}`),
    despesas: {
      list: (params) => request(`/api/fechamento/despesas?${new URLSearchParams(params)}`),
      create: (data, params = {}) => request(`/api/fechamento/despesas?${new URLSearchParams(params)}`, { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data, params = {}) => request(`/api/fechamento/despesas/${id}?${new URLSearchParams(params)}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id, params = {}) => request(`/api/fechamento/despesas/${id}?${new URLSearchParams(params)}`, { method: 'DELETE' }),
    },
    lucroReal: (params) => request(`/api/fechamento/lucro-real?${new URLSearchParams(params)}`),
    estoque: {
      get: (params) => request(`/api/fechamento/estoque?${new URLSearchParams(params)}`),
      registrar: (data, params = {}) => request(`/api/fechamento/estoque?${new URLSearchParams(params)}`, { method: 'POST', body: JSON.stringify(data) }),
    },
    // Contagem do galpão: por mês e por dono da conta, NÃO por loja — por isso
    // não leva conta_ml e vive fora de `estoque`.
    galpao: {
      get: (params) => request(`/api/fechamento/galpao?${new URLSearchParams(params)}`),
      salvar: (data) => request('/api/fechamento/galpao', { method: 'PUT', body: JSON.stringify(data) }),
    },
  },

  ads: (params) =>
    request(`/api/ads/campanhas?${new URLSearchParams(params)}`),

  reposicao: {
    semanal: (params) => request(`/api/reposicao/semanal?${new URLSearchParams(params)}`),
    atualizarEstoqueMinimo: (data) =>
      request('/api/reposicao/estoque-minimo', { method: 'PUT', body: JSON.stringify(data) }),
    atualizarSemanasCobertura: (semanas, conta_ml) =>
      request(`/api/reposicao/semanas-cobertura?${new URLSearchParams({ conta_ml })}`, {
        method: 'PATCH',
        body: JSON.stringify({ semanas }),
      }),
  },

  metas: {
    get: (params) => request(`/api/metas?${new URLSearchParams(params)}`),
    save: (data) => request('/api/metas', { method: 'PUT', body: JSON.stringify(data) }),
  },

  resumoDia: {
    get: (params) => request(`/api/resumo-dia?${new URLSearchParams(params)}`),
  },

  perguntas: (params) =>
    request(`/api/perguntas?${new URLSearchParams(params)}`),
  responderPergunta: (id, texto, conta_ml) =>
    request(`/api/perguntas/${id}/responder?${new URLSearchParams({ conta_ml: conta_ml || '' })}`, {
      method: 'POST',
      body: JSON.stringify({ texto }),
    }),
  recusarPergunta: (id, conta_ml) =>
    request(`/api/perguntas/${id}/recusar?${new URLSearchParams({ conta_ml: conta_ml || '' })}`, {
      method: 'POST',
    }),

  estudio: {
    buscar: (params) => request(`/api/estudio/buscar?${new URLSearchParams(params)}`),
    historico: (limit = 20, conta_ml) =>
      request(`/api/estudio/historico?${new URLSearchParams({ limit, ...(conta_ml ? { conta_ml } : {}) })}`),
    get: (id, conta_ml) =>
      request(`/api/estudio/${id}${conta_ml ? `?${new URLSearchParams({ conta_ml })}` : ''}`),
    gerarConteudo: (data) =>
      request('/api/estudio/conteudo', { method: 'POST', body: JSON.stringify(data) }),
    salvarConteudo: (id, conteudo, bloco, conta_ml) =>
      request(`/api/estudio/${id}/conteudo`, {
        method: 'PATCH',
        body: JSON.stringify({ ...(bloco ? { bloco, conteudo } : { conteudo }), ...(conta_ml ? { conta_ml } : {}) }),
      }),
    remover: (ids, conta_ml) =>
      request(`/api/estudio${conta_ml ? `?${new URLSearchParams({ conta_ml })}` : ''}`, {
        method: 'DELETE',
        body: JSON.stringify({ ids }),
      }),
  },
}
