import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react'
import { api } from '../api'
import Header from '../components/Header'
import LojasIndisponiveisAviso from '../components/LojasIndisponiveisAviso'
import { useAuth } from '../context/AuthContext'

const PARTES = {
  1: '1️⃣ Receitas do mês',
  2: '2️⃣ Deduções do marketplace',
  3: '3️⃣ CMV',
  4: '4️⃣ Despesas reais do mês',
  5: '5️⃣ Saídas que não são prejuízo',
  8: '8️⃣ Controle de estoque',
}

// Linhas que vêm de outra tela (Fechamento → Fretes/Compras) e chegam como 0
// com origem "automatico" tanto quando de fato não houve nada no mês quanto
// quando simplesmente nada foi lançado ainda — indistinguível sem um aviso
// (Finding I6).
const LINHAS_ORIGEM_FECHAMENTO = new Set([39, 67])

function formatBRL(v) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function Conferencia({ c }) {
  if (!c) return null
  if (c.status === 'indisponivel') {
    return (
      <div className="bg-stone-100 border border-stone-200 rounded-xl p-4 flex gap-3">
        <HelpCircle className="w-5 h-5 text-stone-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-stone-700">Conferência indisponível</p>
          <p className="text-sm text-stone-600">{c.motivo}</p>
        </div>
      </div>
    )
  }
  const bate = c.status === 'bate'
  return (
    <div className={`rounded-xl p-4 flex gap-3 border ${bate ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
      {bate ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            : <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />}
      <div>
        <p className={`text-sm font-semibold ${bate ? 'text-emerald-800' : 'text-amber-800'}`}>
          {bate ? 'Bate! Estoque, compras e CMV estão consistentes.'
                : 'Não bateu — a diferença passou de 5%.'}
        </p>
        <p className="text-sm text-stone-600">
          CMV pela movimentação do estoque: {formatBRL(c.cmv_teorico)} · CMV do sistema: {formatBRL(c.cmv_informado)} · diferença: {formatBRL(c.diferenca)}
        </p>
        {c.causas_provaveis?.length > 0 && (
          <ul className="mt-2 text-sm text-stone-600 list-disc list-inside space-y-1">
            {c.causas_provaveis.map((causa, i) => <li key={i}>{causa}</li>)}
          </ul>
        )}
      </div>
    </div>
  )
}

function Pendencias({ pendencias, contasFaltando }) {
  if (!pendencias?.length) return null
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <p className="text-sm font-semibold text-amber-800">Pendências deste mês</p>
      <ul className="mt-1 text-sm text-amber-700 list-disc list-inside space-y-1">
        {pendencias.map((p, i) => <li key={i}>{p}</li>)}
      </ul>
      {contasFaltando?.length > 0 && (
        <p className="mt-2 text-sm text-amber-700">
          Falta registrar o estoque de: <strong>{contasFaltando.join(', ')}</strong>.
        </p>
      )}
    </div>
  )
}

export default function FechamentoLucroReal() {
  const [mesAno, setMesAno] = useState(mesAtual())
  const [galpao, setGalpao] = useState('')
  const [galpaoTouched, setGalpaoTouched] = useState(false)
  const qc = useQueryClient()
  // activeAccount é activeAccounts.join(',') — a string que parse_contas divide
  // no backend. É assim que o multi-loja funciona no repo (ver Dashboard.jsx).
  const { activeAccount } = useAuth()

  const q = useQuery({
    queryKey: ['lucro-real', mesAno, activeAccount],
    queryFn: () => api.fechamento.lucroReal({ mes_ano: mesAno, conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  // Leitura do estoque já gravado deste mês — só pra pré-preencher o campo
  // do galpão e mostrar Full/FBM ao lado dele (Findings C3 e I5 do front).
  // 404 aqui é estado normal (mês ainda não capturado), não erro de tela.
  const estoqueQuery = useQuery({
    queryKey: ['estoque-mes', mesAno, activeAccount],
    queryFn: () => api.fechamento.estoque.get({ mes_ano: mesAno, conta_ml: activeAccount }),
    enabled: !!activeAccount,
    retry: false,
  })

  // Pré-preenche com o que já está gravado — nunca uma caixa vazia
  // escondendo um valor que já existe. Sem registro, fica vazia mesmo.
  useEffect(() => {
    if (estoqueQuery.data?.valor_galpao != null) {
      setGalpao(String(estoqueQuery.data.valor_galpao))
    } else {
      setGalpao('')
    }
    setGalpaoTouched(false)
  }, [mesAno, activeAccount, estoqueQuery.data])

  // Só manda a chave valor_galpao quando há algo a dizer: o campo foi
  // tocado OU já chegou preenchido (valor pré-carregado do que está
  // gravado). Vazio e intocado = nada digitado e nada gravado — omitir a
  // chave é o que faz a blindagem do backend (C3) preservar o que já existe
  // em vez de zerar.
  const incluirGalpao = galpaoTouched || galpao !== ''

  const montarBodyEstoque = (extra = {}) => {
    const body = { mes_ano: mesAno, ...extra }
    if (incluirGalpao) body.valor_galpao = Number(galpao || 0)
    return body
  }

  const registrar = useMutation({
    mutationFn: (body) => api.fechamento.estoque.registrar(body, { conta_ml: activeAccount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lucro-real', mesAno, activeAccount] })
      qc.invalidateQueries({ queryKey: ['estoque-mes', mesAno, activeAccount] })
    },
  })

  // Finding C4 (metade do front): 409 = já existe snapshot deste mês.
  // Confirma explicitamente antes de sobrescrever — a captura anterior é
  // perdida e não tem como recuperar depois. Usa mutateAsync + try/catch em
  // vez de mutate() aninhado dentro de onError: chamar mutate() de novo na
  // MESMA mutation, de forma síncrona dentro do callback de erro dela,
  // corrompe o estado interno do observer do React Query.
  const confirmarSubstituir = async (jaCapturadoEm) => {
    const dataFmt = jaCapturadoEm
      ? new Date(jaCapturadoEm).toLocaleString('pt-BR')
      : 'uma data desconhecida'
    const ok = window.confirm(
      `Já existe um estoque registrado para ${mesAno}, capturado em ${dataFmt}. ` +
      'Substituir? O estoque anterior será perdido e não pode ser recuperado.'
    )
    if (ok) {
      try {
        await registrar.mutateAsync(montarBodyEstoque({ substituir: true }))
      } catch {
        // erro final já fica exposto via registrar.error
      }
    }
  }

  const onRegistrar = async () => {
    try {
      await registrar.mutateAsync(montarBodyEstoque())
    } catch (err) {
      if (err.status === 409) {
        await confirmarSubstituir(err.body?.ja_capturado_em)
      }
    }
  }

  const linhas = q.data?.linhas || []
  const partes = [...new Set(linhas.map(l => l.parte))].sort((a, b) => a - b)

  const copiarTudo = () => {
    const txt = linhas
      .filter(l => l.valor != null)
      .map(l => `Linha ${l.linha} — ${l.rotulo}: ${formatBRL(l.valor)}`)
      .join('\n')
    navigator.clipboard.writeText(txt)
  }

  // Finding I5: o único jeito real dela não contar a mesma mercadoria duas
  // vezes é ver o FBM declarado ao lado do que está digitando, e um total
  // ao vivo (Full + FBM + galpão) enquanto ela digita.
  const valorFull = estoqueQuery.data?.valor_full ?? null
  const valorFbm = estoqueQuery.data?.valor_fbm ?? null
  const totalAoVivo = (valorFull != null && valorFbm != null)
    ? valorFull + valorFbm + Number(galpao || 0)
    : null

  const itensSemCusto = q.data?.itens_sem_custo || 0

  return (
    <div className="space-y-5">
      <Header
        title="Fechamento Lucro Real"
        onRefresh={q.refetch}
        isLoading={q.isLoading}
        showPeriod={false}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="month"
          value={mesAno}
          onChange={e => setMesAno(e.target.value)}
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={copiarTudo}
          disabled={!linhas.length}
          className="px-3 py-2 text-sm rounded-lg bg-stone-800 text-white disabled:opacity-40"
        >
          Copiar tudo
        </button>
      </div>

      <LojasIndisponiveisAviso lojas={q.data?.lojas_indisponiveis} />

      <Pendencias pendencias={q.data?.pendencias} contasFaltando={q.data?.contas_faltando_estoque} />

      {q.isLoading && <p className="text-sm text-stone-500">Carregando…</p>}
      {q.error && <p className="text-sm text-red-600">{String(q.error.message || q.error)}</p>}

      <Conferencia c={q.data?.conferencia} />

      {/* Registro do estoque do mês */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">Estoque do mês</h2>
        <p className="text-sm text-stone-600">
          O Full e o FBM são capturados do Mercado Livre. No campo abaixo, informe
          <strong> apenas a mercadoria que está no seu galpão e que o Mercado Livre não enxerga</strong> —
          o que já está declarado no FBM não entra aqui, senão conta duas vezes.
          Se você já registrou este mês, o campo abaixo vem preenchido com o valor
          gravado; deixe como está pra manter, ou mude pra corrigir.
        </p>

        {itensSemCusto > 0 && (
          <div className="flex gap-2 items-start bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              {itensSemCusto} produto(s) sem custo cadastrado — o estoque e o CMV
              deste mês estão subestimados. Cadastre o custo em Custos de Produtos
              antes de copiar os números pra planilha.
            </p>
          </div>
        )}

        <div className="text-sm text-stone-600 flex flex-wrap gap-x-6 gap-y-1">
          <span>Full (ML): <strong className="text-stone-800">{valorFull != null ? formatBRL(valorFull) : '—'}</strong></span>
          <span>FBM declarado (ML): <strong className="text-stone-800">{valorFbm != null ? formatBRL(valorFbm) : '—'}</strong></span>
          <span>Total (Full + FBM + galpão digitado): <strong className="text-stone-800">{totalAoVivo != null ? formatBRL(totalAoVivo) : '—'}</strong></span>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-sm">
            <span className="block text-stone-600 mb-1">Galpão (não anunciado), a custo</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={galpao}
              onChange={e => { setGalpao(e.target.value); setGalpaoTouched(true) }}
              className="border border-stone-300 rounded-lg px-3 py-2 text-sm w-48"
              placeholder="0,00"
            />
          </label>
          <button
            onClick={onRegistrar}
            disabled={registrar.isPending}
            className="px-3 py-2 text-sm rounded-lg bg-stone-800 text-white disabled:opacity-40"
          >
            {registrar.isPending ? 'Capturando…' : 'Registrar estoque do mês'}
          </button>
        </div>
        {registrar.error && registrar.error.status !== 409 && (
          <p className="text-sm text-red-600">{String(registrar.error.message || registrar.error)}</p>
        )}
      </div>

      {/* Linhas da planilha */}
      {partes.map(parte => (
        <div key={parte} className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-stone-800 mb-3">{PARTES[parte]}</h2>
          <div className="space-y-2">
            {linhas.filter(l => l.parte === parte).map(l => (
              <div key={l.linha} className="border-b border-stone-100 last:border-0 pb-2 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono bg-stone-100 text-stone-600 rounded px-2 py-1 shrink-0">
                    linha {l.linha}
                  </span>
                  <span className="text-sm text-stone-700 flex-1">{l.rotulo}</span>
                  <span className={`text-sm font-semibold ${l.origem === 'indisponivel' ? 'text-stone-400' : 'text-stone-900'}`}>
                    {formatBRL(l.valor)}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(String(l.valor ?? ''))}
                    disabled={l.valor == null}
                    className="text-stone-400 hover:text-stone-700 disabled:opacity-30"
                    title="Copiar valor"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                {l.aviso && <p className="text-xs text-stone-500 mt-1 ml-[4.5rem]">{l.aviso}</p>}
                {LINHAS_ORIGEM_FECHAMENTO.has(l.linha) && l.valor === 0 && (
                  <p className="text-xs text-amber-600 mt-1 ml-[4.5rem]">
                    Pode não ter nada lançado ainda pra este mês na aba Fechamento —
                    zero aqui não distingue "não teve" de "não lancei".
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
