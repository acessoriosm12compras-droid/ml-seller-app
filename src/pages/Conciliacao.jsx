import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
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

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

const TABS = ['Todos', 'Pendente', 'Ok', 'Divergência']

const TAB_FILTER_MAP = {
  'Todos': null,
  'Pendente': 'pendente',
  'Ok': 'ok',
  'Divergência': 'divergencia',
}

function eventLabel(tipo) {
  if (tipo === 'repasse_ml') return '💸 Repasse ML'
  if (tipo === 'deposito_banco') return '🏦 Depósito'
  if (tipo === 'taxa_indevida') return '⚠️ Taxa'
  return tipo
}

function eventLabelColor(tipo) {
  if (tipo === 'repasse_ml') return 'text-blue-400'
  if (tipo === 'deposito_banco') return 'text-green-400'
  if (tipo === 'taxa_indevida') return 'text-red-400'
  return 'text-stone-400'
}

function StatusBadge({ status }) {
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
        ✓ OK
      </span>
    )
  }
  if (status === 'pendente') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400">
        ⏳ Pendente
      </span>
    )
  }
  if (status === 'divergencia') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">
        ✗ Divergência
      </span>
    )
  }
  return null
}

export default function Conciliacao() {
  const { activeAccount } = useAuth()
  const [mes, setMes] = useState(getCurrentMonth)
  const [activeTab, setActiveTab] = useState('Todos')
  const [syncLoading, setSyncLoading] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['conciliacao', mes, activeAccount],
    queryFn: () => api.conciliacao({ mes, conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  async function handleSync() {
    setSyncLoading(true)
    try {
      await api.pluggy.sync()
      await refetch()
    } finally {
      setSyncLoading(false)
    }
  }

  const bankNotConnected = !data || !data.cards

  const filterStatus = TAB_FILTER_MAP[activeTab]

  const filteredTimeline = (data?.timeline || []).filter((group) => {
    if (!filterStatus) return true
    return group.eventos.some((e) => e.status === filterStatus)
  }).map((group) => {
    if (!filterStatus) return group
    return {
      ...group,
      eventos: group.eventos.filter((e) => e.status === filterStatus),
    }
  })

  const cards = data?.cards || {}

  return (
    <div className="flex flex-col flex-1">
      <Header title="Conciliação Bancária" onRefresh={refetch} isLoading={isLoading} />
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
          <button
            onClick={handleSync}
            disabled={syncLoading}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-stone-900 text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            {syncLoading ? '⏳ Sincronizando...' : '🔄 Sincronizar banco'}
          </button>
        </div>
        {isLoading && <div className="text-stone-500 text-sm">Carregando...</div>}
        {error && <div className="text-red-400 text-sm">{error.message}</div>}

        {!isLoading && !error && bankNotConnected && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 flex flex-col items-center gap-4 text-center">
            <span className="text-4xl">🏦</span>
            <p className="text-stone-400 text-sm max-w-sm">
              Conecte sua conta bancária para ver a conciliação
            </p>
            <button
              onClick={() => alert('Funcionalidade de conexão bancária disponível em breve')}
              className="bg-sky-500 hover:bg-sky-400 text-stone-900 text-sm font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Conectar banco
            </button>
          </div>
        )}

        {!isLoading && !error && !bankNotConnected && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">ML Prometeu</p>
                <p className="text-2xl font-bold text-green-400">{formatBRL(cards.ml_prometeu)}</p>
              </div>
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Depositado no Banco</p>
                <p className="text-2xl font-bold text-blue-400">{formatBRL(cards.depositado_banco)}</p>
              </div>
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Diferença Total</p>
                <p className={`text-2xl font-bold ${cards.diferenca_total > 0 ? 'text-sky-400' : 'text-green-400'}`}>
                  {formatBRL(cards.diferenca_total)}
                </p>
              </div>
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">Taxas Indevidas</p>
                <p className={`text-2xl font-bold ${cards.taxas_indevidas > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {formatBRL(cards.taxas_indevidas)}
                </p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                    activeTab === tab
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                      : 'text-stone-400 hover:text-stone-200 border border-stone-700 hover:border-stone-600'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Timeline */}
            <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 space-y-4">
              {filteredTimeline.length === 0 ? (
                <p className="text-stone-500 text-sm text-center py-4">
                  Nenhum evento encontrado para este período.
                </p>
              ) : (
                filteredTimeline.map((group, gi) => (
                  <div key={gi} className="space-y-2">
                    {/* Date header */}
                    <div className="flex items-center gap-2 pb-1 border-b border-stone-800">
                      <span className="text-sm font-medium text-stone-300">
                        {formatDate(group.data)}
                      </span>
                      {group.tem_divergencia && (
                        <span className="text-sky-400 text-sm" title="Divergência neste dia">⚠</span>
                      )}
                    </div>

                    {/* Events */}
                    {group.eventos.map((evento, ei) => (
                      <div
                        key={ei}
                        className="flex items-center justify-between py-2 px-3 rounded-lg bg-stone-800/50 hover:bg-stone-800 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className={`text-sm font-medium ${eventLabelColor(evento.tipo)}`}>
                            {eventLabel(evento.tipo)}
                          </span>
                          <span className="text-xs text-stone-500 truncate hidden sm:block">
                            {evento.descricao}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-semibold text-stone-200">
                            {formatBRL(evento.valor)}
                          </span>
                          <StatusBadge status={evento.status} />
                          {evento.diferenca !== null && evento.diferenca !== 0 && (
                            <span className="text-xs text-red-400">
                              Δ {formatBRL(evento.diferenca)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
