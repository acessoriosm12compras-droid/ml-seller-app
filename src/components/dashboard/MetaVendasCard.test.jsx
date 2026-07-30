import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, beforeEach, describe, it, expect } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MetaVendasCard from './MetaVendasCard'

const mockUseAuth = vi.fn()
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const metasGet = vi.fn()
const metasSave = vi.fn()
vi.mock('../../api', () => ({
  api: {
    metas: {
      get: (...args) => metasGet(...args),
      save: (...args) => metasSave(...args),
    },
  },
}))

function renderCard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MetaVendasCard />
    </QueryClientProvider>
  )
}

function umaLoja() {
  mockUseAuth.mockReturnValue({
    activeAccount: 'YUSO',
    activeAccounts: ['YUSO'],
    editAccount: 'YUSO',
  })
}

function duasLojas() {
  mockUseAuth.mockReturnValue({
    activeAccount: 'YUSO,M12',
    activeAccounts: ['YUSO', 'M12'],
    editAccount: 'YUSO',
  })
}

const PAYLOAD_VAZIO = {
  valor_meta: null,
  vendido_mes: 0,
  pct_mes: 0,
  meta_hoje: 0,
  vendido_hoje: 0,
  pct_hoje: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  metasGet.mockResolvedValue({ ...PAYLOAD_VAZIO })
  metasSave.mockResolvedValue({ ok: true })
})

describe('MetaVendasCard — parsing de valor em formato brasileiro', () => {
  it('interpreta "50.000" como cinquenta mil, não como 50', async () => {
    umaLoja()
    renderCard()

    const input = await screen.findByLabelText(/Meta do mês/i)
    fireEvent.change(input, { target: { value: '50.000' } })
    fireEvent.blur(input)

    await waitFor(() =>
      expect(metasSave).toHaveBeenCalledWith({ conta_ml: 'YUSO', valor_meta: 50000 })
    )
  })

  it('interpreta "1.234,56" preservando os centavos', async () => {
    umaLoja()
    renderCard()

    const input = await screen.findByLabelText(/Meta do mês/i)
    fireEvent.change(input, { target: { value: '1.234,56' } })
    fireEvent.blur(input)

    await waitFor(() =>
      expect(metasSave).toHaveBeenCalledWith({ conta_ml: 'YUSO', valor_meta: 1234.56 })
    )
  })

  it('aceita valor simples sem separadores', async () => {
    umaLoja()
    renderCard()

    const input = await screen.findByLabelText(/Meta do mês/i)
    fireEvent.change(input, { target: { value: '50000' } })
    fireEvent.blur(input)

    await waitFor(() =>
      expect(metasSave).toHaveBeenCalledWith({ conta_ml: 'YUSO', valor_meta: 50000 })
    )
  })

  it('rejeita "700abc" em vez de salvar 700 silenciosamente', async () => {
    umaLoja()
    renderCard()

    const input = await screen.findByLabelText(/Meta do mês/i)
    fireEvent.change(input, { target: { value: '700abc' } })
    fireEvent.blur(input)

    await screen.findByText(/valor inválido/i)
    expect(metasSave).not.toHaveBeenCalled()
  })

  it('rejeita texto puro sem salvar nada', async () => {
    umaLoja()
    renderCard()

    const input = await screen.findByLabelText(/Meta do mês/i)
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.blur(input)

    await screen.findByText(/valor inválido/i)
    expect(metasSave).not.toHaveBeenCalled()
  })
})

describe('MetaVendasCard — edição com múltiplas lojas selecionadas', () => {
  // Regressão: com 2+ lojas o backend devolve valor_meta SOMADO, mas o PUT só
  // aceita uma loja. Editar nesse estado gravava a soma numa loja só (corrupção).
  it('deixa o editor somente-leitura quando há mais de uma loja selecionada', async () => {
    duasLojas()
    metasGet.mockResolvedValue({
      ...PAYLOAD_VAZIO,
      valor_meta: 100000,
      vendido_mes: 40000,
      pct_mes: 40,
    })
    renderCard()

    const input = await screen.findByLabelText(/Meta do mês/i)
    expect(input.readOnly).toBe(true)
    expect(screen.getByText(/selecione uma única loja/i)).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '110000' } })
    fireEvent.blur(input)

    await new Promise(r => setTimeout(r, 20))
    expect(metasSave).not.toHaveBeenCalled()
  })

  it('mantém o editor editável quando só uma loja está selecionada', async () => {
    umaLoja()
    metasGet.mockResolvedValue({ ...PAYLOAD_VAZIO, valor_meta: 50000, pct_mes: 10 })
    renderCard()

    const input = await screen.findByLabelText(/Meta do mês/i)
    expect(input.readOnly).toBe(false)
    expect(screen.queryByText(/selecione uma única loja/i)).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: '60000' } })
    fireEvent.blur(input)

    await waitFor(() =>
      expect(metasSave).toHaveBeenCalledWith({ conta_ml: 'YUSO', valor_meta: 60000 })
    )
  })
})

describe('MetaVendasCard — avisos e erros', () => {
  it('avisa quando alguma loja selecionada ainda não tem meta do mês', async () => {
    duasLojas()
    metasGet.mockResolvedValue({
      ...PAYLOAD_VAZIO,
      valor_meta: 50000,
      pct_mes: 80,
      contas_sem_meta: ['M12'],
    })
    renderCard()

    expect(await screen.findByText(/M12/)).toBeInTheDocument()
    expect(screen.getByText(/só as lojas com meta/i)).toBeInTheDocument()
  })

  it('mostra o aviso de lojas indisponíveis vindo da resposta', async () => {
    duasLojas()
    metasGet.mockResolvedValue({
      ...PAYLOAD_VAZIO,
      valor_meta: 50000,
      lojas_indisponiveis: ['M12'],
    })
    renderCard()

    expect(await screen.findByText(/Loja indisponível/i)).toBeInTheDocument()
  })

  it('mostra erro (e não o estado vazio "defina a meta") quando o GET falha', async () => {
    umaLoja()
    metasGet.mockRejectedValue(new Error('Dependência externa indisponível'))
    renderCard()

    expect(await screen.findByText(/Dependência externa indisponível/i)).toBeInTheDocument()
    expect(screen.queryByText(/Defina a meta do mês acima/i)).not.toBeInTheDocument()
  })

  it('mostra mensagem quando o salvamento falha', async () => {
    umaLoja()
    metasSave.mockRejectedValue(new Error('conta_ml inválida'))
    renderCard()

    const input = await screen.findByLabelText(/Meta do mês/i)
    fireEvent.change(input, { target: { value: '50000' } })
    fireEvent.blur(input)

    expect(await screen.findByText(/conta_ml inválida/i)).toBeInTheDocument()
  })
})
