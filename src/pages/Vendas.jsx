import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import LojasIndisponiveisAviso from '../components/LojasIndisponiveisAviso'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatPct(v) {
  if (v === null || v === undefined) return '—'
  return `${Number(v).toFixed(2)}%`
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Vendas() {
  const [params] = useSearchParams()
  const periodo = params.get('periodo') || 'hoje'
  const de = params.get('de') || ''
  const ate = params.get('ate') || ''
  const { activeAccount } = useAuth()
  const [page, setPage] = useState(0)
  const limit = 50

  const queryParams = {
    periodo,
    conta_ml: activeAccount,
    limit,
    offset: page * limit,
    ...(periodo === 'custom' && de && ate ? { de, ate } : {}),
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['vendas', periodo, de, ate, activeAccount, page],
    queryFn: () => api.vendas(queryParams),
    enabled: !!activeAccount && (periodo !== 'custom' || (!!de && !!ate)),
  })

  const vendas = data?.vendas || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Vendas" onRefresh={refetch} isLoading={isLoading} />

      <main className="flex-1 p-3 sm:p-6 overflow-auto">
        <LojasIndisponiveisAviso lojas={data?.lojas_indisponiveis} />
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4">
            {error.message}
          </div>
        )}

        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800">
            <h2 className="text-sm font-semibold text-stone-200">
              {total > 0 ? `${total.toLocaleString('pt-BR')} vendas` : 'Vendas'}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="px-4 py-3 text-left text-stone-500 font-medium">Pedido</th>
                  <th className="px-4 py-3 text-left text-stone-500 font-medium">Data</th>
                  <th className="px-4 py-3 text-left text-stone-500 font-medium">Produto</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">Qtd</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">Faturamento</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">Taxas ML</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">Líq. Marketplace</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">Imposto</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">Custo</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">Lucro</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">Margem</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-stone-600">Carregando…</td>
                  </tr>
                )}
                {!isLoading && vendas.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-stone-600">Sem vendas no período.</td>
                  </tr>
                )}
                {vendas.map((v, i) => {
                  const margem = v.margem
                  const margemColor = margem === null ? 'text-stone-500' : margem >= 15 ? 'text-emerald-400' : margem >= 0 ? 'text-sky-400' : 'text-red-400'
                  const lucroColor = v.lucro === null ? 'text-stone-500' : v.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'
                  return (
                    <tr key={v.order_id || i} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                      <td className="px-4 py-3 text-stone-400 font-mono">{v.order_id}</td>
                      <td className="px-4 py-3 text-stone-400 whitespace-nowrap">{formatDate(v.data_aprovacao)}</td>
                      <td className="px-4 py-3 text-stone-300 max-w-[200px] truncate" title={v.titulo}>{v.titulo || '—'}</td>
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-stone-800">
              <span className="text-xs text-stone-500">
                Página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-xs bg-stone-800 border border-stone-700 rounded text-stone-300 disabled:opacity-40 hover:bg-stone-700 transition-colors"
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 text-xs bg-stone-800 border border-stone-700 rounded text-stone-300 disabled:opacity-40 hover:bg-stone-700 transition-colors"
                >
                  Próxima →
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
