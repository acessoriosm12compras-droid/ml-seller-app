import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
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

function CustomTooltip({ active, payload, label, isMoney = true }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-stone-900 border border-stone-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-stone-400 mb-2 font-medium">{label}</p>
      {payload.map(entry => (
        <p key={entry.name} style={{ color: entry.color }} className="flex justify-between gap-4">
          <span>{entry.name}</span>
          <span className="font-semibold">
            {isMoney ? formatBRL(entry.value) : entry.value?.toLocaleString('pt-BR')}
          </span>
        </p>
      ))}
    </div>
  )
}

function GsKpiCard({ label, value, borderColor = 'border-stone-700', valueColor = 'text-stone-100' }) {
  return (
    <div className={`bg-stone-900 border border-stone-800 rounded-xl p-5 border-l-4 ${borderColor} flex flex-col gap-1`}>
      <p className="text-xs text-stone-400 font-medium">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
    </div>
  )
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
function fmtData(d) {
  if (!d) return ''
  const [, m, day] = d.split('-')
  return `${parseInt(day)} ${MESES[parseInt(m) - 1]}`
}

export default function Graficos() {
  const [params] = useSearchParams()
  const periodo = params.get('periodo') || '30d'
  const de = params.get('de') || ''
  const ate = params.get('ate') || ''
  const { activeAccount } = useAuth()
  const [activeTab, setActiveTab] = useState('receitas')

  const queryParams = {
    periodo,
    conta_ml: activeAccount,
    ...(periodo === 'custom' && de && ate ? { de, ate } : {}),
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['graficos', periodo, de, ate, activeAccount],
    queryFn: () => api.graficos(queryParams),
    enabled: !!activeAccount && (periodo !== 'custom' || (!!de && !!ate)),
  })

  const series = (data?.series || []).map(s => ({ ...s, label: fmtData(s.data) }))
  const t = data?.totais

  const TABS = [
    { key: 'receitas', label: 'Receitas' },
    { key: 'lucro', label: 'Lucro' },
    { key: 'vendas', label: 'Vendas' },
    { key: 'roi', label: 'ROI' },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Gráficos" onRefresh={refetch} isLoading={isLoading} />

      <main className="flex-1 p-6 space-y-6 overflow-auto">
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            {error.message}
          </div>
        )}

        {/* KPI summary */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <GsKpiCard label="Faturamento Total" value={t ? formatBRL(t.faturamento) : '…'} borderColor="border-sky-500" />
          <GsKpiCard label="Líq. Marketplace" value={t ? formatBRL(t.liquido_marketplace) : '…'} borderColor="border-blue-500" />
          <GsKpiCard
            label="Lucro Bruto"
            value={t ? formatBRL(t.lucro_bruto) : '…'}
            borderColor="border-violet-500"
            valueColor={t ? (t.lucro_bruto >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-stone-100'}
          />
          <GsKpiCard label="Unidades Vendidas" value={t ? t.unidades.toLocaleString('pt-BR') : '…'} borderColor="border-emerald-500" />
        </div>

        {/* Chart tabs */}
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex gap-1">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    activeTab === tab.key
                      ? 'bg-sky-500/20 text-sky-400 font-medium'
                      : 'text-stone-500 hover:text-stone-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {data?.periodo && (
              <span className="text-xs text-stone-500">
                {data.periodo.inicio} — {data.periodo.fim}
              </span>
            )}
          </div>

          {series.length === 0 && !isLoading ? (
            <p className="text-stone-600 text-sm text-center py-10">Sem dados para o período selecionado.</p>
          ) : (
            <>
              {activeTab === 'receitas' && (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gFat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gLiq" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="label" stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <YAxis stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} width={52} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={n => <span className="text-stone-400">{n}</span>} />
                    <Area type="monotone" dataKey="faturamento" name="Faturamento" stroke="#f59e0b" fill="url(#gFat)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Area type="monotone" dataKey="liquido_marketplace" name="Líq. Marketplace" stroke="#3b82f6" fill="url(#gLiq)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {activeTab === 'lucro' && (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gLucro" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gMpa" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="label" stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <YAxis stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} width={52} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={n => <span className="text-stone-400">{n}</span>} />
                    <Area type="monotone" dataKey="lucro_bruto" name="Lucro Bruto" stroke="#8b5cf6" fill="url(#gLucro)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Area type="monotone" dataKey="lucro_pos_ads" name="Lucro pós ADS" stroke="#10b981" fill="url(#gMpa)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {activeTab === 'vendas' && (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="label" stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <YAxis stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip content={<CustomTooltip isMoney={false} />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={n => <span className="text-stone-400">{n}</span>} />
                    <Bar dataKey="unidades" name="Unidades" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="n_vendas" name="Nº de Vendas" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {activeTab === 'roi' && (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gRoi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="label" stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <YAxis stroke="#4b5563" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(0)}%`} width={44} />
                    <Tooltip content={<CustomTooltip isMoney={false} />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={n => <span className="text-stone-400">{n}</span>} />
                    <Area type="monotone" dataKey="roi" name="ROI (%)" stroke="#f59e0b" fill="url(#gRoi)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </>
          )}
        </div>

        {/* Secondary KPIs */}
        {t && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              { label: 'Custo Produtos', value: formatBRL(t.custo_produtos), color: 'text-stone-300' },
              { label: 'Valor ADS', value: formatBRL(t.valor_ads), color: 'text-stone-300' },
              { label: 'Lucro pós ADS', value: formatBRL(t.lucro_pos_ads), color: t.lucro_pos_ads >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Nº de Vendas', value: t.n_vendas.toLocaleString('pt-BR'), color: 'text-stone-300' },
              { label: 'Unidades', value: t.unidades.toLocaleString('pt-BR'), color: 'text-stone-300' },
              { label: 'ROI Médio', value: formatPct(t.roi_medio), color: t.roi_medio >= 0 ? 'text-emerald-400' : 'text-red-400' },
            ].map(k => (
              <div key={k.label} className="bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 flex flex-col gap-0.5">
                <p className="text-xs text-stone-500">{k.label}</p>
                <p className={`text-base font-semibold ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
