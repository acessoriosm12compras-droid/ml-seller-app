import { render, act, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../context/ThemeContext'
import { AuthProvider, useAuth } from '../context/AuthContext'
import NotasFiscais from './NotasFiscais'

// Mimica o gate real de src/components/ProtectedRoute.jsx (`if (loading) return null`).
function FakeProtectedRoute({ children }) {
  const { loading } = useAuth()
  if (loading) return null
  return children
}

function sessionFor(conta_ml) {
  return {
    data: { session: { access_token: 'REAL_JWT_TOKEN_XYZ', user: { user_metadata: { conta_ml, role: 'admin' } } } },
  }
}

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
  api: {
    minhasContas: vi.fn().mockResolvedValue({ contas: ['YUSO', 'J12'] }),
    notasFiscais: {
      listar: vi.fn().mockResolvedValue({ notas: [] }),
      status: vi.fn().mockResolvedValue({ certificados_vencendo: [] }),
    },
  },
}))

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthProvider>
          <QueryClientProvider client={qc}>
            <FakeProtectedRoute>
              <NotasFiscais />
            </FakeProtectedRoute>
          </QueryClientProvider>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>
  )
}

test('mostra estado vazio (não branco/erro) quando não há notas, e trocar "Tipo" não quebra a tela', async () => {
  const { container, getByText } = renderPage()

  await act(async () => { await new Promise(r => setTimeout(r, 50)) })

  expect(getByText(/Nenhuma nota fiscal capturada/i)).toBeTruthy()

  const select = container.querySelector('select')
  expect(select).toBeTruthy()
  fireEvent.change(select, { target: { value: 'saida' } })

  await act(async () => { await new Promise(r => setTimeout(r, 50)) })

  // Ainda no estado vazio, sem crash / tela branca
  expect(getByText(/Nenhuma nota fiscal capturada/i)).toBeTruthy()
  const main = container.querySelector('main')
  expect(main.innerHTML.length).toBeGreaterThan(0)
})

test('conta sem certificado configurado (J12) mostra aviso e não renderiza o filtro/tabela', async () => {
  const { supabase } = await import('../lib/supabase')
  supabase.auth.getSession.mockResolvedValueOnce(sessionFor('J12'))

  const { container, getByText } = renderPage()

  await act(async () => { await new Promise(r => setTimeout(r, 50)) })

  expect(getByText(/ainda não tem certificado\/captura fiscal configurados/i)).toBeTruthy()
  expect(container.querySelector('select')).toBeFalsy()
})
