import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { TrendingUp, MousePointerClick, Eye, DollarSign, Target, BarChart2 } from 'lucide-react'
import LojasIndisponiveisAviso from '../components/LojasIndisponiveisAviso'

function fmt(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function fmtNum(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString('pt-BR')
}

function fmtPct(v, decimals = 2) {
  if (v === null || v === undefined) return '—'
  return `${Number(v).toFixed(decimals)}%`
}

function fmtX(v) {
  if (v === null || v === undefined) return '—'
  return `${Number(v).toFixed(2)}x`
}

function KPI({ icon: Icon, label, value, sub, color = 'text-sky-400' }) {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-stone-500">
        <Icon size={14} strokeWidth={1.75} />
        <span className="text-xs">{label}</span>
      </div>
      <span className={`text-xl font-bold ${color}`}>{value}</span>
      {sub && <span className="text-xs text-stone-600">{sub}</span>}
    </div>
  )
}

function statusBadge(status) {
  if (status === 'active') return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Ativa</span>
  if (status === 'paused') return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pausada</span>
  return <span className="px-2 py-0.5 rounded-full text-xs bg-stone-800 text-stone-500">{status}</span>
}

function acosColor(v) {
  if (v === null || v === undefined) return 'text-stone-500'
  if (v <= 10) return 'text-emerald-400'
  if (v <= 20) return 'text-sky-400'
  if (v <= 30) return 'text-yellow-400'
  return 'text-red-400'
}

export default function Ads() {
  const [params] = useSearchParams()
  const periodo = params.get('periodo') || '30d'
  const de = params.get('de') || ''
  const ate = params.get('ate') || ''
  const { activeAccount } = useAuth()

  const queryParams = {
    periodo,
    conta_ml: activeAccount,
    ...(periodo === 'custom' && de && ate ? { de, ate } : {}),
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ads', periodo, de, ate, activeAccount],
    queryFn: () => api.ads(queryParams),
    enabled: !!activeAccount && (periodo !== 'custom' || (!!de && !!ate)),
  })

  const campanhas = data?.campanhas || []
  const totais = data?.totais || {}

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Mercado Ads" onRefresh={refetch} isLoading={isLoading} />

      <main className="flex-1 p-3 sm:p-6 overflow-auto space-y-5">
        <LojasIndisponiveisAviso lojas={data?.lojas_indisponiveis} />
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            {error.message}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPI
            icon={DollarSign}
            label="Gasto Total"
            value={fmt(totais.gasto)}
            color="text-red-400"
          />
          <KPI
            icon={MousePointerClick}
            label="Cliques"
            value={fmtNum(totais.cliques)}
            color="text-sky-400"
          />
          <KPI
            icon={Eye}
            label="Impressões"
            value={fmtNum(totais.impressoes)}
            color="text-stone-300"
          />
          <KPI
            icon={TrendingUp}
            label="Vendas Atribuídas"
            value={fmt(totais.vendas_total)}
            sub={`Diretas: ${fmt(totais.vendas_diretas)}`}
            color="text-emerald-400"
          />
          <KPI
            icon={Target}
            label="ACOS Médio"
            value={fmtPct(totais.acos)}
            color={acosColor(totais.acos)}
          />
          <KPI
            icon={BarChart2}
            label="ROAS"
            value={fmtX(totais.roas)}
            color="text-purple-400"
          />
        </div>

        {/* Tabela de campanhas */}
        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-200">
              {campanhas.length > 0 ? `${campanhas.length} campanhas` : 'Campanhas'}
            </h2>
            {data?.de && (
              <span className="text-xs text-stone-600">
                {data.de} → {data.ate}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="px-4 py-3 text-left text-stone-500 font-medium">Campanha</th>
                  <th className="px-4 py-3 text-left text-stone-500 font-medium">Status</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">Budget/dia</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">Gasto</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">Cliques</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">Impressões</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">CTR</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">CPC</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">Vendas</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">ACOS</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-medium">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-stone-600">Carregando…</td>
                  </tr>
                )}
                {!isLoading && campanhas.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-stone-600">
                      Nenhuma campanha encontrada no período.
                    </td>
                  </tr>
                )}
                {campanhas.map((c) => {
                  const m = c.metrics || {}
                  const vendas = (m.direct_amount || 0) + (m.indirect_amount || 0)
                  return (
                    <tr key={c.id} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                      <td className="px-4 py-3 text-stone-200 font-medium max-w-[180px] truncate" title={c.name}>
                        {c.name}
                      </td>
                      <td className="px-4 py-3">{statusBadge(c.status)}</td>
                      <td className="px-4 py-3 text-right text-stone-400">{c.budget ? fmt(c.budget) : '—'}</td>
                      <td className="px-4 py-3 text-right text-red-400 font-medium">{fmt(m.cost)}</td>
                      <td className="px-4 py-3 text-right text-sky-400">{fmtNum(m.clicks)}</td>
                      <td className="px-4 py-3 text-right text-stone-400">{fmtNum(m.prints)}</td>
                      <td className="px-4 py-3 text-right text-stone-400">{fmtPct(m.ctr)}</td>
                      <td className="px-4 py-3 text-right text-stone-400">{fmt(m.cpc)}</td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-medium">{fmt(vendas)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${acosColor(m.acos)}`}>{fmtPct(m.acos)}</td>
                      <td className="px-4 py-3 text-right text-purple-400">{fmtX(m.roas)}</td>
                    </tr>
                  )
                })}
              </tbody>
              {campanhas.length > 0 && (
                <tfoot className="border-t border-stone-700">
                  <tr className="bg-stone-800/40">
                    <td colSpan={3} className="px-4 py-3 text-stone-400 font-semibold text-xs">Total</td>
                    <td className="px-4 py-3 text-right text-red-400 font-bold">{fmt(totais.gasto)}</td>
                    <td className="px-4 py-3 text-right text-sky-400 font-bold">{fmtNum(totais.cliques)}</td>
                    <td className="px-4 py-3 text-right text-stone-400 font-bold">{fmtNum(totais.impressoes)}</td>
                    <td className="px-4 py-3 text-right text-stone-500">—</td>
                    <td className="px-4 py-3 text-right text-stone-500">—</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-bold">{fmt(totais.vendas_total)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${acosColor(totais.acos)}`}>{fmtPct(totais.acos)}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-bold">{fmtX(totais.roas)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
