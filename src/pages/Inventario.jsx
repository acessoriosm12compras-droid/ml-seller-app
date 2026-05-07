import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function Inventario() {
  const { activeAccount } = useAuth()
  const [alertaMinimo, setAlertaMinimo] = useState(5)
  const [apenasBAixo, setApenasBaixo] = useState(false)
  const [busca, setBusca] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['inventario', activeAccount, alertaMinimo, apenasBAixo],
    queryFn: () => api.inventario({
      conta_ml: activeAccount,
      alerta_minimo: alertaMinimo,
      apenas_baixo: apenasBAixo ? '1' : '0',
    }),
    enabled: !!activeAccount,
    staleTime: 5 * 60_000,
  })

  const itens = (data?.itens || []).filter(i =>
    !busca || i.titulo?.toLowerCase().includes(busca.toLowerCase()) || i.ml_item_id?.includes(busca)
  )

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Inventário" onRefresh={refetch} isLoading={isLoading} />

      <main className="flex-1 p-3 sm:p-6 space-y-5 overflow-auto">
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            {error.message}
          </div>
        )}

        {/* Summary KPIs */}
        {data && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-sky-500 rounded-xl p-4">
              <p className="text-xs text-stone-500">Produtos Ativos</p>
              <p className="text-xl font-bold text-sky-400">{data.total_itens}</p>
            </div>
            <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-blue-500 rounded-xl p-4">
              <p className="text-xs text-stone-500">Unidades em Estoque</p>
              <p className="text-xl font-bold text-blue-400">{data.total_unidades?.toLocaleString('pt-BR')}</p>
            </div>
            <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-violet-500 rounded-xl p-4">
              <p className="text-xs text-stone-500">Custo Total Estoque</p>
              <p className="text-xl font-bold text-violet-400">{formatBRL(data.custo_total_estoque)}</p>
            </div>
            <div className={`bg-stone-900 border border-stone-800 border-l-4 ${data.itens_estoque_baixo > 0 ? 'border-l-red-500' : 'border-l-emerald-500'} rounded-xl p-4`}>
              <p className="text-xs text-stone-500">Estoque Baixo</p>
              <p className={`text-xl font-bold ${data.itens_estoque_baixo > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{data.itens_estoque_baixo}</p>
            </div>
          </div>
        )}

        {/* Venda e Líquido previstos */}
        {data && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 flex flex-col gap-0.5">
              <p className="text-xs text-stone-500">Venda Prevista (estoque × preço)</p>
              <p className="text-lg font-semibold text-sky-400">{formatBRL(data.venda_prevista_total)}</p>
            </div>
            <div className="bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 flex flex-col gap-0.5">
              <p className="text-xs text-stone-500">Líquido Previsto (~70% da venda)</p>
              <p className="text-lg font-semibold text-blue-400">{formatBRL(data.liquido_previsto_total)}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por título ou ID…"
            className="flex-1 min-w-[200px] max-w-xs bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-stone-500">Alerta mín.</label>
            <input
              type="number"
              min="0"
              max="100"
              value={alertaMinimo}
              onChange={e => setAlertaMinimo(parseInt(e.target.value) || 0)}
              className="w-16 bg-stone-900 border border-stone-700 rounded-lg px-2 py-1.5 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <span className="text-xs text-stone-500">un.</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={apenasBAixo}
              onChange={e => setApenasBaixo(e.target.checked)}
              className="w-4 h-4 accent-sky-500"
            />
            <span className="text-xs text-stone-400">Apenas estoque baixo</span>
          </label>
        </div>

        {/* Table */}
        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col className="w-[260px]" />
                <col className="w-[110px]" />
                <col className="w-[90px]" />
                <col className="w-[100px]" />
                <col className="w-[80px]" />
                <col className="w-[100px]" />
                <col className="w-[120px]" />
                <col className="w-[110px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="px-4 py-3 text-left text-stone-500">Produto</th>
                  <th className="px-4 py-3 text-left text-stone-500">SKU</th>
                  <th className="px-4 py-3 text-right text-stone-500">Preço</th>
                  <th className="px-4 py-3 text-right text-stone-500">Custo Unit.</th>
                  <th className="px-4 py-3 text-right text-stone-500">Estoque</th>
                  <th className="px-4 py-3 text-right text-stone-500">Custo Total</th>
                  <th className="px-4 py-3 text-right text-stone-500">Venda Prevista</th>
                  <th className="px-4 py-3 text-right text-stone-500">Líq. Previsto</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-stone-600">
                      Buscando estoque no Mercado Livre… (pode demorar alguns segundos)
                    </td>
                  </tr>
                )}
                {!isLoading && itens.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-stone-600">Nenhum item encontrado.</td></tr>
                )}
                {itens.map(item => {
                  const estoqueColor = item.estoque_baixo
                    ? 'text-red-400 font-bold'
                    : item.estoque <= alertaMinimo * 2
                    ? 'text-sky-400'
                    : 'text-emerald-400'
                  return (
                    <tr key={item.ml_item_id} className={`border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors ${item.estoque_baixo ? 'bg-red-500/5' : ''}`}>
                      <td className="px-4 py-3 text-stone-300 overflow-hidden">
                        <div className="flex items-center gap-2 min-w-0">
                          {item.estoque_baixo && <span title="Estoque baixo" className="text-red-400 text-xs shrink-0">⚠</span>}
                          <div className="min-w-0">
                            <div className="truncate" title={item.titulo}>{item.titulo}</div>
                            <div className="text-stone-600 font-mono text-[10px] truncate">{item.ml_item_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-500 font-mono">{item.sku_interno || <span className="text-stone-700">—</span>}</td>
                      <td className="px-4 py-3 text-right text-sky-400">{formatBRL(item.preco)}</td>
                      <td className="px-4 py-3 text-right text-stone-400">{item.custo_unitario !== null ? formatBRL(item.custo_unitario) : <span className="text-stone-600">—</span>}</td>
                      <td className={`px-4 py-3 text-right text-base ${estoqueColor}`}>
                        {item.estoque}
                        {item.estoque_total !== undefined && item.estoque_total !== item.estoque && (
                          <div className="text-stone-500 text-[10px] font-normal">{item.estoque_total} total</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-stone-400">{item.custo_total_estoque !== null ? formatBRL(item.custo_total_estoque) : <span className="text-stone-600">—</span>}</td>
                      <td className="px-4 py-3 text-right text-stone-300">{formatBRL(item.venda_prevista)}</td>
                      <td className="px-4 py-3 text-right text-blue-400">{formatBRL(item.liquido_previsto)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
