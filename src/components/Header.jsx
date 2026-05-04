import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PeriodSelector from './PeriodSelector'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'

const CONTAS = ['YUSO', 'LOCITECH', 'J12', 'M12']

function fmtSyncTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Header({ title, onRefresh, isLoading }) {
  const { role, activeAccount, setActiveAccount } = useAuth()
  const qc = useQueryClient()
  const [syncPeriodo, setSyncPeriodo] = useState('90d')

  const { data: syncStatus } = useQuery({
    queryKey: ['sync-status', activeAccount],
    queryFn: () => api.sync.status(),
    enabled: !!activeAccount,
    staleTime: 60_000,
  })

  const syncMut = useMutation({
    mutationFn: () => api.sync.trigger({ periodo: syncPeriodo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync-status'] })
      qc.invalidateQueries()  // invalidate all queries so pages reload from DB
    },
  })

  const pedidosSync = syncStatus?.status?.pedidos
  const lastSync = pedidosSync?.executado_em ? fmtSyncTime(pedidosSync.executado_em) : null
  const isSynced = !!pedidosSync

  function toggleDark() {
    const isDark = document.documentElement.classList.toggle('dark')
    localStorage.setItem('color-schema', isDark ? 'dark' : 'light')
  }

  return (
    <header className="min-h-14 bg-gray-900 dark:bg-gray-950 border-b border-gray-800 flex items-start justify-between px-6 py-2 gap-4">
      <div className="flex items-center gap-3 mt-1.5 shrink-0">
        <h1 className="text-gray-100 font-semibold text-base">{title}</h1>
        {role === 'admin' && (
          <select
            value={activeAccount || ''}
            onChange={e => setActiveAccount(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {CONTAS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-end">
        <PeriodSelector />

        {/* Sync block */}
        <div className="flex items-center gap-1.5 border-l border-gray-800 pl-2">
          {lastSync && (
            <span className="text-xs text-gray-600 hidden sm:block whitespace-nowrap">
              {isSynced ? `✓ ${lastSync}` : ''}
            </span>
          )}
          {!isSynced && !syncMut.isPending && (
            <span className="text-xs text-amber-500 hidden sm:block">Sem sync</span>
          )}

          <select
            value={syncPeriodo}
            onChange={e => setSyncPeriodo(e.target.value)}
            disabled={syncMut.isPending}
            className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-400 focus:outline-none disabled:opacity-40"
          >
            <option value="30d">30d</option>
            <option value="90d">90d</option>
            <option value="180d">180d</option>
          </select>

          <button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
              isSynced
                ? 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-amber-400 hover:border-amber-500/40'
                : 'bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
            }`}
            title="Sincronizar dados do Mercado Livre com o banco"
          >
            <span className={syncMut.isPending ? 'animate-spin' : ''}>⟳</span>
            <span>{syncMut.isPending ? 'Sincronizando…' : 'Sync'}</span>
          </button>

          {syncMut.isError && (
            <span className="text-xs text-red-400" title={syncMut.error?.message}>Erro</span>
          )}
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 text-gray-400 hover:text-gray-200 disabled:opacity-40 transition-colors"
          title="Atualizar"
        >
          {isLoading ? '⏳' : '🔄'}
        </button>
        <button
          onClick={toggleDark}
          className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
          title="Alternar tema"
        >
          🌙
        </button>
      </div>
    </header>
  )
}
