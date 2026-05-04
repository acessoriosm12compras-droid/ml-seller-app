import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { downloadCSV, todayStr } from '../lib/exportCSV'

function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const STATUS_LABEL = { paid: 'Pago', cancelled: 'Cancelado', pending: 'Pendente' }
const STATUS_COLOR = { paid: 'text-emerald-400', cancelled: 'text-red-400', pending: 'text-amber-400' }

export default function Pedidos() {
  const [params, setParams] = useSearchParams()
  const periodo = params.get('periodo') || '7d'
  const de = params.get('de') || ''
  const ate = params.get('ate') || ''
  const offset = parseInt(params.get('offset') || '0', 10)
  const limit = 20
  const { activeAccount } = useAuth()
  const [exporting, setExporting] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pedidos', periodo, de, ate, offset, activeAccount],
    queryFn: () => api.pedidos({ periodo, limit, offset, conta_ml: activeAccount, ...(periodo === 'custom' && de && ate ? { de, ate } : {}) }),
    enabled: !!activeAccount,
  })

  function nextPage() { setParams(p => { const np = new URLSearchParams(p); np.set('offset', offset + limit); return np }) }
  function prevPage() { setParams(p => { const np = new URLSearchParams(p); np.set('offset', Math.max(0, offset - limit)); return np }) }

  async function handleExport() {
    setExporting(true)
    try {
      // Fetch all orders for the period (no pagination)
      const all = await api.pedidos({
        periodo,
        limit: 9999,
        offset: 0,
        conta_ml: activeAccount,
        ...(periodo === 'custom' && de && ate ? { de, ate } : {}),
      })
      const headers = ['Nº Pedido', 'Data', 'Status', 'ID Produto', 'Produto', 'Qtd', 'Preço Unit.', 'Total Item', 'Total Pedido']
      const rows = []
      for (const p of all.pedidos) {
        const dateFmt = p.data ? new Date(p.data).toLocaleDateString('pt-BR') : ''
        const statusFmt = { paid: 'Pago', cancelled: 'Cancelado', pending: 'Pendente' }[p.status] || p.status
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

  return (
    <div className="flex flex-col flex-1">
      <Header title="Pedidos" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-6">
        {isLoading && <div className="text-gray-500 text-sm">Carregando...</div>}
        {error && <div className="text-red-400 text-sm">{error.message}</div>}
        {data && (
          <>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-gray-500">{data.total} pedido(s) no período</span>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-emerald-400 rounded-lg transition-colors disabled:opacity-50"
              >
                <span>{exporting ? '⏳' : '⬇'}</span>
                <span>{exporting ? 'Exportando…' : 'Exportar CSV'}</span>
              </button>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800/50 text-gray-500 border-b border-gray-800">
                    <th className="text-left px-4 py-3 font-medium">Data</th>
                    <th className="text-left px-4 py-3 font-medium">Produto</th>
                    <th className="text-right px-4 py-3 font-medium">Valor</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.pedidos.map((p) => (
                    <tr key={p.ml_order_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-gray-400">{formatDate(p.data)}</td>
                      <td className="px-4 py-3 text-gray-200 truncate max-w-xs">
                        {p.itens[0]?.titulo || '—'}
                        {p.itens.length > 1 && <span className="text-gray-500 text-xs"> +{p.itens.length - 1}</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-200">{formatBRL(p.total)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs ${STATUS_COLOR[p.status] || 'text-gray-400'}`}>
                          {STATUS_LABEL[p.status] || p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/pedidos/${p.ml_order_id}`}
                          className="text-xs text-amber-400 hover:text-amber-300"
                        >
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end mt-4 text-sm text-gray-500">
              <div className="flex gap-2">
                <button onClick={prevPage} disabled={offset === 0}
                  className="px-3 py-1.5 bg-gray-800 rounded-lg disabled:opacity-40 hover:bg-gray-700">
                  ← Anterior
                </button>
                <button onClick={nextPage} disabled={offset + limit >= data.total}
                  className="px-3 py-1.5 bg-gray-800 rounded-lg disabled:opacity-40 hover:bg-gray-700">
                  Próximo →
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
