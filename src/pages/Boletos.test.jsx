import { render, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../context/ThemeContext'
import { AuthProvider, useAuth } from '../context/AuthContext'
import Boletos from './Boletos'

// Mimica o gate real de src/components/ProtectedRoute.jsx (`if (loading) return null`),
// que é o que garante em produção que a sessão já está pronta antes de montar a página.
function FakeProtectedRoute({ children }) {
  const { loading } = useAuth()
  if (loading) return null
  return children
}

// Mock Supabase com uma sessão real (access_token presente), igual ao padrão
// já usado em AuthContext.test.jsx.
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'REAL_JWT_TOKEN_XYZ', user: { user_metadata: { conta_ml: 'YUSO', role: 'admin' } } } },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}))
vi.mock('../api', () => ({
  setTokenProvider: vi.fn(),
  api: { minhasContas: vi.fn().mockResolvedValue({ contas: ['YUSO'] }) },
}))

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ pendentes: [], pagos: [], total_pendente: 0, total_pago: 0 }),
})

// Regressão do bug: Boletos.jsx desestruturava `const { token } = useAuth()`, mas
// AuthContext nunca expôs um campo `token` (só a função `getToken()`) — então o
// header Authorization sempre ia como "Bearer undefined" e todo request real do MP
// batia em 401 no backend. Este teste garante que o token real da sessão é enviado.
test('envia o access_token real da sessão (não "Bearer undefined") no header Authorization', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { container } = render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthProvider>
          <QueryClientProvider client={qc}>
            <FakeProtectedRoute>
              <Boletos />
            </FakeProtectedRoute>
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>
  )

  await act(async () => { await new Promise(r => setTimeout(r, 50)) })

  expect(fetch).toHaveBeenCalled()
  const [, options] = fetch.mock.calls[0]
  expect(options.headers.Authorization).toBe('Bearer REAL_JWT_TOKEN_XYZ')

  const main = container.querySelector('main')
  expect(main.innerHTML.length).toBeGreaterThan(0)
})
