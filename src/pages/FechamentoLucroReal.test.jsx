import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, beforeEach, describe, it, expect } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '../context/ThemeContext'
import FechamentoLucroReal from './FechamentoLucroReal'

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const lucroReal = vi.fn()
const estoqueGet = vi.fn()
const estoqueRegistrar = vi.fn()
vi.mock('../api', () => ({
  api: {
    fechamento: {
      lucroReal: (...args) => lucroReal(...args),
      estoque: {
        get: (...args) => estoqueGet(...args),
        registrar: (...args) => estoqueRegistrar(...args),
      },
    },
  },
}))

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <FechamentoLucroReal />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

const LINHAS_BASE = [
  { linha: 14, parte: 1, rotulo: 'Vendas de produtos', valor: 1000, origem: 'automatico', aviso: null },
  { linha: 39, parte: 4, rotulo: 'Frete motoristas/terceiros', valor: 0, origem: 'automatico', aviso: null },
  { linha: 67, parte: 5, rotulo: 'Compra de mercadoria (fornecedores)', valor: 500, origem: 'automatico', aviso: null },
]

const RESP_BASE = {
  mes_ano: '2026-08',
  linhas: LINHAS_BASE,
  conferencia: { status: 'indisponivel', motivo: 'sem dado', cmv_teorico: null, cmv_informado: null, diferenca: null, causas_provaveis: [] },
  pendencias: [],
  itens_sem_custo: 0,
  contas_faltando_estoque: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ activeAccount: 'YUSO', activeAccounts: ['YUSO'], role: 'user' })
  lucroReal.mockResolvedValue({ ...RESP_BASE })
  estoqueGet.mockRejectedValue(Object.assign(new Error('Estoque deste mês ainda não foi registrado'), { status: 404, body: {} }))
  estoqueRegistrar.mockResolvedValue({ valor_full: 0, valor_fbm: 0, valor_galpao: 0, valor_total: 0 })
  window.confirm = vi.fn(() => true)
  navigator.clipboard = { writeText: vi.fn() }
})

describe('FechamentoLucroReal — leitura do valor do galpão já gravado (C3, metade do front)', () => {
  it('pré-preenche o campo com o valor já gravado neste mês', async () => {
    estoqueGet.mockReset()
    estoqueGet.mockResolvedValue({
      mes_ano: '2026-08', valor_full: 100, valor_fbm: 20, valor_galpao: 333,
      valor_total: 453, itens_sem_custo: 0,
    })
    renderPage()

    const input = await screen.findByLabelText(/Galpão/i)
    await waitFor(() => expect(input.value).toBe('333'))
  })

  it('deixa o campo vazio quando nada está gravado', async () => {
    renderPage()
    const input = await screen.findByLabelText(/Galpão/i)
    await waitFor(() => expect(estoqueGet).toHaveBeenCalled())
    expect(input.value).toBe('')
  })

  it('não manda valor_galpao quando o campo fica vazio e intocado (nada gravado)', async () => {
    renderPage()
    await waitFor(() => expect(estoqueGet).toHaveBeenCalled())

    const botao = screen.getByRole('button', { name: /Registrar estoque do mês/i })
    fireEvent.click(botao)

    await waitFor(() => expect(estoqueRegistrar).toHaveBeenCalled())
    const [body] = estoqueRegistrar.mock.calls[0]
    expect(body).not.toHaveProperty('valor_galpao')
    expect(body.mes_ano).toBe('2026-08')
  })

  it('manda valor_galpao quando o usuário digita algo', async () => {
    renderPage()
    const input = await screen.findByLabelText(/Galpão/i)
    fireEvent.change(input, { target: { value: '450' } })

    const botao = screen.getByRole('button', { name: /Registrar estoque do mês/i })
    fireEvent.click(botao)

    await waitFor(() => expect(estoqueRegistrar).toHaveBeenCalled())
    const [body] = estoqueRegistrar.mock.calls[0]
    expect(body.valor_galpao).toBe(450)
  })

  it('manda valor_galpao explicito 0 quando o usuário limpa um valor previamente gravado', async () => {
    estoqueGet.mockReset()
    estoqueGet.mockResolvedValue({
      mes_ano: '2026-08', valor_full: 100, valor_fbm: 20, valor_galpao: 333,
      valor_total: 453, itens_sem_custo: 0,
    })
    renderPage()

    const input = await screen.findByLabelText(/Galpão/i)
    await waitFor(() => expect(input.value).toBe('333'))
    fireEvent.change(input, { target: { value: '' } })

    const botao = screen.getByRole('button', { name: /Registrar estoque do mês/i })
    fireEvent.click(botao)

    await waitFor(() => expect(estoqueRegistrar).toHaveBeenCalled())
    const [body] = estoqueRegistrar.mock.calls[0]
    expect(body.valor_galpao).toBe(0)
  })
})

describe('FechamentoLucroReal — confirmação antes de sobrescrever (C4, metade do front)', () => {
  it('em 409, pede confirmação citando a data da captura anterior e reenvia com substituir:true', async () => {
    estoqueRegistrar
      .mockRejectedValueOnce(Object.assign(new Error('Já existe um estoque registrado para este mês.'), {
        status: 409,
        body: { erro: 'Já existe um estoque registrado para este mês.', ja_capturado_em: '2026-08-01T12:00:00', mes_ano: '2026-08' },
      }))
      .mockResolvedValueOnce({ valor_full: 0, valor_fbm: 0, valor_galpao: 0, valor_total: 0 })

    renderPage()
    await waitFor(() => expect(estoqueGet).toHaveBeenCalled())

    const botao = screen.getByRole('button', { name: /Registrar estoque do mês/i })
    fireEvent.click(botao)

    await waitFor(() => expect(estoqueRegistrar).toHaveBeenCalledTimes(2))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(window.confirm.mock.calls[0][0]).toMatch(/2026-08/)

    const [primeiroBody] = estoqueRegistrar.mock.calls[0]
    expect(primeiroBody).not.toHaveProperty('substituir')
    const [segundoBody] = estoqueRegistrar.mock.calls[1]
    expect(segundoBody).toEqual(expect.objectContaining({ substituir: true }))
  })

  it('em 409, não reenvia se o usuário cancelar a confirmação', async () => {
    window.confirm = vi.fn(() => false)
    estoqueRegistrar.mockRejectedValueOnce(Object.assign(new Error('conflito'), {
      status: 409,
      body: { erro: 'conflito', ja_capturado_em: '2026-08-01T12:00:00', mes_ano: '2026-08' },
    }))

    renderPage()
    await waitFor(() => expect(estoqueGet).toHaveBeenCalled())

    const botao = screen.getByRole('button', { name: /Registrar estoque do mês/i })
    fireEvent.click(botao)

    await waitFor(() => expect(window.confirm).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 20))
    expect(estoqueRegistrar).toHaveBeenCalledTimes(1)
  })
})

describe('FechamentoLucroReal — itens sem custo (I3, metade do front)', () => {
  it('mostra aviso quando itens_sem_custo > 0, mesmo com conferência batendo', async () => {
    lucroReal.mockResolvedValue({
      ...RESP_BASE,
      itens_sem_custo: 7,
      conferencia: { status: 'bate', cmv_teorico: 100, cmv_informado: 100, diferenca: 0, motivo: null, causas_provaveis: [] },
    })
    renderPage()

    expect(await screen.findByText(/7 produto\(s\) sem custo cadastrado/i)).toBeInTheDocument()
  })

  it('não mostra o aviso quando itens_sem_custo é 0', async () => {
    renderPage()
    await screen.findByText(/Vendas de produtos/)
    expect(screen.queryByText(/produto\(s\) sem custo cadastrado/i)).not.toBeInTheDocument()
  })
})

describe('FechamentoLucroReal — pendências e lojas faltando (I4, metade do front)', () => {
  it('renderiza a lista de pendências e nomeia as contas faltando estoque', async () => {
    lucroReal.mockResolvedValue({
      ...RESP_BASE,
      pendencias: ['Valor Estoque Full', 'Valor Estoque Chão (galpão)'],
      contas_faltando_estoque: ['M12'],
    })
    renderPage()

    expect(await screen.findByText(/Pendências deste mês/i)).toBeInTheDocument()
    expect(screen.getByText(/Valor Estoque Full/)).toBeInTheDocument()
    expect(screen.getByText(/M12/)).toBeInTheDocument()
  })
})

describe('FechamentoLucroReal — Full/FBM e total ao vivo (I5)', () => {
  it('mostra o FBM declarado e o total Full+FBM+galpão digitado, atualizando ao digitar', async () => {
    estoqueGet.mockReset()
    estoqueGet.mockResolvedValue({
      mes_ano: '2026-08', valor_full: 1000, valor_fbm: 200, valor_galpao: 0,
      valor_total: 1200, itens_sem_custo: 0,
    })
    renderPage()

    const input = await screen.findByLabelText(/Galpão/i)
    await waitFor(() => expect(screen.getByText(/FBM declarado/).parentElement.textContent).toMatch(/200/))

    fireEvent.change(input, { target: { value: '50' } })

    await waitFor(() => {
      const totalEl = screen.getByText(/Total \(Full \+ FBM/).parentElement
      expect(totalEl.textContent).toMatch(/1\.250/)
    })
  })
})

describe('FechamentoLucroReal — linhas 39/67 sem lançamento (I6)', () => {
  it('avisa quando a linha 39 chega zerada', async () => {
    renderPage()
    expect(await screen.findByText(/Frete motoristas\/terceiros/)).toBeInTheDocument()
    expect(screen.getByText(/Pode não ter nada lançado ainda/i)).toBeInTheDocument()
  })

  it('não avisa a linha 67 quando ela não é zero', async () => {
    renderPage()
    await screen.findByText(/Compra de mercadoria/)
    // só existe UM aviso desse tipo na tela (linha 39, que é 0); linha 67 é 500.
    expect(screen.getAllByText(/Pode não ter nada lançado ainda/i)).toHaveLength(1)
  })
})
