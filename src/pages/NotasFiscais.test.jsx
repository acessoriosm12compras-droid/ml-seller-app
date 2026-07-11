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

test('escolher um mês filtra por data_de/data_ate (primeiro e último dia do mês) e "Limpar mês" reseta', async () => {
  const { api } = await import('../api')
  const { container, queryByText } = renderPage()

  await act(async () => { await new Promise(r => setTimeout(r, 50)) })

  const inputMes = container.querySelector('input[type="month"]')
  expect(inputMes).toBeTruthy()

  fireEvent.change(inputMes, { target: { value: '2026-06' } })
  await act(async () => { await new Promise(r => setTimeout(r, 50)) })

  const ultimaChamada = api.notasFiscais.listar.mock.calls.at(-1)[0]
  expect(ultimaChamada.data_de).toBe('2026-06-01')
  expect(ultimaChamada.data_ate).toBe('2026-06-30')

  expect(queryByText('Limpar mês')).toBeTruthy()
  fireEvent.click(queryByText('Limpar mês'))
  await act(async () => { await new Promise(r => setTimeout(r, 50)) })

  expect(inputMes.value).toBe('')
  const chamadaFinal = api.notasFiscais.listar.mock.calls.at(-1)[0]
  expect(chamadaFinal.data_de).toBeUndefined()
  expect(chamadaFinal.data_ate).toBeUndefined()
})

test('conta sem certificado configurado (J12) mostra aviso e não renderiza o filtro/tabela', async () => {
  const { supabase } = await import('../lib/supabase')
  supabase.auth.getSession.mockResolvedValueOnce(sessionFor('J12'))

  const { container, getByText } = renderPage()

  await act(async () => { await new Promise(r => setTimeout(r, 50)) })

  expect(getByText(/ainda não tem certificado\/captura fiscal configurados/i)).toBeTruthy()
  expect(container.querySelector('select')).toBeFalsy()
})
