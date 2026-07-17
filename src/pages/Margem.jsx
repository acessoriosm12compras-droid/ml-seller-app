import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import LojasIndisponiveisAviso from '../components/LojasIndisponiveisAviso'

function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

function MargemBadge({ value }) {
  if (value === null || value === undefined) return <span className="text-stone-500">—</span>
  const color = value >= 20 ? 'text-emerald-400' : value >= 0 ? 'text-sky-400' : 'text-red-400'
  const bg = value >= 20 ? 'bg-emerald-500/10' : value >= 0 ? 'bg-sky-500/10' : 'bg-red-500/10'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${color} ${bg}`}>
      {value.toFixed(1)}%
    </span>
  )
}

export default function Margem() {
  const [params] = useSearchParams()
  const periodo = params.get('periodo') || 'hoje'
  const { activeAccount } = useAuth()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['margem', periodo, activeAccount],
    queryFn: () => api.margem({ periodo, conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  return (
    <div className="flex flex-col flex-1">
      <Header title="Margem" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-3 sm:p-6">
        <LojasIndisponiveisAviso lojas={data?.lojas_indisponiveis} />
        {isLoading && <div className="text-stone-500 text-sm">Carregando...</div>}
        {error && <div className="text-red-400 text-sm">{error.message}</div>}
        {data && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-800/50 text-stone-500 border-b border-stone-800">
                  <th className="text-left px-4 py-3 font-medium">Produto</th>
                  <th className="text-right px-4 py-3 font-medium">Faturamento</th>
                  <th className="text-right px-4 py-3 font-medium">Custo</th>
                  <th className="text-right px-4 py-3 font-medium">Taxas ML</th>
                  <th className="text-right px-4 py-3 font-medium">ADS</th>
                  <th className="text-center px-4 py-3 font-medium">Margem s/ ADS</th>
                  <th className="text-center px-4 py-3 font-medium">Margem c/ ADS</th>
                  <th className="text-center px-4 py-3 font-medium">SUBS. ML</th>
                </tr>
              </thead>
              <tbody>
                {data.produtos.map((p) => (
                  <tr key={p.ml_item_id} className="border-b border-stone-800/50 hover:bg-stone-800/30">
                    <td className="px-4 py-3">
                      <p className="text-stone-200 truncate max-w-xs">{p.titulo}</p>
                      <p className="text-stone-600 text-xs">{p.ml_item_id} · {p.qtd_vendida} un</p>
                    </td>
                    <td className="px-4 py-3 text-right text-stone-300">{formatBRL(p.faturamento)}</td>
                    <td className="px-4 py-3 text-right text-stone-400">{formatBRL(p.custo_total)}</td>
                    <td className="px-4 py-3 text-right text-red-400">{formatBRL(p.taxas_ml)}</td>
                    <td className="px-4 py-3 text-right text-orange-400">{formatBRL(p.gasto_ads)}</td>
                    <td className="px-4 py-3 text-center"><MargemBadge value={p.margem_sem_ads} /></td>
                    <td className="px-4 py-3 text-center"><MargemBadge value={p.margem_pos_ads} /></td>
                    <td className="px-4 py-3 text-center">
                      {p.rebate_meli_percent !== null && p.rebate_meli_percent !== undefined ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-sky-500/10 text-sky-400">
                          {p.rebate_meli_percent}%
                        </span>
                      ) : (
                        <span className="text-stone-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
