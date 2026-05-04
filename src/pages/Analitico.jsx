import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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

function TendenciaBadge({ t }) {
  if (!t) return <span className="text-stone-600">—</span>
  const cfg = {
    crescimento: { color: 'text-emerald-400 bg-emerald-500/10', icon: '▲', label: 'Crescimento' },
    estavel: { color: 'text-stone-400 bg-stone-700/50', icon: '●', label: 'Estável' },
    queda: { color: 'text-red-400 bg-red-500/10', icon: '▼', label: 'Queda' },
  }[t] || { color: 'text-stone-500', icon: '—', label: t }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <span>{cfg.icon}</span>{cfg.label}
    </span>
  )
}

export default function Analitico() {
  const [params] = useSearchParams()
  const periodo = params.get('periodo') || '30d'
  const de = params.get('de') || ''
  const ate = params.get('ate') || ''
  const { activeAccount } = useAuth()
  const [tab, setTab] = useState('produtos')

  const baseParams = {
    periodo,
    conta_ml: activeAccount,
    ...(periodo === 'custom' && de && ate ? { de, ate } : {}),
  }

  const { data: prodData, isLoading: loadProd, error: errProd, refetch: refetchProd } = useQuery({
    queryKey: ['analitico-produtos', periodo, de, ate, activeAccount],
    queryFn: () => api.analitico.produtos(baseParams),
    enabled: !!activeAccount && (periodo !== 'custom' || (!!de && !!ate)),
  })

  const { data: anuncData, isLoading: loadAnunc, error: errAnunc, refetch: refetchAnunc } = useQuery({
    queryKey: ['analitico-anuncios', periodo, de, ate, activeAccount],
    queryFn: () => api.analitico.vendasPorAnuncio(baseParams),
    enabled: !!activeAccount && (periodo !== 'custom' || (!!de && !!ate)),
  })

  const isLoading = tab === 'produtos' ? loadProd : loadAnunc
  const error = tab === 'produtos' ? errProd : errAnunc
  function refetch() { tab === 'produtos' ? refetchProd() : refetchAnunc() }

  const produtos = prodData?.produtos || []
  const anuncios = anuncData?.anuncios || []

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Analítico" onRefresh={refetch} isLoading={isLoading} />

      <main className="flex-1 p-6 overflow-auto space-y-4">
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            {error.message}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-stone-800">
          {[
            { key: 'produtos', label: 'Produtos' },
            { key: 'anuncios', label: 'Vendas por Anúncio' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'border-sky-400 text-sky-400 font-medium'
                  : 'border-transparent text-stone-500 hover:text-stone-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Produtos tab */}
        {tab === 'produtos' && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-800">
              <h2 className="text-sm font-semibold text-stone-200">
                {prodData ? `${produtos.length} produtos` : 'Produtos'}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-stone-800">
                    <th className="px-4 py-3 text-left text-stone-500">Produto</th>
                    <th className="px-4 py-3 text-right text-stone-500">Unidades</th>
                    <th className="px-4 py-3 text-right text-stone-500">Faturamento</th>
                    <th className="px-4 py-3 text-right text-stone-500">Represent.</th>
                    <th className="px-4 py-3 text-right text-stone-500">Taxas ML</th>
                    <th className="px-4 py-3 text-right text-stone-500">Imposto</th>
                    <th className="px-4 py-3 text-right text-stone-500">Custo ADS</th>
                    <th className="px-4 py-3 text-right text-stone-500">Custo Prod.</th>
                    <th className="px-4 py-3 text-right text-stone-500">Lucro</th>
                    <th className="px-4 py-3 text-right text-stone-500">MPA</th>
                    <th className="px-4 py-3 text-right text-stone-500">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {loadProd && (
                    <tr><td colSpan={11} className="px-4 py-10 text-center text-stone-600">Carregando…</td></tr>
                  )}
                  {!loadProd && produtos.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-10 text-center text-stone-600">Sem dados no período.</td></tr>
                  )}
                  {produtos.map((p, i) => {
                    const lucroColor = p.lucro === null ? 'text-stone-500' : p.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'
                    const mpaColor = p.mpa === null ? 'text-stone-500' : p.mpa >= 15 ? 'text-emerald-400' : p.mpa >= 0 ? 'text-sky-400' : 'text-red-400'
                    return (
                      <tr key={p.ml_item_id || i} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                        <td className="px-4 py-3 text-stone-300 max-w-[220px]">
                          <div className="truncate" title={p.titulo}>{p.titulo}</div>
                          <div className="text-stone-600 font-mono text-[10px]">{p.ml_item_id}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-stone-300">{p.unidades}</td>
                        <td className="px-4 py-3 text-right text-sky-400 font-medium">{formatBRL(p.faturamento)}</td>
                        <td className="px-4 py-3 text-right text-stone-400">{formatPct(p.representatividade)}</td>
                        <td className="px-4 py-3 text-right text-red-400">{formatBRL(p.taxas_ml)}</td>
                        <td className="px-4 py-3 text-right text-stone-400">{formatBRL(p.imposto)}</td>
                        <td className="px-4 py-3 text-right text-stone-400">{formatBRL(p.custo_ads)}</td>
                        <td className="px-4 py-3 text-right text-stone-400">{p.custo_produtos !== null ? formatBRL(p.custo_produtos) : <span className="text-stone-600">—</span>}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${lucroColor}`}>{p.lucro !== null ? formatBRL(p.lucro) : <span className="text-stone-600">—</span>}</td>
                        <td className={`px-4 py-3 text-right font-medium ${mpaColor}`}>{p.mpa !== null ? formatPct(p.mpa) : <span className="text-stone-600">—</span>}</td>
                        <td className={`px-4 py-3 text-right ${p.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p.roi !== null ? formatPct(p.roi) : <span className="text-stone-600">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Vendas por Anúncio tab */}
        {tab === 'anuncios' && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-800">
              <h2 className="text-sm font-semibold text-stone-200">
                Período: <span className="text-stone-400">{anuncData?.periodo_atual || '—'}</span>
                <span className="mx-2 text-stone-700">vs</span>
                <span className="text-stone-400">{anuncData?.periodo_anterior || '—'}</span>
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-stone-800">
                    <th className="px-4 py-3 text-left text-stone-500">Anúncio</th>
                    <th className="px-4 py-3 text-right text-stone-500">Fat. Atual</th>
                    <th className="px-4 py-3 text-right text-stone-500">Fat. Anterior</th>
                    <th className="px-4 py-3 text-right text-stone-500">Variação</th>
                    <th className="px-4 py-3 text-center text-stone-500">Tendência</th>
                    <th className="px-4 py-3 text-right text-stone-500">Un. Atual</th>
                    <th className="px-4 py-3 text-right text-stone-500">Un. Anterior</th>
                  </tr>
                </thead>
                <tbody>
                  {loadAnunc && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-stone-600">Carregando…</td></tr>
                  )}
                  {!loadAnunc && anuncios.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-stone-600">Sem dados no período.</td></tr>
                  )}
                  {anuncios.map((a, i) => {
                    const varPct = a.variacao_faturamento
                    const varColor = varPct === null ? 'text-stone-500' : varPct > 0 ? 'text-emerald-400' : varPct < 0 ? 'text-red-400' : 'text-stone-400'
                    return (
                      <tr key={a.ml_item_id || i} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                        <td className="px-4 py-3 text-stone-300 max-w-[220px]">
                          <div className="truncate" title={a.titulo}>{a.titulo}</div>
                          <div className="text-stone-600 font-mono text-[10px]">{a.ml_item_id}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-sky-400 font-medium">{formatBRL(a.faturamento_atual)}</td>
                        <td className="px-4 py-3 text-right text-stone-500">{formatBRL(a.faturamento_anterior)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${varColor}`}>
                          {varPct !== null ? `${varPct > 0 ? '+' : ''}${varPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center"><TendenciaBadge t={a.tendencia} /></td>
                        <td className="px-4 py-3 text-right text-stone-300">{a.unidades_atual}</td>
                        <td className="px-4 py-3 text-right text-stone-500">{a.unidades_anterior}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
