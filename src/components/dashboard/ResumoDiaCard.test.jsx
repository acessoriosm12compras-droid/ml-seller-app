import { render, screen } from '@testing-library/react'
import { vi, beforeEach, describe, it, expect } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ResumoDiaCard from './ResumoDiaCard'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ activeAccount: 'YUSO', activeAccounts: ['YUSO'] }),
}))

const resumoGet = vi.fn()
vi.mock('../../api', () => ({
  api: { resumoDia: { get: (...args) => resumoGet(...args) } },
}))

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ResumoDiaCard />
    </QueryClientProvider>
  )
}

const JANELA = { inicio: '2026-08-10', fim: '2026-08-16', dias: 7 }

function movimentacao(over = {}) {
  return {
    ml_item_id: 'MLB1', titulo: 'Cabo Hdmi 20m', sku: 'FV0031',
    faturamento_atual: 8940, faturamento_anterior: 5220, variacao_reais: 3720,
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('ResumoDiaCard', () => {
  it('mostra a janela comparada, pra não confundir com "hoje"', async () => {
    resumoGet.mockResolvedValue({ movimentacoes: [movimentacao()], janela: JANELA })
    renderCard()
    expect(await screen.findByText(/7 dias até 16\/08 vs\. os 7 anteriores/i)).toBeInTheDocument()
  })

  it('lista alta e queda com o sinal certo', async () => {
    resumoGet.mockResolvedValue({
      movimentacoes: [
        movimentacao(),
        movimentacao({ ml_item_id: 'MLB2', titulo: 'Cabo Toslink', sku: 'FV0044',
                       faturamento_atual: 0, faturamento_anterior: 247, variacao_reais: -247 }),
      ],
      janela: JANELA,
    })
    renderCard()
    expect(await screen.findByText(/^\+R\$/)).toBeInTheDocument()
    expect(screen.getByText(/^−R\$/)).toBeInTheDocument()
    expect(screen.getByText('Cabo Toslink')).toBeInTheDocument()
  })

  it('mantém os dois produtos separados mesmo com títulos parecidos', async () => {
    resumoGet.mockResolvedValue({
      movimentacoes: [
        movimentacao({ ml_item_id: 'MLB1', titulo: 'Cabo Hdmi 20m' }),
        movimentacao({ ml_item_id: 'MLB2', titulo: 'Cabo Hdmi 10m' }),
      ],
      janela: JANELA,
    })
    renderCard()
    expect(await screen.findByText('Cabo Hdmi 20m')).toBeInTheDocument()
    expect(screen.getByText('Cabo Hdmi 10m')).toBeInTheDocument()
  })

  it('diz que nada mudou em vez de mostrar lista vazia', async () => {
    resumoGet.mockResolvedValue({ movimentacoes: [], janela: JANELA })
    renderCard()
    expect(await screen.findByText(/nenhum produto mudou/i)).toBeInTheDocument()
  })

  it('mostra a conversão como linha secundária quando existe', async () => {
    resumoGet.mockResolvedValue({
      movimentacoes: [movimentacao()],
      melhor_conversao: { ml_item_id: 'MLB3', titulo: 'Cabo Displayport',
                          taxa_conversao: 21.93, vendas: 25, visitas: 114 },
      janela: JANELA,
    })
    renderCard()
    expect(await screen.findByText(/melhor conversão: cabo displayport/i)).toBeInTheDocument()
  })

  it('omite a linha de conversão quando o backend não soube dizer', async () => {
    resumoGet.mockResolvedValue({ movimentacoes: [movimentacao()], melhor_conversao: null, janela: JANELA })
    renderCard()
    await screen.findByText('Cabo Hdmi 20m')
    expect(screen.queryByText(/melhor conversão/i)).not.toBeInTheDocument()
  })

  it('avisa quando uma loja do conjunto não respondeu', async () => {
    resumoGet.mockResolvedValue({
      movimentacoes: [movimentacao()], janela: JANELA, lojas_indisponiveis: ['M12'],
    })
    renderCard()
    expect(await screen.findByText(/Loja indisponível/i)).toBeInTheDocument()
  })

  it('mostra o erro em vez de sumir da tela', async () => {
    resumoGet.mockRejectedValue(new Error('Dependência externa indisponível'))
    renderCard()
    expect(await screen.findByText(/Dependência externa indisponível/i)).toBeInTheDocument()
  })
})

describe('ResumoDiaCard — a causa ao lado do efeito', () => {
  it('marca "sem estoque" na queda causada por ruptura', async () => {
    resumoGet.mockResolvedValue({
      movimentacoes: [movimentacao({ variacao_reais: -18611, faturamento_atual: 4040,
                                     faturamento_anterior: 22651, estoque_disponivel: 0 })],
      janela: JANELA,
    })
    renderCard()
    expect(await screen.findByText(/sem estoque/i)).toBeInTheDocument()
  })

  it('avisa quando o estoque está acabando', async () => {
    resumoGet.mockResolvedValue({
      movimentacoes: [movimentacao({ estoque_disponivel: 3 })], janela: JANELA,
    })
    renderCard()
    expect(await screen.findByText(/restam 3 un/i)).toBeInTheDocument()
  })

  it('usa o singular quando resta uma unidade', async () => {
    resumoGet.mockResolvedValue({
      movimentacoes: [movimentacao({ estoque_disponivel: 1 })], janela: JANELA,
    })
    renderCard()
    expect(await screen.findByText(/resta 1 un/i)).toBeInTheDocument()
  })

  it('não diz nada sobre estoque confortável', async () => {
    resumoGet.mockResolvedValue({
      movimentacoes: [movimentacao({ estoque_disponivel: 120 })], janela: JANELA,
    })
    renderCard()
    await screen.findByText('Cabo Hdmi 20m')
    expect(screen.queryByText(/estoque|un\./i)).not.toBeInTheDocument()
  })

  it('cala a boca quando o estoque não pôde ser apurado', async () => {
    resumoGet.mockResolvedValue({
      movimentacoes: [movimentacao({ estoque_disponivel: null })], janela: JANELA,
    })
    renderCard()
    await screen.findByText('Cabo Hdmi 20m')
    expect(screen.queryByText(/sem estoque/i)).not.toBeInTheDocument()
  })
})
