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

  importarCustos: (file) => {
    const token = _getToken()
    const form = new FormData()
    form.append('arquivo', file)
    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    return fetch(`${BASE}/api/importar-custos`, {
      method: 'POST',
      headers,
      body: form,
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw Object.assign(new Error(err.erro || `HTTP ${res.status}`), { status: res.status })
      }
      return res.json()
    })
  },

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
}
