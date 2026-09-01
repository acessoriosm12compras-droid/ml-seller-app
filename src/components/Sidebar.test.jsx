import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, beforeEach, describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Sidebar from './Sidebar'

// FIX 4 (badge falha aberto) + FIX 5 (badge só cobria a loja selecionada):
// o contador de perguntas pendentes é o único sinal que ela tem agora que o
// Telegram está desligado.

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const perguntasContagem = vi.fn()
vi.mock('../api', () => ({
  api: {
    perguntasContagem: (...args) => perguntasContagem(...args),
  },
}))

function renderSidebar() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Sidebar — badge de perguntas pendentes', () => {
  it('soma as pendentes de todas as lojas ativas, não só a selecionada para edição', async () => {
    mockUseAuth.mockReturnValue({
      logout: vi.fn(),
      role: 'admin',
      editAccount: 'LOCITECH',
      activeAccounts: ['YUSO', 'LOCITECH'],
    })
    perguntasContagem.mockImplementation((conta) =>
      Promise.resolve({ pendentes: conta === 'YUSO' ? 3 : 2, conta_ml: conta })
    )

    renderSidebar()

    // O título (tooltip) do marcador identifica a loja — testável sem
    // precisar expandir a sidebar (o ponto discreto já carrega o title).
    await waitFor(() => {
      const marcadores = screen.getAllByTitle(/YUSO: 3.*LOCITECH: 2|LOCITECH: 2.*YUSO: 3/)
      expect(marcadores.length).toBeGreaterThan(0)
    })
  })

  it('mostra o total somado ao expandir (hover), não só o da loja selecionada', async () => {
    mockUseAuth.mockReturnValue({
      logout: vi.fn(),
      role: 'admin',
      editAccount: 'LOCITECH',
      activeAccounts: ['YUSO', 'LOCITECH'],
    })
    perguntasContagem.mockImplementation((conta) =>
      Promise.resolve({ pendentes: conta === 'YUSO' ? 3 : 2, conta_ml: conta })
    )

    const { container } = renderSidebar()
    const aside = container.querySelector('aside')
    fireEvent.mouseEnter(aside)

    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument(), { timeout: 1000 })
  })

  it('mostra um marcador neutro (não some, não vira 0) quando a checagem falha', async () => {
    mockUseAuth.mockReturnValue({
      logout: vi.fn(),
      role: 'user',
      editAccount: 'YUSO',
      activeAccounts: ['YUSO'],
    })
    perguntasContagem.mockRejectedValue(new Error('403'))

    renderSidebar()

    await waitFor(() => {
      const marcadores = screen.getAllByTitle(/Não consegui checar/i)
      expect(marcadores.length).toBeGreaterThan(0)
    })
    // o marcador de erro não pode ter a cor de "tem pergunta pendente"
    const marcadores = screen.getAllByTitle(/Não consegui checar/i)
    marcadores.forEach((m) => expect(m).not.toHaveClass('bg-red-500'))
  })

  it('não mostra nenhum marcador quando não há pendentes e nada falhou', async () => {
    mockUseAuth.mockReturnValue({
      logout: vi.fn(),
      role: 'user',
      editAccount: 'YUSO',
      activeAccounts: ['YUSO'],
    })
    perguntasContagem.mockResolvedValue({ pendentes: 0, conta_ml: 'YUSO' })

    renderSidebar()

    await waitFor(() => expect(perguntasContagem).toHaveBeenCalled())
    expect(screen.queryByTitle(/YUSO: 0/)).not.toBeInTheDocument()
  })
})
