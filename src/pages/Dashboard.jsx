import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../api'
import Header from '../components/Header'
import KPICard from '../components/KPICard'

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export default function Dashboard() {
  const [params] = useSearchParams()
  const periodo = params.get('periodo') || '7d'

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', periodo],
    queryFn: () => api.dashboard({ periodo }),
  })

  return (
    <div className="flex flex-col flex-1">
      <Header title="Dashboard" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-6 space-y-6">
        {isLoading && (
          <div className="text-gray-500 text-sm">Carregando...</div>
        )}
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            {error.status === 401 ? 'Sessão expirada — faça login novamente.' : error.message}
          </div>
        )}
        {data && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <KPICard
                label="Faturamento"
                value={formatBRL(data.kpis.faturamento)}
                variacao={data.kpis.faturamento_variacao}
              />
              <KPICard
                label="Pedidos"
                value={data.kpis.num_pedidos}
                variacao={data.kpis.pedidos_variacao}
              />
              <KPICard
                label="Ticket Médio"
                value={formatBRL(data.kpis.ticket_medio)}
                variacao={data.kpis.ticket_variacao}
              />
              <KPICard
                label="Reclamações"
                value={data.kpis.reclamacoes}
                variacao={null}
              />
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-medium text-gray-400 mb-4">Faturamento por dia</h2>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.grafico}>
                  <defs>
                    <linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="data" stroke="#6b7280" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 11 }}
                    tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={v => [formatBRL(v), 'Faturamento']}
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Area type="monotone" dataKey="total" stroke="#f59e0b" fill="url(#fatGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-medium text-gray-400 mb-4">Top Produtos</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-2 font-medium">Produto</th>
                    <th className="text-right py-2 font-medium">Qtd</th>
                    <th className="text-right py-2 font-medium">Total</th>
                    <th className="text-right py-2 font-medium">Var.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.produtos.map((p) => (
                    <tr key={p.ml_item_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2.5 text-gray-200 truncate max-w-xs">{p.titulo}</td>
                      <td className="py-2.5 text-right text-gray-300">{p.qtd}</td>
                      <td className="py-2.5 text-right text-gray-300">{formatBRL(p.total)}</td>
                      <td className={`py-2.5 text-right text-xs ${
                        p.variacao > 0 ? 'text-emerald-400' :
                        p.variacao < 0 ? 'text-red-400' : 'text-gray-500'
                      }`}>
                        {p.variacao != null ? `${p.variacao > 0 ? '+' : ''}${p.variacao}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-600">Atualizado: {data.atualizado_em}</p>
          </>
        )}
      </main>
    </div>
  )
}
