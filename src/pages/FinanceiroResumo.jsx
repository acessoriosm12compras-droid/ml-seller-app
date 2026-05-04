import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatPct(v) {
  if (v === null || v === undefined) return '—'
  return `${Number(v).toFixed(2)}%`
}

function KpiRow({ label, value, valueColor = 'text-gray-200', indent = false, bold = false }) {
  return (
    <div className={`flex items-center justify-between py-2.5 border-b border-gray-800/50 ${indent ? 'pl-4' : ''}`}>
      <span className={`text-xs ${indent ? 'text-gray-500' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-sm font-${bold ? 'bold' : 'medium'} ${valueColor}`}>{value}</span>
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-gray-400 mb-2 font-medium">{label}</p>
      {payload.map(entry => (
        <p key={entry.name} style={{ color: entry.color }} className="flex justify-between gap-4">
          <span>{entry.name}</span>
          <span className="font-semibold">{formatBRL(entry.value)}</span>
        </p>
      ))}
    </div>
  )
}

export default function FinanceiroResumo() {
  const { activeAccount } = useAuth()
  const [tab, setTab] = useState('mensal')
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))
  const [ano, setAno] = useState(() => String(new Date().getFullYear()))

  const { data: mensal, isLoading: loadM, error: errM, refetch: refetchM } = useQuery({
    queryKey: ['financeiro-resumo-mensal', mes, activeAccount],
    queryFn: () => api.financeiroResumo.mensal({ mes, conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  const { data: anual, isLoading: loadA, error: errA, refetch: refetchA } = useQuery({
    queryKey: ['financeiro-resumo-anual', ano, activeAccount],
    queryFn: () => api.financeiroResumo.anual({ ano, conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  const isLoading = tab === 'mensal' ? loadM : loadA
  const error = tab === 'mensal' ? errM : errA
  function refetch() { tab === 'mensal' ? refetchM() : refetchA() }

  const d = mensal
  const meses = anual?.meses || []

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Resumo Financeiro" onRefresh={refetch} isLoading={isLoading} />

      <main className="flex-1 p-6 space-y-5 overflow-auto">
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            {error.message}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-800">
          {[
            { key: 'mensal', label: 'Mensal' },
            { key: 'anual', label: 'Anual' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-amber-400 text-amber-400 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* MENSAL */}
        {tab === 'mensal' && (
          <>
            <div className="flex items-center gap-3">
              <input
                type="month"
                value={mes}
                onChange={e => setMes(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* DRE Simplificada */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-200 mb-4">DRE Simplificada — {d?.mes || mes}</h2>

                {loadM ? (
                  <p className="text-gray-600 text-sm text-center py-8">Carregando…</p>
                ) : d ? (
                  <div>
                    <KpiRow label="Faturamento Bruto" value={formatBRL(d.faturamento)} valueColor="text-amber-400" bold />
                    <KpiRow label="Deduções ML (total)" value={`-${formatBRL(d.deducoes_ml?.total)}`} valueColor="text-red-400" />
                    <KpiRow label="Comissão + Taxa fixa" value={`-${formatBRL(d.deducoes_ml?.comissao_taxa_fixa)}`} valueColor="text-gray-500" indent />
                    <KpiRow label="Frete + Outros" value={`-${formatBRL(d.deducoes_ml?.frete_outros)}`} valueColor="text-gray-500" indent />
                    <KpiRow label="Líq. do Marketplace" value={formatBRL(d.liquido_marketplace)} valueColor="text-blue-400" bold />
                    <KpiRow label="Imposto" value={`-${formatBRL(d.imposto)}`} valueColor="text-gray-500" />
                    <KpiRow label="Custo dos Produtos (CMV)" value={`-${formatBRL(d.custo_produtos)}`} valueColor="text-gray-500" />
                    <KpiRow
                      label="Lucro Bruto"
                      value={formatBRL(d.lucro_bruto)}
                      valueColor={d.lucro_bruto >= 0 ? 'text-emerald-400' : 'text-red-400'}
                      bold
                    />
                    <KpiRow label={`Margem Bruta`} value={formatPct(d.margem_bruta)} valueColor={d.margem_bruta >= 15 ? 'text-emerald-400' : d.margem_bruta >= 0 ? 'text-amber-400' : 'text-red-400'} indent />
                    <KpiRow label="ADS (Publicidade)" value={`-${formatBRL(d.valor_ads)}`} valueColor="text-gray-500" />
                    <KpiRow
                      label="Lucro pós ADS"
                      value={formatBRL(d.lucro_pos_ads)}
                      valueColor={d.lucro_pos_ads >= 0 ? 'text-emerald-400' : 'text-red-400'}
                    />
                    <KpiRow label="Despesas Operacionais" value={`-${formatBRL(d.despesas_operacionais)}`} valueColor="text-gray-500" />
                    <KpiRow label="Receitas Extras" value={formatBRL(d.receitas_extras)} valueColor="text-gray-400" />
                    <KpiRow
                      label="Lucro Operacional"
                      value={formatBRL(d.lucro_operacional)}
                      valueColor={d.lucro_operacional >= 0 ? 'text-emerald-400' : 'text-red-400'}
                      bold
                    />
                    <KpiRow label="Margem Operacional" value={formatPct(d.margem_operacional)} valueColor={d.margem_operacional >= 15 ? 'text-emerald-400' : d.margem_operacional >= 0 ? 'text-amber-400' : 'text-red-400'} indent />
                  </div>
                ) : null}
              </div>

              {/* Right column */}
              <div className="space-y-4">
                {/* KPI summary */}
                {d && (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Nº de Vendas', value: d.n_vendas?.toLocaleString('pt-BR') },
                      { label: 'Unidades', value: d.unidades?.toLocaleString('pt-BR') },
                    ].map(k => (
                      <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-500">{k.label}</p>
                        <p className="text-lg font-semibold text-gray-200">{k.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Despesas por categoria */}
                {d?.despesas_por_categoria?.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-gray-200 mb-3">Despesas por Categoria</h3>
                    <div className="space-y-2">
                      {d.despesas_por_categoria.map(c => (
                        <div key={c.categoria} className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">{c.categoria}</span>
                          <span className="text-xs font-medium text-red-400">{formatBRL(c.valor)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ANUAL */}
        {tab === 'anual' && (
          <>
            <div className="flex items-center gap-3">
              <select
                value={ano}
                onChange={e => setAno(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-200 mb-5">Despesas vs Receitas — {ano}</h2>
              {loadA ? (
                <p className="text-gray-600 text-sm text-center py-10">Carregando…</p>
              ) : meses.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={meses} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="nome" stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <YAxis stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} width={52} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={n => <span className="text-gray-400">{n}</span>} />
                    <Bar dataKey="despesas_operacionais" name="Despesas" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="receitas_extras" name="Receitas Extras" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-600 text-sm text-center py-10">Sem dados para {ano}.</p>
              )}
            </div>

            {/* Table */}
            {meses.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-4 py-3 text-left text-gray-500">Mês</th>
                      <th className="px-4 py-3 text-right text-gray-500">Despesas</th>
                      <th className="px-4 py-3 text-right text-gray-500">Receitas Extras</th>
                      <th className="px-4 py-3 text-right text-gray-500">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meses.map(m => {
                      const saldo = m.receitas_extras - m.despesas_operacionais
                      return (
                        <tr key={m.mes} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                          <td className="px-4 py-3 text-gray-300 font-medium capitalize">{m.nome}</td>
                          <td className="px-4 py-3 text-right text-red-400 font-medium">{formatBRL(m.despesas_operacionais)}</td>
                          <td className="px-4 py-3 text-right text-emerald-400 font-medium">{formatBRL(m.receitas_extras)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${saldo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatBRL(saldo)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
