import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import LojasIndisponiveisAviso from '../components/LojasIndisponiveisAviso'

function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

function getCurrentMonth() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function TendenciaCell({ tendencia }) {
  if (tendencia === '↑') return <span className="text-green-400 font-bold">↑</span>
  if (tendencia === '↓') return <span className="text-red-400 font-bold">↓</span>
  return <span className="text-stone-400">→</span>
}

export default function ProjecaoVendas() {
  const { activeAccount } = useAuth()
  const [mes, setMes] = useState(getCurrentMonth)
  const [baseDias, setBaseDias] = useState('30')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['projecao', mes, baseDias, activeAccount],
    queryFn: () => api.projecao({ mes, base_dias: baseDias, conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  const progressoPct = data
    ? Math.min(100, Math.round(((data.realizado || 0) / (data.projetado || 1)) * 100))
    : 0

  return (
    <div className="flex flex-col flex-1">
      <Header title="Projeção de Vendas" onRefresh={refetch} isLoading={isLoading} />
      <LojasIndisponiveisAviso lojas={data?.lojas_indisponiveis} />

      <main className="flex-1 p-3 sm:p-6 space-y-6">
        {/* Controls row */}
        <div className="flex items-center justify-end gap-3">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="bg-stone-800 border border-stone-700 text-stone-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-500"
          />
          <select
            value={baseDias}
            onChange={(e) => setBaseDias(e.target.value)}
            className="bg-stone-800 border border-stone-700 text-stone-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-500"
          >
            <option value="30">30 dias</option>
            <option value="60">60 dias</option>
            <option value="90">90 dias</option>
          </select>
        </div>

        {isLoading && <div className="text-stone-500 text-sm">Carregando...</div>}
        {error && <div className="text-red-400 text-sm">{error.message}</div>}

        {!isLoading && !error && !data && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center">
            <p className="text-stone-400 text-sm max-w-md mx-auto">
              Dados insuficientes para calcular a projeção. Continue vendendo para que tenhamos histórico suficiente.
            </p>
          </div>
        )}

        {!isLoading && !error && data && (
          <>
            {/* Hero section */}
            <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                {/* Left: big projected number */}
                <div>
                  <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Projeção do mês</p>
                  <p className="text-4xl font-bold text-sky-400">{formatBRL(data.projetado)}</p>
                </div>

                {/* Right: pessimista / realizado / otimista */}
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Pessimista</p>
                    <p className="text-xl font-semibold text-red-400">{formatBRL(data.pessimista)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Realizado</p>
                    <p className="text-xl font-semibold text-stone-100">{formatBRL(data.realizado)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Otimista</p>
                    <p className="text-xl font-semibold text-green-400">{formatBRL(data.otimista)}</p>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span>{progressoPct}% concluído</span>
                  <span className="text-sky-400">Falta {formatBRL(data.falta)}</span>
                </div>
                <div className="w-full bg-stone-800 rounded-full h-3">
                  <div
                    className="bg-sky-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${progressoPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 4 info cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Dias Restantes</p>
                <p className="text-2xl font-bold text-stone-100">
                  {data.dias_restantes} <span className="text-sm font-normal text-stone-500">dias</span>
                </p>
              </div>
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Média Diária</p>
                <p className="text-2xl font-bold text-stone-100">{formatBRL(data.media_diaria)}</p>
              </div>
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Precisa Hoje</p>
                <p className="text-2xl font-bold text-sky-400">{formatBRL(data.precisa_hoje)}</p>
              </div>
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">vs Mês Anterior</p>
                <p className={`text-2xl font-bold ${data.variacao_mes_anterior_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {data.variacao_mes_anterior_pct >= 0 ? '↑' : '↓'} {Math.abs(data.variacao_mes_anterior_pct).toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Bar chart */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5">
              <h2 className="text-sm font-medium text-stone-600 dark:text-stone-400 mb-4">Histórico Mensal</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.historico_mensal} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="mes" stroke="#a8a29e" tick={{ fontSize: 11, fill: '#78716c' }} />
                  <YAxis
                    stroke="#a8a29e"
                    tick={{ fontSize: 11, fill: '#78716c' }}
                    tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(v) => [formatBRL(v)]}
                    contentStyle={{ background: '#1c1917', border: '1px solid #44403c', borderRadius: 8 }}
                    labelStyle={{ color: '#a8a29e' }}
                  />
                  <Legend />
                  <Bar dataKey="valor" name="Realizado" fill="#10b981" />
                  <Bar dataKey="projetado" name="Projetado" fill="#f59e0b" opacity={0.6} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Top 5 products */}
            {data.top_produtos && data.top_produtos.length > 0 && (
              <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-800">
                  <h2 className="text-sm font-medium text-stone-400">Top Produtos</h2>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-800">
                      <th className="text-left px-5 py-3 text-xs text-stone-500 uppercase tracking-wider">Produto</th>
                      <th className="text-right px-5 py-3 text-xs text-stone-500 uppercase tracking-wider">Faturado</th>
                      <th className="text-center px-5 py-3 text-xs text-stone-500 uppercase tracking-wider">Tendência</th>
                      <th className="text-right px-5 py-3 text-xs text-stone-500 uppercase tracking-wider">% do Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_produtos.map((produto, i) => (
                      <tr key={i} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                        <td className="px-5 py-3 text-stone-200 max-w-xs">
                          <span className="truncate block">{produto.titulo}</span>
                        </td>
                        <td className="px-5 py-3 text-right text-stone-300 font-medium">
                          {formatBRL(produto.faturado)}
                        </td>
                        <td className="px-5 py-3 text-center text-lg">
                          <TendenciaCell tendencia={produto.tendencia} />
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 bg-stone-800 rounded-full h-1.5">
                              <div
                                className="bg-sky-500 h-1.5 rounded-full"
                                style={{ width: `${Math.min(100, produto.progresso)}%` }}
                              />
                            </div>
                            <span className="text-stone-400 text-xs w-12 text-right">
                              {produto.progresso.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
