import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { api } from '../api'
import Header from '../components/Header'
import ProdutosTable from '../components/resultado/ProdutosTable'
import { useAuth } from '../context/AuthContext'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatPct(v) {
  if (v === null || v === undefined) return '—'
  return `${v.toFixed(2)}%`
}

// KPI card styled like Gestor Seller: dark bg, colored left border, label + value + optional delta
function GsKpiCard({ label, value, variacao, borderColor = 'border-l-gray-700', valueColor = 'text-gray-100', info }) {
  const varNum = typeof variacao === 'number' ? variacao : null
  const isPositive = varNum !== null && varNum >= 0
  const isNegative = varNum !== null && varNum < 0

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl p-5 border-l-4 ${borderColor} flex flex-col gap-1`}>
      <div className="flex items-center gap-1.5">
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        {info && (
          <span title={info} className="text-gray-600 cursor-default text-xs select-none">ⓘ</span>
        )}
      </div>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      {varNum !== null && (
        <p className={`text-xs flex items-center gap-1 ${isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-gray-500'}`}>
          <span>{isPositive ? '▲' : '▼'}</span>
          <span>{Math.abs(varNum).toFixed(1)}% vs período anterior</span>
        </p>
      )}
    </div>
  )
}

// Small secondary KPI card (for expanded row)
function SmallKpiCard({ label, value, valueColor = 'text-gray-300' }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-4 py-3 flex flex-col gap-0.5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-base font-semibold ${valueColor}`}>{value}</p>
    </div>
  )
}

// Chart tooltip with BRL formatting
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

export default function Dashboard() {
  const [params, setParams] = useSearchParams()
  const periodo = params.get('periodo') || 'hoje'
  const de = params.get('de') || ''
  const ate = params.get('ate') || ''
  const { activeAccount } = useAuth()
  const [expandedKpis, setExpandedKpis] = useState(false)

  useEffect(() => {
    if (!params.get('periodo')) {
      setParams(p => { const np = new URLSearchParams(p); np.set('periodo', 'hoje'); return np }, { replace: true })
    }
  }, [])

  const queryParams = {
    periodo,
    conta_ml: activeAccount,
    ...(periodo === 'custom' && de && ate ? { de, ate } : {}),
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard', periodo, de, ate, activeAccount],
    queryFn: () => api.dashboard(queryParams),
    enabled: !!activeAccount && (periodo !== 'custom' || (!!de && !!ate)),
  })

  const k = data?.kpis

  // Format chart date labels: "27 Abr"
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  function fmtData(d) {
    if (!d) return ''
    const [, m, day] = d.split('-')
    return `${parseInt(day)} ${MESES[parseInt(m) - 1]}`
  }

  const grafico = (data?.grafico || []).map(g => ({
    ...g,
    label: fmtData(g.data),
  }))

  const semCusto = (data?.top_produtos || []).filter(p => p.custo_unitario === null)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Dashboard" onRefresh={refetch} isLoading={isLoading} />

      <main className="flex-1 p-6 space-y-6 overflow-auto">
        {/* ── Error ── */}
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            {error.status === 401 ? 'Sessão expirada — faça login novamente.' : error.message}
          </div>
        )}

        {/* ── Alert: products without cost ── */}
        {semCusto.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start justify-between gap-4">
            <p className="text-amber-400 text-sm">
              <span className="font-semibold">{semCusto.length} {semCusto.length === 1 ? 'produto sem' : 'produtos sem'} custo cadastrado</span>
              {' — '}Lucro e Margem ficam em branco até você cadastrar.
            </p>
            <Link to="/configuracoes/custos" className="text-amber-400 text-sm hover:text-amber-300 whitespace-nowrap shrink-0">
              ⚙️ Cadastrar →
            </Link>
          </div>
        )}

        {/* ── Row 1: 4 main KPI cards ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <GsKpiCard
            label="Faturamento"
            value={k ? formatBRL(k.faturamento) : '…'}
            variacao={k?.faturamento_variacao}
            borderColor="border-l-amber-500"
            info="Soma de unit_price × quantidade de todos os pedidos pagos"
          />
          <GsKpiCard
            label="Líq. do Marketplace"
            value={k ? formatBRL(k.liquido_marketplace) : '…'}
            borderColor="border-l-blue-500"
            info="Faturamento descontando as taxas cobradas pelo Mercado Livre"
          />
          <GsKpiCard
            label="Lucro Bruto"
            value={k ? formatBRL(k.lucro_bruto) : '…'}
            variacao={k?.lucro_variacao}
            borderColor="border-l-violet-500"
            valueColor={k ? (k.lucro_bruto >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-gray-100'}
            info="Líquido do Marketplace menos o custo dos produtos (CMV)"
          />
          <GsKpiCard
            label="Margem"
            value={k ? formatPct(k.margem) : '…'}
            borderColor="border-l-emerald-500"
            valueColor={k ? (k.margem >= 15 ? 'text-emerald-400' : k.margem >= 0 ? 'text-amber-400' : 'text-red-400') : 'text-gray-100'}
            info="Lucro Bruto ÷ Faturamento"
          />
        </div>

        {/* ── Expandable secondary KPIs ── */}
        <div>
          <button
            onClick={() => setExpandedKpis(v => !v)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-3"
          >
            <span>{expandedKpis ? '▲' : '▼'}</span>
            <span>{expandedKpis ? 'Ocultar métricas' : 'Mais métricas'}</span>
          </button>

          {expandedKpis && (
            <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-8 gap-3">
              <SmallKpiCard label="Nº de Vendas" value={k ? k.n_vendas.toLocaleString('pt-BR') : '…'} />
              <SmallKpiCard label="Unidades" value={k ? k.unidades.toLocaleString('pt-BR') : '…'} />
              <SmallKpiCard label="Ticket Médio" value={k ? formatBRL(k.ticket_medio) : '…'} />
              <SmallKpiCard label="Reclamações" value={k ? k.reclamacoes : '…'} valueColor={k && k.reclamacoes > 0 ? 'text-red-400' : 'text-gray-300'} />
              <SmallKpiCard label="Valor em ADS" value={k ? formatBRL(k.valor_ads) : '…'} />
              <SmallKpiCard label="TACoS" value={k ? formatPct(k.tacos) : '…'} valueColor={k && k.tacos > 0 ? 'text-amber-400' : 'text-gray-300'} />
              <SmallKpiCard label="Lucro pós ADS" value={k ? formatBRL(k.lucro_pos_ads) : '…'} valueColor={k ? (k.lucro_pos_ads >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-gray-300'} />
              <SmallKpiCard label="MPA" value={k ? formatPct(k.mpa) : '…'} valueColor={k ? (k.mpa >= 15 ? 'text-emerald-400' : k.mpa >= 0 ? 'text-amber-400' : 'text-red-400') : 'text-gray-300'} />
            </div>
          )}
        </div>

        {/* ── Resumo de Receitas chart ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-gray-200">Resumo de Receitas</h2>
            {data?.periodo && (
              <span className="text-xs text-gray-500">
                {data.periodo.inicio} — {data.periodo.fim}
              </span>
            )}
          </div>

          {grafico.length === 0 && !isLoading ? (
            <p className="text-gray-600 text-sm text-center py-8">Sem dados para o período selecionado.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={grafico} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradLiq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="label"
                  stroke="#4b5563"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#4b5563"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={name => <span className="text-gray-400">{name}</span>}
                />
                <Area
                  type="monotone"
                  dataKey="faturamento"
                  name="Faturamento"
                  stroke="#f59e0b"
                  fill="url(#gradFat)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Area
                  type="monotone"
                  dataKey="liquido"
                  name="Líq. Marketplace"
                  stroke="#3b82f6"
                  fill="url(#gradLiq)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Top 15 produtos vendidos ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-200">Top 15 produtos vendidos</h2>
            <Link
              to="/configuracoes/custos"
              className="text-xs text-gray-500 hover:text-amber-400 transition-colors"
            >
              ⚙️ Gerenciar custos →
            </Link>
          </div>
          {data?.top_produtos && <ProdutosTable produtos={data.top_produtos} />}
          {isLoading && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-600 text-sm">
              Carregando produtos…
            </div>
          )}
        </div>

        {data?.atualizado_em && (
          <p className="text-xs text-gray-700 pb-2">Atualizado: {data.atualizado_em}</p>
        )}
      </main>
    </div>
  )
}
