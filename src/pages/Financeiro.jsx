import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../api'
import Header from '../components/Header'
import KPICard from '../components/KPICard'
import { useAuth } from '../context/AuthContext'
import LojasIndisponiveisAviso from '../components/LojasIndisponiveisAviso'

function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

export default function Financeiro() {
  const [params] = useSearchParams()
  const periodo = params.get('periodo') || 'hoje'
  const { activeAccount } = useAuth()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['financeiro', periodo, activeAccount],
    queryFn: () => api.financeiro({ periodo, conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  return (
    <div className="flex flex-col flex-1">
      <Header title="Financeiro" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-3 sm:p-6 space-y-6">
        <LojasIndisponiveisAviso lojas={data?.lojas_indisponiveis} />
        {isLoading && <div className="text-stone-500 text-sm">Carregando...</div>}
        {error && <div className="text-red-400 text-sm">{error.message}</div>}
        {data && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <KPICard label="Faturamento Bruto" value={formatBRL(data.faturamento_bruto)} variacao={null} />
              <KPICard label="Taxas ML" value={formatBRL(data.taxas_ml)} variacao={null} />
              <KPICard label="Custo Produtos" value={formatBRL(data.custo_produtos)} variacao={null} />
              <KPICard label="Lucro Líquido" value={formatBRL(data.lucro_liquido)} variacao={null} />
            </div>

            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-stone-600 dark:text-stone-400">Faturamento por dia</h2>
                <span className="text-xs text-stone-500">ADS: {formatBRL(data.gasto_ads)}</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.grafico}>
                  <defs>
                    <linearGradient id="finGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="data" stroke="#a8a29e" tick={{ fontSize: 11, fill: '#78716c' }} />
                  <YAxis stroke="#a8a29e" tick={{ fontSize: 11, fill: '#78716c' }}
                    tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={v => [formatBRL(v), 'Faturamento']}
                    contentStyle={{ background: '#1c1917', border: '1px solid #44403c', borderRadius: 8 }}
                    labelStyle={{ color: '#a8a29e' }}
                  />
                  <Area type="monotone" dataKey="total" stroke="#10b981" fill="url(#finGrad)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: '#10b981' }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
