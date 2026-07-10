import { useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  DollarSign, TrendingUp, Percent, ShoppingCart,
  Sparkles, ArrowUpRight,
} from 'lucide-react'
import { api } from '../api'
import Header from '../components/Header'
import ProdutosTable from '../components/resultado/ProdutosTable'
import LojasIndisponiveisAviso from '../components/LojasIndisponiveisAviso'
import { useAuth } from '../context/AuthContext'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatPct(v) {
  if (v === null || v === undefined) return '—'
  return `${v.toFixed(2)}%`
}

// Tons translúcidos para o "chip" do ícone de cada KPI — funcionam nos 2 temas
const TINTS = {
  amber:  { bg: 'rgba(232,155,22,0.14)', fg: '#E89B16' },
  mint:   { bg: 'rgba(63,174,126,0.14)', fg: '#3FAE7E' },
  lilac:  { bg: 'rgba(139,92,246,0.14)', fg: '#8b5cf6' },
  sky:    { bg: 'rgba(59,130,246,0.14)', fg: '#3b82f6' },
}

function GsKpiCard({ label, value, variacao, valueColor, info, filled, icon: Icon, tint }) {
  const varNum = typeof variacao === 'number' ? variacao : null
  const isPositive = varNum !== null && varNum >= 0
  const t = tint ? TINTS[tint] : null

  return (
    <div
      className={`rounded-2xl p-5 flex flex-col gap-2 border ${filled ? 'border-transparent' : 'bg-white border-stone-200'}`}
      style={filled ? { backgroundColor: '#F6B73C', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' } : undefined}
    >
      {Icon && (
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center mb-1"
          style={filled ? { backgroundColor: 'rgba(255,255,255,0.3)' } : { backgroundColor: t?.bg || 'rgba(232,155,22,0.14)' }}
        >
          <Icon size={18} color={filled ? '#fff' : (t?.fg || '#E89B16')} strokeWidth={2.2} />
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <p
          className={`text-[11px] font-semibold uppercase tracking-wider truncate ${filled ? '' : 'text-stone-500'}`}
          style={filled ? { color: '#7a5410' } : undefined}
        >
          {label}
        </p>
        {info && (
          <span title={info} className="text-stone-400 cursor-default text-[10px] select-none">ⓘ</span>
        )}
      </div>
      <p className="text-2xl font-bold tracking-tight" style={filled ? { color: '#fff' } : undefined}>
        <span className={filled ? '' : (valueColor ?? 'text-stone-800')}>{value}</span>
      </p>
      {varNum !== null && (
        <p
          className={`text-xs flex items-center gap-1 ${filled ? '' : (isPositive ? 'text-emerald-600' : 'text-red-500')}`}
          style={filled ? { color: '#ffffff' } : undefined}
        >
          <span>{isPositive ? '▲' : '▼'}</span>
          <span>{Math.abs(varNum).toFixed(1)}% vs período anterior</span>
        </p>
      )}
    </div>
  )
}

// Curva ABC (Pareto) calculada a partir dos produtos do período exibidos na tela.
// Regra igual à do backend: acumulado <=70% = A, <=90% = B, senão C.
function calcABC(produtos) {
  const arr = [...(produtos || [])]
    .filter(p => (p.total_faturado || 0) > 0)
    .sort((a, b) => b.total_faturado - a.total_faturado)
  const total = arr.reduce((s, p) => s + (p.total_faturado || 0), 0)
  const c = { A: { fat: 0, n: 0 }, B: { fat: 0, n: 0 }, C: { fat: 0, n: 0 } }
  let acc = 0
  for (const p of arr) {
    const rep = total ? (p.total_faturado / total) * 100 : 0
    acc += rep
    const cls = acc <= 70 ? 'A' : acc <= 90 ? 'B' : 'C'
    c[cls].fat += p.total_faturado
    c[cls].n += 1
  }
  const pct = k => (total ? Math.round((c[k].fat / total) * 100) : 0)
  return { total, n: arr.length, A: { ...c.A, pct: pct('A') }, B: { ...c.B, pct: pct('B') }, C: { ...c.C, pct: pct('C') } }
}

function DonutABC({ abc }) {
  const C = 2 * Math.PI * 15.9
  const seg = (pct, prev) => ({
    dasharray: `${(pct / 100) * C} ${C - (pct / 100) * C}`,
    dashoffset: C * 0.25 - (prev / 100) * C,
  })
  const a = seg(abc.A.pct, 0)
  const b = seg(abc.B.pct, abc.A.pct)
  const d = seg(abc.C.pct, abc.A.pct + abc.B.pct)
  return (
    <div className="flex items-center gap-5">
      <svg width="120" height="120" viewBox="0 0 42 42" className="shrink-0">
        <circle cx="21" cy="21" r="15.9" fill="none" style={{ stroke: 'var(--surface-3)' }} strokeWidth="5.5" />
        <circle cx="21" cy="21" r="15.9" fill="none" stroke="#3FAE7E" strokeWidth="5.5" strokeLinecap="round" strokeDasharray={a.dasharray} strokeDashoffset={a.dashoffset} />
        <circle cx="21" cy="21" r="15.9" fill="none" stroke="#F6B73C" strokeWidth="5.5" strokeLinecap="round" strokeDasharray={b.dasharray} strokeDashoffset={b.dashoffset} />
        <circle cx="21" cy="21" r="15.9" fill="none" stroke="#E89B6B" strokeWidth="5.5" strokeLinecap="round" strokeDasharray={d.dasharray} strokeDashoffset={d.dashoffset} />
        <text x="21" y="20.5" textAnchor="middle" fontSize="6.5" fontWeight="700" style={{ fill: 'var(--text)' }}>{abc.n}</text>
        <text x="21" y="26" textAnchor="middle" fontSize="3.2" fontWeight="700" style={{ fill: 'var(--text-muted)' }}>SKUs</text>
      </svg>
      <div className="flex flex-col gap-2.5 flex-1 text-sm">
        <div className="flex items-center gap-2 font-semibold"><i className="w-2.5 h-2.5 rounded" style={{ background: '#3FAE7E' }} />Classe A<span className="ml-auto text-stone-500">{abc.A.pct}%</span></div>
        <div className="flex items-center gap-2 font-semibold"><i className="w-2.5 h-2.5 rounded" style={{ background: '#F6B73C' }} />Classe B<span className="ml-auto text-stone-500">{abc.B.pct}%</span></div>
        <div className="flex items-center gap-2 font-semibold"><i className="w-2.5 h-2.5 rounded" style={{ background: '#E89B6B' }} />Classe C<span className="ml-auto text-stone-500">{abc.C.pct}%</span></div>
      </div>
    </div>
  )
}


function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-stone-900 border border-stone-700 rounded-xl p-3 text-xs shadow-xl">
      <p className="text-stone-500 mb-2 font-medium">{label}</p>
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
  const abc = calcABC(data?.top_produtos)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Dashboard" onRefresh={refetch} isLoading={isLoading} />

      <main className="flex-1 p-3 sm:p-6 space-y-6 overflow-auto">
        {/* ── Error ── */}
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            {error.status === 401 ? 'Sessão expirada — faça login novamente.' : error.message}
          </div>
        )}

        <LojasIndisponiveisAviso lojas={data?.lojas_indisponiveis} />

        {/* ── Alert: products without cost ── */}
        {semCusto.length > 0 && (
          <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-4 flex items-start justify-between gap-4">
            <p className="text-sky-400 text-sm">
              <span className="font-semibold">{semCusto.length} {semCusto.length === 1 ? 'produto sem' : 'produtos sem'} custo cadastrado</span>
              {' — '}Lucro e Margem ficam em branco até você cadastrar.
            </p>
            <Link to="/custos-produtos" className="text-sky-400 text-sm hover:text-sky-300 whitespace-nowrap shrink-0">
              ⚙️ Cadastrar →
            </Link>
          </div>
        )}

        {/* ── Linha 1: 4 KPIs principais (estilo hero, com ícone) ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <GsKpiCard
            label="Faturamento"
            value={k ? formatBRL(k.faturamento) : '…'}
            variacao={k?.faturamento_variacao}
            info="Soma de unit_price × quantidade de todos os pedidos pagos"
            icon={DollarSign}
            filled
          />
          <GsKpiCard
            label="Líq. do Marketplace"
            value={k ? formatBRL(k.liquido_marketplace) : '…'}
            info="Faturamento descontando as taxas cobradas pelo Mercado Livre"
            icon={ShoppingCart}
            tint="sky"
          />
          <GsKpiCard
            label="Lucro Bruto"
            value={k ? formatBRL(k.lucro_bruto) : '…'}
            variacao={k?.lucro_variacao}
            valueColor={k ? (k.lucro_bruto >= 0 ? 'text-emerald-600' : 'text-red-500') : undefined}
            info="Líquido do Marketplace menos o custo dos produtos (CMV)"
            icon={TrendingUp}
            tint="mint"
          />
          <GsKpiCard
            label="Margem"
            value={k ? formatPct(k.margem) : '…'}
            valueColor={k ? (k.margem >= 0 ? 'text-stone-800' : 'text-red-500') : undefined}
            info="Lucro Bruto ÷ Faturamento"
            icon={Percent}
            tint="lilac"
          />
        </div>

        {/* ── Linha 2: Vendas, Unidades, Ticket, ROI ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <GsKpiCard
            label="Número de Vendas"
            value={k ? k.n_vendas.toLocaleString('pt-BR') : '…'}
            variacao={k?.pedidos_variacao}
            scheme="indigo"
          />
          <GsKpiCard
            label="Unidades Vendidas"
            value={k ? k.unidades.toLocaleString('pt-BR') : '…'}
            scheme="violet"
          />
          <GsKpiCard
            label="Ticket Médio"
            value={k ? formatBRL(k.ticket_medio) : '…'}
            variacao={k?.ticket_variacao}
            scheme="cyan"
          />
          <GsKpiCard
            label="ROI"
            value={k ? formatPct(k.roi) : '…'}
            valueColor={k ? (k.roi >= 30 ? 'text-emerald-400' : k.roi >= 0 ? 'text-emerald-400' : 'text-red-400') : undefined}
            info="Lucro Bruto ÷ CMV"
            scheme="green"
          />
        </div>

        {/* ── Linha 3: ADS, TACoS, Lucro pós ADS, MPA ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <GsKpiCard
            label="Valor em Ads"
            value={k ? formatBRL(k.valor_ads) : '…'}
            scheme="orange"
          />
          <GsKpiCard
            label="TACoS"
            value={k && k.tacos > 0 ? formatPct(k.tacos) : '—'}
            info="Gasto em ADS ÷ Faturamento"
            scheme="rose"
          />
          <GsKpiCard
            label="Lucro pós ADS"
            value={k ? formatBRL(k.lucro_pos_ads) : '…'}
            valueColor={k ? (k.lucro_pos_ads >= 0 ? 'text-teal-400' : 'text-red-400') : undefined}
            info="Lucro Bruto menos o gasto em ADS"
            scheme="teal"
          />
          <GsKpiCard
            label="MPA"
            value={k ? formatPct(k.mpa) : '…'}
            valueColor={k ? (k.mpa >= 15 ? 'text-teal-400' : k.mpa >= 0 ? 'text-teal-400' : 'text-red-400') : undefined}
            info="Lucro pós ADS ÷ Faturamento"
            scheme="teal"
          />
        </div>

        {/* ── Gráfico de receitas + Curva ABC lado a lado ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">

        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-stone-800">Resumo de Receitas</h2>
            {data?.periodo && (
              <span className="text-xs text-stone-500">
                {data.periodo.inicio} — {data.periodo.fim}
              </span>
            )}
          </div>

          {grafico.length === 0 && !isLoading ? (
            <p className="text-stone-600 text-sm text-center py-8">Sem dados para o período selecionado.</p>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis
                  dataKey="label"
                  stroke="#a8a29e"
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#a8a29e"
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={name => <span className="text-stone-400">{name}</span>}
                />
                <Area
                  type="monotone"
                  dataKey="faturamento"
                  name="Faturamento"
                  stroke="#f59e0b"
                  fill="url(#gradFat)"
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: '#f59e0b' }}
                  activeDot={{ r: 5 }}
                />
                <Area
                  type="monotone"
                  dataKey="liquido"
                  name="Líq. Marketplace"
                  stroke="#3b82f6"
                  fill="url(#gradLiq)"
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: '#3b82f6' }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Coluna lateral: Curva ABC + Estúdio IA ── */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-stone-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-stone-800">Curva ABC</h2>
              <Link to="/curva-abc" className="text-xs text-stone-500 hover:text-sky-400 transition-colors">Detalhes →</Link>
            </div>
            {abc.total > 0 ? (
              <>
                <p className="text-xs text-stone-500 mb-3">Concentração do faturamento (produtos do período)</p>
                <DonutABC abc={abc} />
                <div className="flex gap-6 mt-4 pt-4 border-t border-stone-200">
                  <div>
                    <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Ticket médio</p>
                    <p className="text-lg font-bold text-stone-800">{k ? formatBRL(k.ticket_medio) : '…'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">ROI</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--success)' }}>{k ? formatPct(k.roi) : '…'}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-stone-500 text-sm py-6 text-center">Sem produtos no período.</p>
            )}
          </div>

          <Link
            to="/estudio-ia"
            className="rounded-xl p-5 flex flex-col gap-3 text-white"
            style={{ background: 'linear-gradient(135deg,#6E5BD6,#9b6ef0)' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2"><Sparkles size={16} /> Estúdio IA</h2>
              <ArrowUpRight size={18} />
            </div>
            <p className="text-sm" style={{ color: '#ece8ff' }}>
              Gere persona, pesquisa de mercado e capas a partir dos produtos mais vendidos.
            </p>
            <span className="mt-1 inline-flex items-center gap-2 bg-[#ffffff] text-violet-700 font-semibold text-sm rounded-xl px-4 py-2 w-fit">
              ✨ Analisar um produto
            </span>
          </Link>
        </div>

        </div>

        {/* ── Produtos vendidos ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-stone-800">Produtos vendidos</h2>
            <Link
              to="/custos-produtos"
              className="text-xs text-stone-500 hover:text-sky-400 transition-colors"
            >
              ⚙️ Gerenciar custos →
            </Link>
          </div>
          {data?.top_produtos && <ProdutosTable produtos={data.top_produtos} />}
          {isLoading && (
            <div className="bg-white border border-stone-100 rounded-2xl p-8 text-center text-stone-400 text-sm">
              Carregando produtos…
            </div>
          )}
        </div>

        {data?.atualizado_em && (
          <p className="text-xs text-stone-400 pb-2">Atualizado: {data.atualizado_em}</p>
        )}
      </main>
    </div>
  )
}
