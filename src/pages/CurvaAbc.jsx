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

const CURVA_CFG = {
  A: { color: 'border-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Curva A', desc: '0–70% faturamento' },
  B: { color: 'border-blue-500',    bg: 'bg-blue-100',       text: 'text-blue-700',       label: 'Curva B', desc: '70–90% faturamento' },
  C: { color: 'border-amber-500',   bg: 'bg-amber-100',     text: 'text-amber-700',     label: 'Curva C', desc: '90–100% faturamento' },
  Z: { color: 'border-stone-400', bg: 'bg-stone-100', text: 'text-stone-600', label: 'Curva Z', desc: 'Sem vendas' },
}

function CurvaCard({ curva, resumo }) {
  const cfg = CURVA_CFG[curva]
  if (!resumo) return null
  return (
    <div className={`bg-white border border-stone-200 rounded-xl p-5 border-l-4 ${cfg.color}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className={`text-lg font-bold ${cfg.text}`}>{cfg.label}</span>
          <p className="text-xs text-stone-500 mt-0.5">{cfg.desc}</p>
        </div>
        <span className={`text-2xl font-bold ${cfg.text}`}>{resumo.n_produtos}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-stone-500">Faturamento</p>
          <p className="text-stone-800 font-medium">{formatBRL(resumo.faturamento)}</p>
        </div>
        <div>
          <p className="text-stone-500">Unidades</p>
          <p className="text-stone-800 font-medium">{resumo.unidades?.toLocaleString('pt-BR')}</p>
        </div>
        <div>
          <p className="text-stone-500">Lucro Bruto</p>
          <p className={`font-medium ${resumo.lucro_bruto >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatBRL(resumo.lucro_bruto)}</p>
        </div>
        <div>
          <p className="text-stone-500">Margem Média</p>
          <p className={`font-medium ${resumo.margem_media >= 15 ? 'text-emerald-600' : resumo.margem_media >= 0 ? 'text-sky-600' : 'text-red-600'}`}>{formatPct(resumo.margem_media)}</p>
        </div>
      </div>
    </div>
  )
}

export default function CurvaAbc() {
  const [params] = useSearchParams()
  const periodo = params.get('periodo') || 'hoje'
  const de = params.get('de') || ''
  const ate = params.get('ate') || ''
  const { activeAccount } = useAuth()

  const queryParams = {
    periodo,
    conta_ml: activeAccount,
    ...(periodo === 'custom' && de && ate ? { de, ate } : {}),
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['curva-abc', periodo, de, ate, activeAccount],
    queryFn: () => api.curvaAbc(queryParams),
    enabled: !!activeAccount && (periodo !== 'custom' || (!!de && !!ate)),
  })

  const produtos = data?.produtos || []
  const resumo = data?.resumo || {}

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Curva ABC" onRefresh={refetch} isLoading={isLoading} />

      <main className="flex-1 p-3 sm:p-6 space-y-6 overflow-auto">
        <LojasIndisponiveisAviso lojas={data?.lojas_indisponiveis} />
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            {error.message}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {['A', 'B', 'C', 'Z'].map(c => (
            <CurvaCard key={c} curva={c} resumo={resumo[c]} />
          ))}
        </div>

        {/* Products table */}
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
            <h2 className="text-sm font-semibold text-stone-800">
              {data ? `${produtos.length} produtos classificados` : 'Produtos'}
            </h2>
            {data?.faturamento_total && (
              <span className="text-xs text-stone-500">
                Faturamento total: <span className="text-sky-600 font-medium">{formatBRL(data.faturamento_total)}</span>
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="px-4 py-3 text-left text-stone-500 font-semibold uppercase tracking-wide text-[10px]">Curva</th>
                  <th className="px-4 py-3 text-left text-stone-500 font-semibold uppercase tracking-wide text-[10px]">Produto</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-semibold uppercase tracking-wide text-[10px]">Unidades</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-semibold uppercase tracking-wide text-[10px]">Faturamento</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-semibold uppercase tracking-wide text-[10px]">Represent.</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-semibold uppercase tracking-wide text-[10px]">% Acum.</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-semibold uppercase tracking-wide text-[10px]">Custo Prod.</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-semibold uppercase tracking-wide text-[10px]">Lucro Bruto</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-semibold uppercase tracking-wide text-[10px]">Lucro pós ADS</th>
                  <th className="px-4 py-3 text-right text-stone-500 font-semibold uppercase tracking-wide text-[10px]">MPA</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-stone-400">Carregando…</td></tr>
                )}
                {!isLoading && produtos.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-stone-400">Sem dados no período.</td></tr>
                )}
                {produtos.map((p, i) => {
                  const cfg = CURVA_CFG[p.curva] || CURVA_CFG.Z
                  const lucroColor = p.lucro_bruto === null ? 'text-stone-400' : p.lucro_bruto >= 0 ? 'text-emerald-600' : 'text-red-600'
                  const mpaColor = p.mpa === null ? 'text-stone-400' : p.mpa >= 15 ? 'text-emerald-600' : p.mpa >= 0 ? 'text-sky-600' : 'text-red-600'
                  return (
                    <tr key={p.ml_item_id || i} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
                          {p.curva}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="truncate font-medium text-stone-900" title={p.titulo}>{p.titulo}</div>
                        <div className="text-stone-400 font-mono text-[10px]">{p.ml_item_id}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-stone-700">{p.unidades}</td>
                      <td className="px-4 py-3 text-right text-sky-600 font-medium">{formatBRL(p.faturamento)}</td>
                      <td className="px-4 py-3 text-right text-stone-500">{formatPct(p.representatividade)}</td>
                      <td className="px-4 py-3 text-right text-stone-500">{formatPct(p.pct_acumulado)}</td>
                      <td className="px-4 py-3 text-right text-stone-500">{p.custo_produtos !== null ? formatBRL(p.custo_produtos) : <span className="text-stone-300">—</span>}</td>
                      <td className={`px-4 py-3 text-right font-medium ${lucroColor}`}>{p.lucro_bruto !== null ? formatBRL(p.lucro_bruto) : <span className="text-stone-300">—</span>}</td>
                      <td className={`px-4 py-3 text-right ${p.lucro_pos_ads >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{p.lucro_pos_ads !== null ? formatBRL(p.lucro_pos_ads) : <span className="text-stone-300">—</span>}</td>
                      <td className={`px-4 py-3 text-right font-medium ${mpaColor}`}>{p.mpa !== null ? formatPct(p.mpa) : <span className="text-stone-300">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
