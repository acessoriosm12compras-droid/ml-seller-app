const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.erro || `HTTP ${res.status}`), { status: res.status })
  }
  return res.json()
}

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  logout: () =>
    request('/auth/logout', { method: 'POST' }),

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
    const form = new FormData()
    form.append('arquivo', file)
    return fetch(`${BASE}/api/importar-custos`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw Object.assign(new Error(err.erro || `HTTP ${res.status}`), { status: res.status })
      }
      return res.json()
    })
  },
}
