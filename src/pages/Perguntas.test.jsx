import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { vi, beforeEach, describe, it, expect } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '../context/ThemeContext'
import Perguntas from './Perguntas'

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const perguntasGet = vi.fn()
const responderPergunta = vi.fn()
const excluirPergunta = vi.fn()
vi.mock('../api', () => ({
  api: {
    perguntas: (...args) => perguntasGet(...args),
    responderPergunta: (...args) => responderPergunta(...args),
    excluirPergunta: (...args) => excluirPergunta(...args),
  },
}))

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <Perguntas />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

function pergunta(overrides = {}) {
  return {
    question_id: 1,
    conta_ml: 'YUSO',
    item_id: 'MLB1',
    item_titulo: 'Cabo HDMI',
    texto_pergunta: 'funciona na tv?',
    resposta_sugerida: 'Sim, funciona.',
    resposta_final: null,
    status: 'pendente',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({
    role: 'user',
    editAccount: 'YUSO',
    activeAccounts: ['YUSO'],
    setEditAccount: vi.fn(),
    setActiveAccounts: vi.fn(),
  })
})

// FIX 6 — a exclusão no ML só pode existir para contas com briefing (YUSO e
// LOCITECH). M12 e J12 são explicitamente fora de escopo: as perguntas
// delas continuam aparecendo na tela, mas o botão que apaga de verdade no
// Mercado Livre não pode renderizar pra elas.
describe('Perguntas — botão de excluir restrito às contas em escopo', () => {
  it('mostra "Excluir no ML" para uma pergunta da YUSO', async () => {
    perguntasGet.mockImplementation(({ status }) =>
      Promise.resolve({ perguntas: status === 'pendente' ? [pergunta({ question_id: 1, conta_ml: 'YUSO' })] : [] })
    )
    renderPage()

    const card = (await screen.findByText(/funciona na tv\?/)).closest('div.rounded-xl')
    expect(within(card).getByText('Excluir no ML')).toBeInTheDocument()
  })

  it('NÃO mostra "Excluir no ML" para uma pergunta da M12 (fora de escopo)', async () => {
    perguntasGet.mockImplementation(({ status }) =>
      Promise.resolve({
        perguntas: status === 'pendente' ? [pergunta({ question_id: 2, conta_ml: 'M12', texto_pergunta: 'tem estoque?' })] : [],
      })
    )
    renderPage()

    const card = (await screen.findByText(/tem estoque\?/)).closest('div.rounded-xl')
    expect(within(card).queryByText('Excluir no ML')).not.toBeInTheDocument()
    // o card continua visível — só o botão destrutivo some, não a pergunta
    expect(within(card).getByText('Responder')).toBeInTheDocument()
  })

  it('NÃO mostra "Excluir no ML" para uma pergunta da J12 (fora de escopo)', async () => {
    perguntasGet.mockImplementation(({ status }) =>
      Promise.resolve({
        perguntas: status === 'pendente' ? [pergunta({ question_id: 3, conta_ml: 'J12', texto_pergunta: 'tem cor preta?' })] : [],
      })
    )
    renderPage()

    const card = (await screen.findByText(/tem cor preta\?/)).closest('div.rounded-xl')
    expect(within(card).queryByText('Excluir no ML')).not.toBeInTheDocument()
  })
})

// FIX 7 — o disabled de cada card vem de `mutation.variables`, não de um
// `idEmAcao` compartilhado entre as duas mutations. Antes, começar uma ação
// no card B reabilitava visualmente os botões do card A com a exclusão dele
// ainda em voo, e um novo clique no card A caía num guard global e não
// fazia nada — silenciosamente, no único controle irreversível da tela.
describe('Perguntas — estado de "ocupado" é por card, não compartilhado', () => {
  it('mantém o card A como "Excluindo..." mesmo depois de outra ação começar no card B', async () => {
    perguntasGet.mockImplementation(({ status }) =>
      Promise.resolve({
        perguntas:
          status === 'pendente'
            ? [
                pergunta({ question_id: 1, conta_ml: 'YUSO', texto_pergunta: 'pergunta A' }),
                pergunta({ question_id: 2, conta_ml: 'LOCITECH', texto_pergunta: 'pergunta B' }),
              ]
            : [],
      })
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    let resolveExclusaoA
    excluirPergunta.mockImplementation((id) => {
      if (id === 1) return new Promise((resolve) => { resolveExclusaoA = resolve })
      return Promise.resolve({ ok: true, status: 'excluida' })
    })
    responderPergunta.mockResolvedValue({ ok: true, status: 'enviada' })

    renderPage()
    await screen.findByText(/pergunta A/)
    await screen.findByText(/pergunta B/)

    const cardA = screen.getByText(/pergunta A/).closest('div.rounded-xl')
    const cardB = screen.getByText(/pergunta B/).closest('div.rounded-xl')

    // Começa a excluir o card A — fica pendurado (promise não resolvida).
    fireEvent.click(within(cardA).getByText('Excluir no ML'))
    await waitFor(() => expect(within(cardA).getByText('Excluindo...')).toBeInTheDocument())

    // Começa outra ação (Responder) no card B.
    fireEvent.click(within(cardB).getByText('Responder'))

    // O card A tem que CONTINUAR mostrando "Excluindo..." — não pode voltar
    // a "Excluir no ML" só porque outro card entrou em ação.
    expect(within(cardA).getByText('Excluindo...')).toBeInTheDocument()
    expect(within(cardA).getByText('Excluindo...').closest('button')).toBeDisabled()

    resolveExclusaoA({ ok: true, status: 'excluida' })
  })

  it('um segundo clique em excluir no card B (card diferente) chama a API, não fica silenciosamente ignorado', async () => {
    perguntasGet.mockImplementation(({ status }) =>
      Promise.resolve({
        perguntas:
          status === 'pendente'
            ? [
                pergunta({ question_id: 1, conta_ml: 'YUSO', texto_pergunta: 'pergunta A' }),
                pergunta({ question_id: 2, conta_ml: 'LOCITECH', texto_pergunta: 'pergunta B' }),
              ]
            : [],
      })
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    let resolveExclusaoA
    excluirPergunta.mockImplementation((id) => {
      if (id === 1) return new Promise((resolve) => { resolveExclusaoA = resolve })
      return Promise.resolve({ ok: true, status: 'excluida' })
    })

    renderPage()
    await screen.findByText(/pergunta A/)
    const cardA = screen.getByText(/pergunta A/).closest('div.rounded-xl')
    const cardB = screen.getByText(/pergunta B/).closest('div.rounded-xl')

    fireEvent.click(within(cardA).getByText('Excluir no ML'))
    await waitFor(() => expect(within(cardA).getByText('Excluindo...')).toBeInTheDocument())

    // Card B ainda está habilitado (exclusão em voo é só a do card A).
    fireEvent.click(within(cardB).getByText('Excluir no ML'))

    await waitFor(() => expect(excluirPergunta).toHaveBeenCalledWith(2, 'YUSO'))

    resolveExclusaoA({ ok: true, status: 'excluida' })
  })
})
