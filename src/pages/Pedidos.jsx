import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { downloadCSV, todayStr } from '../lib/exportCSV'
import LojasIndisponiveisAviso from '../components/LojasIndisponiveisAviso'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatPct(v) {
  if (v === null || v === undefined) return '—'
  return `${Number(v).toFixed(2)}%`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_LABEL = { paid: 'Pago', cancelled: 'Cancelado', pending: 'Pendente' }
const STATUS_COLOR = { paid: 'text-emerald-400', cancelled: 'text-red-400', pending: 'text-sky-400' }

export default function Pedidos() {
  const [params, setParams] = useSearchParams()
  const periodo = params.get('periodo') || 'hoje'
  const de = params.get('de') || ''
  const ate = params.get('ate') || ''
  const { activeAccount } = useAuth()
  const [tab, setTab] = useState('pedidos')
  const [exporting, setExporting] = useState(false)

  // Pedidos state
  const offsetPedidos = parseInt(params.get('offset') || '0', 10)
  const limitPedidos = 20

  // Vendas (P&L) state
  const [pagePl, setPagePl] = useState(0)
  const limitPl = 50

  const baseParams = {
    periodo,
    conta_ml: activeAccount,
    ...(periodo === 'custom' && de && ate ? { de, ate } : {}),
  }

  const { data: dataPedidos, isLoading: loadPedidos, error: errPedidos, refetch: refetchPedidos } = useQuery({
    queryKey: ['pedidos', periodo, de, ate, offsetPedidos, activeAccount],
    queryFn: () => api.pedidos({ ...baseParams, limit: limitPedidos, offset: offsetPedidos }),
    enabled: !!activeAccount && (periodo !== 'custom' || (!!de && !!ate)),
  })

  const { data: dataVendas, isLoading: loadVendas, error: errVendas, refetch: refetchVendas } = useQuery({
    queryKey: ['vendas', periodo, de, ate, activeAccount, pagePl],
    queryFn: () => api.vendas({ ...baseParams, limit: limitPl, offset: pagePl * limitPl }),
    enabled: !!activeAccount && (periodo !== 'custom' || (!!de && !!ate)),
  })

  const isLoading = tab === 'pedidos' ? loadPedidos : loadVendas
  function refetch() { tab === 'pedidos' ? refetchPedidos() : refetchVendas() }

  function nextPage() {
    setParams(p => { const np = new URLSearchParams(p); np.set('offset', offsetPedidos + limitPedidos); return np })
  }
  function prevPage() {
    setParams(p => { const np = new URLSearchParams(p); np.set('offset', Math.max(0, offsetPedidos - limitPedidos)); return np })
  }

  async function handleExport() {
    setExporting(true)
    try {
      const all = await api.pedidos({ ...baseParams, limit: 9999, offset: 0 })
      const headers = ['Nº Pedido', 'Data', 'Status', 'ID Produto', 'Produto', 'Qtd', 'Preço Unit.', 'Total Item', 'Total Pedido']
      const rows = []
      for (const p of all.pedidos) {
        const dateFmt = p.data ? new Date(p.data).toLocaleDateString('pt-BR') : ''
        const statusFmt = STATUS_LABEL[p.status] || p.status
        if (p.itens.length === 0) {
          rows.push([p.ml_order_id, dateFmt, statusFmt, '', '', '', '', '', String(p.total).replace('.', ',')])
        } else {
          p.itens.forEach((item, i) => {
            const totalItem = (item.quantidade * item.preco_unitario).toFixed(2).replace('.', ',')
            rows.push([
              i === 0 ? p.ml_order_id : '',
              i === 0 ? dateFmt : '',
              i === 0 ? statusFmt : '',
              item.ml_item_id,
              item.titulo,
              item.quantidade,
              String(item.preco_unitario).replace('.', ','),
              totalItem,
              i === 0 ? String(p.total).replace('.', ',') : '',
            ])
          })
        }
      }
      downloadCSV(`pedidos-${periodo}-${todayStr()}.csv`, headers, rows)
    } finally {
      setExporting(false)
    }
  }

  const vendas = dataVendas?.vendas || []
  const totalVendas = dataVendas?.total || 0
  const totalPagesVendas = Math.ceil(totalVendas / limitPl)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Pedidos" onRefresh={refetch} isLoading={isLoading} />

      <main className="flex-1 p-3 sm:p-6 space-y-4 overflow-auto">
        <LojasIndisponiveisAviso lojas={dataPedidos?.lojas_indisponiveis ?? dataVendas?.lojas_indisponiveis} />
        {/* Tabs */}
        <div className="flex gap-1 border-b border-stone-800">
          {[
            { key: 'pedidos', label: 'Pedidos' },
            { key: 'pl', label: 'P&L por Venda' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-sky-400 text-sky-400 font-medium'
                  : 'border-transparent text-stone-500 hover:text-stone-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── ABA PEDIDOS ── */}
        {tab === 'pedidos' && (
          <>
            {errPedidos && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">{errPedidos.message}</div>}
            {dataPedidos && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-stone-500">{dataPedidos.total} pedido(s) no período</span>
                  <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-emerald-400 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <span>{exporting ? '⏳' : '⬇'}</span>
                    <span>{exporting ? 'Exportando…' : 'Exportar CSV'}</span>
                  </button>
                </div>

                <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-stone-800/50 text-stone-500 border-b border-stone-800">
                        <th className="text-left px-4 py-3 font-medium">Data</th>
                        <th className="text-left px-4 py-3 font-medium">Produto</th>
                        <th className="text-right px-4 py-3 font-medium">Valor</th>
                        <th className="text-center px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadPedidos && (
                        <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-600">Carregando…</td></tr>
                      )}
                      {dataPedidos.pedidos.map((p) => (
                        <tr key={p.ml_order_id} className="border-b border-stone-800/50 hover:bg-stone-800/30">
                          <td className="px-4 py-3 text-stone-400">{formatDate(p.data)}</td>
                          <td className="px-4 py-3 text-stone-200 truncate max-w-xs">
                            {p.itens[0]?.titulo || '—'}
                            {p.itens.length > 1 && <span className="text-stone-500 text-xs"> +{p.itens.length - 1}</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-stone-200">{formatBRL(p.total)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs ${STATUS_COLOR[p.status] || 'text-stone-400'}`}>
                              {STATUS_LABEL[p.status] || p.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              to={`/pedidos/${p.ml_order_id}`}
                              state={{ loja: p.loja }}
                              className="text-xs text-sky-400 hover:text-sky-300"
                            >
                              Ver →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>

                <div className="flex items-center justify-end mt-2 text-sm text-stone-500">
                  <div className="flex gap-2">
                    <button onClick={prevPage} disabled={offsetPedidos === 0}
                      className="px-3 py-1.5 bg-stone-800 rounded-lg disabled:opacity-40 hover:bg-stone-700 text-xs">
                      ← Anterior
                    </button>
                    <button onClick={nextPage} disabled={offsetPedidos + limitPedidos >= dataPedidos.total}
                      className="px-3 py-1.5 bg-stone-800 rounded-lg disabled:opacity-40 hover:bg-stone-700 text-xs">
                      Próximo →
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── ABA P&L ── */}
        {tab === 'pl' && (
          <>
            {errVendas && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">{errVendas.message}</div>}

            <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800">
                <h2 className="text-sm font-semibold text-stone-200">
                  {totalVendas > 0 ? `${totalVendas.toLocaleString('pt-BR')} vendas` : 'Vendas'}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-stone-800">
                      <th className="px-4 py-3 text-left text-stone-500">Pedido</th>
                      <th className="px-4 py-3 text-left text-stone-500">Data</th>
                      <th className="px-4 py-3 text-left text-stone-500">Produto</th>
                      <th className="px-4 py-3 text-right text-stone-500">Qtd</th>
                      <th className="px-4 py-3 text-right text-stone-500">Faturamento</th>
                      <th className="px-4 py-3 text-right text-stone-500">Taxas ML</th>
                      <th className="px-4 py-3 text-right text-stone-500">Líq. Marketplace</th>
                      <th className="px-4 py-3 text-right text-stone-500">Imposto</th>
                      <th className="px-4 py-3 text-right text-stone-500">Custo</th>
                      <th className="px-4 py-3 text-right text-stone-500">Lucro</th>
                      <th className="px-4 py-3 text-right text-stone-500">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadVendas && (
                      <tr><td colSpan={11} className="px-4 py-10 text-center text-stone-600">Carregando…</td></tr>
                    )}
                    {!loadVendas && vendas.length === 0 && (
                      <tr><td colSpan={11} className="px-4 py-10 text-center text-stone-600">Sem vendas no período.</td></tr>
                    )}
                    {vendas.map((v, i) => {
                      const margemColor = v.margem === null ? 'text-stone-500' : v.margem >= 15 ? 'text-emerald-400' : v.margem >= 0 ? 'text-sky-400' : 'text-red-400'
                      const lucroColor = v.lucro === null ? 'text-stone-500' : v.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'
                      return (
                        <tr key={v.order_id || i} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                          <td className="px-4 py-3 text-stone-400 font-mono">{v.order_id}</td>
                          <td className="px-4 py-3 text-stone-400 whitespace-nowrap">{formatDateTime(v.data_aprovacao)}</td>
                          <td className="px-4 py-3 text-stone-300 max-w-[180px] truncate" title={v.titulo}>{v.titulo || '—'}</td>
                          <td className="px-4 py-3 text-right text-stone-300">{v.unidades}</td>
                          <td className="px-4 py-3 text-right text-sky-400 font-medium">{formatBRL(v.faturamento)}</td>
                          <td className="px-4 py-3 text-right text-red-400">{formatBRL(v.taxas_ml)}</td>
                          <td className="px-4 py-3 text-right text-blue-400">{formatBRL(v.liquido_marketplace)}</td>
                          <td className="px-4 py-3 text-right text-stone-400">{formatBRL(v.imposto)}</td>
                          <td className="px-4 py-3 text-right text-stone-400">{v.custo_produtos !== null ? formatBRL(v.custo_produtos) : <span className="text-stone-600">—</span>}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${lucroColor}`}>{v.lucro !== null ? formatBRL(v.lucro) : <span className="text-stone-600">—</span>}</td>
                          <td className={`px-4 py-3 text-right font-medium ${margemColor}`}>{v.margem !== null ? formatPct(v.margem) : <span className="text-stone-600">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {totalPagesVendas > 1 && (
                <div className="flex items-center justify-between px-5 py-4 border-t border-stone-800">
                  <span className="text-xs text-stone-500">Página {pagePl + 1} de {totalPagesVendas}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPagePl(p => Math.max(0, p - 1))}
                      disabled={pagePl === 0}
                      className="px-3 py-1.5 text-xs bg-stone-800 border border-stone-700 rounded text-stone-300 disabled:opacity-40 hover:bg-stone-700 transition-colors"
                    >
                      ← Anterior
                    </button>
                    <button
                      onClick={() => setPagePl(p => Math.min(totalPagesVendas - 1, p + 1))}
                      disabled={pagePl >= totalPagesVendas - 1}
                      className="px-3 py-1.5 text-xs bg-stone-800 border border-stone-700 rounded text-stone-300 disabled:opacity-40 hover:bg-stone-700 transition-colors"
                    >
                      Próxima →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
