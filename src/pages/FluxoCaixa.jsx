import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import { TrendingUp, TrendingDown, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function pct(v) {
  if (v === null || v === undefined || isNaN(v)) return '—'
  return `${(parseFloat(v) * 100).toFixed(1)}%`
}

function KpiCard({ label, value, sub, accent = 'sky', negative = false }) {
  const colors = {
    sky:     { border: 'border-l-sky-500',     text: 'text-sky-400' },
    violet:  { border: 'border-l-violet-500',  text: 'text-violet-400' },
    amber:   { border: 'border-l-amber-500',   text: 'text-amber-400' },
    rose:    { border: 'border-l-rose-500',     text: 'text-rose-400' },
    emerald: { border: 'border-l-emerald-500', text: 'text-emerald-400' },
    teal:    { border: 'border-l-teal-500',    text: 'text-teal-400' },
    red:     { border: 'border-l-red-500',     text: 'text-red-400' },
  }
  const c = colors[accent] || colors.sky
  const numVal = parseFloat(value)
  const isNeg = negative || (!isNaN(numVal) && numVal < 0)
  return (
    <div className={`bg-stone-900 border border-stone-800 border-l-4 ${c.border} rounded-xl p-4`}>
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`text-xl font-bold ${isNeg ? 'text-red-400' : c.text}`}>{value}</p>
      {sub && <p className="text-xs text-stone-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function FornecedorTag({ f }) {
  return (
    <div className="flex items-center justify-between bg-stone-800 rounded-lg px-3 py-2 text-xs">
      <span className="text-stone-300">{f.nome || '—'}</span>
      <span className="text-amber-400 font-semibold">{formatBRL(f.valor)}</span>
    </div>
  )
}

function AcompanhamentoTable({ rows }) {
  if (!rows?.length) return null
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-800">
        <h2 className="text-sm font-semibold text-stone-300">Histórico NCG (meses fechados)</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-stone-800">
              <th className="px-3 py-2.5 text-left text-stone-500 font-medium">Mês</th>
              <th className="px-3 py-2.5 text-right text-stone-500 font-medium">Faturamento</th>
              <th className="px-3 py-2.5 text-right text-stone-500 font-medium">Saldo Devedor</th>
              <th className="px-3 py-2.5 text-right text-stone-500 font-medium">NCG</th>
              <th className="px-3 py-2.5 text-right text-stone-500 font-medium">Δ Dívida</th>
              <th className="px-3 py-2.5 text-right text-stone-500 font-medium">Lucro Líq.</th>
              <th className="px-3 py-2.5 text-center text-stone-500 font-medium">Alerta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.ano_mes} className={`border-b border-stone-800/50 ${r.alerta ? 'bg-red-500/5' : 'hover:bg-stone-800/30'} transition-colors`}>
                <td className="px-3 py-2.5 text-stone-300 font-medium">{r.ano_mes}</td>
                <td className="px-3 py-2.5 text-right text-stone-300">{formatBRL(r.faturamento)}</td>
                <td className="px-3 py-2.5 text-right text-amber-400">{formatBRL(r.saldo_devedor)}</td>
                <td className={`px-3 py-2.5 text-right font-semibold ${(r.ncg || 0) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{formatBRL(r.ncg)}</td>
                <td className="px-3 py-2.5 text-right text-stone-400">
                  {r.delta_divida != null ? (
                    <span className={r.delta_divida > 0 ? 'text-red-400' : 'text-emerald-400'}>
                      {r.delta_divida > 0 ? '+' : ''}{formatBRL(r.delta_divida)}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2.5 text-right text-stone-300">{formatBRL(r.lucro_liquido)}</td>
                <td className="px-3 py-2.5 text-center">
                  {r.alerta ? (
                    <span title="Δ dívida > lucro do mês"><AlertTriangle size={13} className="text-red-400 inline" /></span>
                  ) : (
                    <span className="text-stone-700">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function FluxoCaixa() {
  const { activeAccount } = useAuth()
  const now = new Date()
  const [anoMes, setAnoMes] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  )
  const [showEdit, setShowEdit] = useState(false)
  const [editData, setEditData] = useState({})
  const qc = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['fluxo-caixa', anoMes, activeAccount],
    queryFn: () => api.fluxoCaixa({ ano_mes: anoMes, conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  const putMut = useMutation({
    mutationFn: (body) => api.salvarFluxoCaixa(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fluxo-caixa', anoMes, activeAccount] })
      setShowEdit(false)
    },
  })

  function handleEditOpen() {
    const inputs = data?.inputs || {}
    setEditData({
      estoque_custo:    inputs.estoque_custo   ?? '',
      estoque_liquido:  inputs.estoque_liquido ?? '',
      a_receber:        inputs.a_receber       ?? '',
      compras:          inputs.compras         ?? '',
      fornecedores:     inputs.fornecedores    ?? [],
    })
    setShowEdit(true)
  }

  function handleSaveEdit() {
    putMut.mutate({
      ano_mes: anoMes,
      conta_ml: activeAccount,
      ...editData,
    })
  }

  const saldoInicial = data?.saldo_inicial ?? 0
  const despesasFixasTotal = data?.despesas_fixas_total ?? 0
  const resultadoAposFixos = data?.resultado_apos_fixos ?? 0
  const ncg = data?.ncg ?? 0
  const fornecedores = data?.inputs?.fornecedores || []

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Fluxo de Caixa" onRefresh={refetch} isLoading={isLoading} />

      <main className="flex-1 p-3 sm:p-6 space-y-6 overflow-auto">

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-stone-500">Mês/Ano</label>
            <input
              type="month"
              value={anoMes}
              onChange={e => setAnoMes(e.target.value)}
              className="bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          {!activeAccount && (
            <span className="text-stone-500 text-sm">Selecione uma loja no topo.</span>
          )}
          {data?.editavel && (
            <button
              onClick={showEdit ? () => setShowEdit(false) : handleEditOpen}
              className="flex items-center gap-1.5 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              {showEdit ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showEdit ? 'Fechar edição' : 'Editar inputs'}
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
            <span>Erro ao carregar: {error.message}</span>
            <button onClick={refetch} className="text-xs underline hover:text-red-300">Tentar novamente</button>
          </div>
        )}

        {showEdit && data?.editavel && (
          <div className="bg-stone-900 border border-sky-500/30 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-stone-300">Editar inputs manuais — {anoMes}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { key: 'estoque_custo',   label: 'Estoque (custo)' },
                { key: 'estoque_liquido', label: 'Estoque (líquido)' },
                { key: 'a_receber',       label: 'A receber' },
                { key: 'compras',         label: 'Compras do mês' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-stone-500">{f.label}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editData[f.key] ?? ''}
                    onChange={e => setEditData(d => ({ ...d, [f.key]: e.target.value }))}
                    className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-xs rounded px-2 py-1.5"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSaveEdit}
                disabled={putMut.isPending}
                className="text-xs bg-sky-600 hover:bg-sky-500 disabled:bg-stone-800 disabled:text-stone-500 text-white px-4 py-1.5 rounded-lg transition-colors"
              >
                {putMut.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              <button onClick={() => setShowEdit(false)} className="text-xs text-stone-500 hover:text-stone-300">Cancelar</button>
              {putMut.isError && <span className="text-xs text-red-400">{putMut.error?.message}</span>}
            </div>
          </div>
        )}

        {data && (
          <>
            {despesasFixasTotal > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex flex-wrap items-center gap-4">
                <div>
                  <p className="text-xs text-stone-500">Saldo Inicial</p>
                  <p className="text-2xl font-bold text-red-400">{formatBRL(saldoInicial)}</p>
                  <p className="text-xs text-stone-600 mt-0.5">Custos fixos comprometidos no mês</p>
                </div>
                <div className="text-stone-700">→</div>
                <div>
                  <p className="text-xs text-stone-500">Resultado após fixos</p>
                  <p className={`text-2xl font-bold ${resultadoAposFixos < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatBRL(resultadoAposFixos)}
                  </p>
                  <p className="text-xs text-stone-600 mt-0.5">
                    {formatBRL(data.vendas?.lucro_liquido)} lucro − {formatBRL(despesasFixasTotal)} fixas
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              <KpiCard label="Faturamento" value={formatBRL(data.vendas?.faturamento)} accent="sky" />
              <KpiCard label="Lucro Líquido" value={formatBRL(data.vendas?.lucro_liquido)} accent="emerald" />
              <KpiCard label="Custos Fixos Mensais" value={formatBRL(despesasFixasTotal)} accent="red" />
              <KpiCard
                label="Resultado após Fixos"
                value={formatBRL(resultadoAposFixos)}
                accent={resultadoAposFixos < 0 ? 'red' : 'emerald'}
              />
              <KpiCard label="Estoque (custo)" value={formatBRL(data.estoque_custo)} accent="violet" />
              <KpiCard label="A Receber" value={formatBRL(data.a_receber)} accent="amber" />
              <KpiCard label="Fornecedores (total)" value={formatBRL(data.fornecedores_total)} accent="rose" />
              <KpiCard label="NCG" value={formatBRL(ncg)} accent={ncg < 0 ? 'red' : 'teal'}
                sub="Necessidade de Capital de Giro" />
              <KpiCard label="ACO" value={formatBRL(data.aco)} accent="sky"
                sub="Ativo Circulante Operacional" />
              <KpiCard label="Folga (dinheiro vivo)" value={formatBRL(data.folga_dinheiro_vivo)} accent="teal" />
              <KpiCard label="Taxas ML" value={formatBRL(data.vendas?.taxas_ml)} accent="rose" />
              <KpiCard label="Custo Produtos" value={formatBRL(data.vendas?.custo_produtos)} accent="amber" />
            </div>

            <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-stone-300 mb-3">Indicadores</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-stone-500">Cobertura Estoque</p>
                  <p className="text-base font-semibold text-stone-200">{pct(data.indicadores?.cobertura_estoque)}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-500">Margem Estoque</p>
                  <p className="text-base font-semibold text-stone-200">{pct(data.indicadores?.margem_estoque)}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-500">Margem Líquida</p>
                  <p className="text-base font-semibold text-stone-200">{pct(data.indicadores?.margem_liquida)}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-500">Dependência Fornecedor</p>
                  <p className="text-base font-semibold text-stone-200">{pct(data.indicadores?.dependencia_fornecedor)}</p>
                </div>
              </div>
            </div>

            <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-stone-300 mb-3">Cenários de capital de giro</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-stone-800/50 rounded-lg p-3">
                  <p className="text-xs text-stone-500 mb-1">Base (NCG atual)</p>
                  <p className={`text-lg font-bold ${(data.cenarios?.base || 0) < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatBRL(data.cenarios?.base)}
                  </p>
                </div>
                <div className="bg-stone-800/50 rounded-lg p-3">
                  <p className="text-xs text-stone-500 mb-1 flex items-center gap-1">
                    <TrendingDown size={11} className="text-red-400" />
                    Fornecedor corta crédito
                  </p>
                  <p className="text-lg font-bold text-red-400">{formatBRL(data.cenarios?.fornecedor_corta)}</p>
                </div>
                <div className="bg-stone-800/50 rounded-lg p-3">
                  <p className="text-xs text-stone-500 mb-1 flex items-center gap-1">
                    <TrendingUp size={11} className="text-amber-400" />
                    Queda de 30% nas vendas
                  </p>
                  <p className="text-lg font-bold text-amber-400">{formatBRL(data.cenarios?.queda_30)}</p>
                </div>
              </div>
            </div>

            {fornecedores.length > 0 && (
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
                <h2 className="text-sm font-semibold text-stone-300 mb-3">
                  Fornecedores — total {formatBRL(data.fornecedores_total)}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {fornecedores.map((f, i) => <FornecedorTag key={i} f={f} />)}
                </div>
              </div>
            )}

            <AcompanhamentoTable rows={data.acompanhamento} />
          </>
        )}
      </main>
    </div>
  )
}
