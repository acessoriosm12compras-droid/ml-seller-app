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

  dashboard: (params) =>
    request(`/api/dashboard?${new URLSearchParams(params)}`),

  pedidos: (params) =>
    request(`/api/pedidos?${new URLSearchParams(params)}`),

  pedido: (id) =>
    request(`/api/pedidos/${id}`),

  financeiro: (params) =>
    request(`/api/financeiro?${new URLSearchParams(params)}`),

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
      list: (mes_ano) => request(`/api/fechamento/compras?mes_ano=${mes_ano}`),
      create: (data) => request('/api/fechamento/compras', { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data) => request(`/api/fechamento/compras/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id) => request(`/api/fechamento/compras/${id}`, { method: 'DELETE' }),
    },
    fretes: {
      list: (mes_ano) => request(`/api/fechamento/fretes?mes_ano=${mes_ano}`),
      create: (data) => request('/api/fechamento/fretes', { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data) => request(`/api/fechamento/fretes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id) => request(`/api/fechamento/fretes/${id}`, { method: 'DELETE' }),
    },
    montagem: {
      list: (mes_ano) => request(`/api/fechamento/montagem?mes_ano=${mes_ano}`),
      create: (data) => request('/api/fechamento/montagem', { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data) => request(`/api/fechamento/montagem/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id) => request(`/api/fechamento/montagem/${id}`, { method: 'DELETE' }),
    },
    despesas: {
      list: (mes_ano) => request(`/api/fechamento/despesas?mes_ano=${mes_ano}`),
      create: (data) => request('/api/fechamento/despesas', { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data) => request(`/api/fechamento/despesas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id) => request(`/api/fechamento/despesas/${id}`, { method: 'DELETE' }),
    },
  },

  ads: (params) =>
    request(`/api/ads/campanhas?${new URLSearchParams(params)}`),
}
