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
const galpaoGet = vi.fn()
const galpaoSalvar = vi.fn()
vi.mock('../api', () => ({
  api: {
    fechamento: {
      lucroReal: (...args) => lucroReal(...args),
      estoque: {
        get: (...args) => estoqueGet(...args),
        registrar: (...args) => estoqueRegistrar(...args),
      },
      galpao: {
        get: (...args) => galpaoGet(...args),
        salvar: (...args) => galpaoSalvar(...args),
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
  galpaoGet.mockRejectedValue(Object.assign(new Error('Galpão deste mês ainda não foi informado'), { status: 404, body: {} }))
  galpaoSalvar.mockResolvedValue({ mes_ano: '2026-08', valor: 0, observacao: null, atualizado_em: null })
  window.confirm = vi.fn(() => true)
  navigator.clipboard = { writeText: vi.fn() }
})

describe('FechamentoLucroReal — contagem do galpão salva separadamente', () => {
  it('pré-preenche o campo com a contagem já gravada deste mês', async () => {
    galpaoGet.mockReset()
    galpaoGet.mockResolvedValue({ mes_ano: '2026-08', valor: 333, observacao: null, atualizado_em: null })
    renderPage()

    const input = await screen.findByLabelText(/Galpão/i)
    await waitFor(() => expect(input.value).toBe('333'))
  })

  it('deixa o campo vazio quando nada está gravado', async () => {
    renderPage()
    const input = await screen.findByLabelText(/Galpão/i)
    await waitFor(() => expect(galpaoGet).toHaveBeenCalled())
    expect(input.value).toBe('')
  })

  it('a captura do estoque NUNCA manda valor_galpao — ele vive noutra tabela', async () => {
    renderPage()
    const input = await screen.findByLabelText(/Galpão/i)
    fireEvent.change(input, { target: { value: '450' } })

    fireEvent.click(screen.getByRole('button', { name: /Capturar estoque do ML/i }))

    await waitFor(() => expect(estoqueRegistrar).toHaveBeenCalled())
    const [body] = estoqueRegistrar.mock.calls[0]
    expect(body).not.toHaveProperty('valor_galpao')
    expect(body.mes_ano).toBe('2026-08')
  })

  it('salvar a contagem chama PUT /galpao e não captura o estoque do ML', async () => {
    renderPage()
    const input = await screen.findByLabelText(/Galpão/i)
    fireEvent.change(input, { target: { value: '450' } })

    fireEvent.click(screen.getByRole('button', { name: /Salvar contagem do galpão/i }))

    await waitFor(() => expect(galpaoSalvar).toHaveBeenCalled())
    const [body] = galpaoSalvar.mock.calls[0]
    expect(body).toEqual({ mes_ano: '2026-08', valor: 450 })
    expect(estoqueRegistrar).not.toHaveBeenCalled()
  })

  it('capturar o estoque do ML não salva a contagem do galpão', async () => {
    renderPage()
    const input = await screen.findByLabelText(/Galpão/i)
    fireEvent.change(input, { target: { value: '450' } })

    fireEvent.click(screen.getByRole('button', { name: /Capturar estoque do ML/i }))

    await waitFor(() => expect(estoqueRegistrar).toHaveBeenCalled())
    expect(galpaoSalvar).not.toHaveBeenCalled()
  })

  it('o botão de salvar fica desabilitado enquanto nada foi digitado', async () => {
    renderPage()
    await screen.findByLabelText(/Galpão/i)
    expect(screen.getByRole('button', { name: /Salvar contagem do galpão/i })).toBeDisabled()
  })

  it('avisa quais lojas já tinham foto e foram puladas na captura', async () => {
    estoqueRegistrar.mockReset()
    estoqueRegistrar.mockResolvedValue({
      valor_full: 0, valor_fbm: 0, valor_total: 0, ja_capturadas: ['M12', 'J12'],
    })
    renderPage()
    await screen.findByLabelText(/Galpão/i)

    fireEvent.click(screen.getByRole('button', { name: /Capturar estoque do ML/i }))

    expect(await screen.findByText(/M12, J12/)).toBeInTheDocument()
  })
})

describe('FechamentoLucroReal — troca de mês limpa avisos do mês anterior', () => {
  it('o "contagem salva" some ao trocar de mês', async () => {
    renderPage()
    const input = await screen.findByLabelText(/Galpão/i)
    fireEvent.change(input, { target: { value: '450' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar contagem do galpão/i }))

    expect(await screen.findByText(/Contagem do galpão salva/i)).toBeInTheDocument()

    // Trocar de mês: o aviso de agosto não pode seguir na tela enquanto
    // setembro está vazio e nada foi salvo pra ele.
    fireEvent.change(screen.getByLabelText(/Mês/i), { target: { value: '2026-09' } })
    await waitFor(() =>
      expect(screen.queryByText(/Contagem do galpão salva/i)).not.toBeInTheDocument()
    )
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

    const botao = screen.getByRole('button', { name: /Capturar estoque do ML/i })
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

    const botao = screen.getByRole('button', { name: /Capturar estoque do ML/i })
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
