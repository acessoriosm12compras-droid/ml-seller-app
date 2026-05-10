import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'

export default function Configuracoes() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState({}) // { nome: string value }
  const [status, setStatus] = useState({})   // { nome: 'saving' | 'saved' | 'error' }
  const [syncStatus, setSyncStatus] = useState(null) // null | 'loading' | { ok, resultados, periodo } | { erro }
  const [syncPeriodo, setSyncPeriodo] = useState('90d')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['configuracoes-contas'],
    queryFn: () => api.configuracoes.contas(),
  })

  const mutation = useMutation({
    mutationFn: ({ nome, imposto }) => api.configuracoes.updateImposto(nome, imposto),
    onSuccess: (_, { nome }) => {
      setStatus(s => ({ ...s, [nome]: 'saved' }))
      setTimeout(() => setStatus(s => ({ ...s, [nome]: null })), 2000)
      queryClient.invalidateQueries({ queryKey: ['configuracoes-contas'] })
    },
    onError: (_, { nome }) => {
      setStatus(s => ({ ...s, [nome]: 'error' }))
    },
  })

  function handleSave(conta) {
    const raw = editing[conta.nome]
    if (raw === undefined) return
    const value = parseFloat(raw.replace(',', '.'))
    if (isNaN(value) || value < 0 || value > 100) {
      setStatus(s => ({ ...s, [conta.nome]: 'error' }))
      return
    }
    setStatus(s => ({ ...s, [conta.nome]: 'saving' }))
    mutation.mutate({ nome: conta.nome, imposto: value })
    setEditing(s => { const n = { ...s }; delete n[conta.nome]; return n })
  }

  async function handleSync() {
    setSyncStatus('loading')
    try {
      const result = await api.sync.trigger({ periodo: syncPeriodo })
      setSyncStatus(result)
      queryClient.invalidateQueries()
    } catch (e) {
      setSyncStatus({ erro: e.message || 'Erro desconhecido' })
    }
  }

  const contas = data?.contas ?? []

  return (
    <div className="flex flex-col flex-1">
      <Header title="Configurações" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-3 sm:p-6 max-w-2xl space-y-4">
        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-800">
            <h2 className="text-sm font-medium text-stone-300">Alíquota de Imposto por Conta</h2>
            <p className="text-xs text-stone-500 mt-0.5">Percentual de imposto aplicado sobre o faturamento de cada conta</p>
          </div>

          {isLoading && (
            <div className="px-4 py-8 text-center text-stone-500 text-sm">Carregando contas...</div>
          )}

          {contas.map((conta, i) => {
            const isEditing = editing[conta.nome] !== undefined
            const displayValue = isEditing
              ? editing[conta.nome]
              : String(conta.imposto.toFixed(2)).replace('.', ',')
            const st = status[conta.nome]

            return (
              <div
                key={conta.nome}
                className={`flex items-center justify-between px-4 py-4 ${i < contas.length - 1 ? 'border-b border-stone-800/50' : ''}`}
              >
                <div>
                  <p className="text-stone-200 text-sm font-medium">{conta.nome}</p>
                  <p className="text-stone-500 text-xs">Mercado Livre</p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={displayValue}
                      placeholder="0,00"
                      onChange={e => setEditing(s => ({ ...s, [conta.nome]: e.target.value }))}
                      onFocus={() => {
                        if (!isEditing) {
                          setEditing(s => ({ ...s, [conta.nome]: String(conta.imposto.toFixed(2)).replace('.', ',') }))
                        }
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') handleSave(conta) }}
                      className={`bg-stone-800 border rounded px-2 py-1 text-right text-sm text-stone-200 focus:outline-none focus:ring-1 w-20 ${
                        st === 'error'
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-stone-700 focus:ring-sky-500'
                      }`}
                    />
                    <span className="text-stone-400 text-sm">%</span>
                  </div>

                  <button
                    onClick={() => handleSave(conta)}
                    disabled={!isEditing || st === 'saving'}
                    className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-stone-950 text-xs font-semibold rounded-lg transition-colors"
                  >
                    {st === 'saving' ? 'Salvando...' : 'Salvar'}
                  </button>

                  <div className="w-14 text-xs">
                    {st === 'saved' && <span className="text-emerald-400">✓ Salvo</span>}
                    {st === 'error' && <span className="text-red-400">✗ Erro</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-800">
            <h2 className="text-sm font-medium text-stone-300">Sincronizar Dados</h2>
            <p className="text-xs text-stone-500 mt-0.5">Força a busca de pedidos, collections e anúncios do Mercado Livre</p>
          </div>
          <div className="px-4 py-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs text-stone-400">Período:</label>
              <select
                value={syncPeriodo}
                onChange={e => setSyncPeriodo(e.target.value)}
                disabled={syncStatus === 'loading'}
                className="bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="30d">Últimos 30 dias</option>
                <option value="90d">Últimos 90 dias</option>
                <option value="180d">Últimos 180 dias</option>
              </select>
              <button
                onClick={handleSync}
                disabled={syncStatus === 'loading'}
                className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-stone-950 text-xs font-semibold rounded-lg transition-colors"
              >
                {syncStatus === 'loading' ? 'Sincronizando...' : 'Sincronizar Agora'}
              </button>
            </div>

            {syncStatus && syncStatus !== 'loading' && (
              <div className={`text-xs rounded-lg px-3 py-2 ${syncStatus.erro ? 'bg-red-950 text-red-300 border border-red-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'}`}>
                {syncStatus.erro ? (
                  <span>Erro: {syncStatus.erro}</span>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">Sincronização concluída — {syncStatus.periodo?.de} a {syncStatus.periodo?.ate}</span>
                    <span>Pedidos: {syncStatus.resultados?.pedidos ?? '—'} | Collections: {syncStatus.resultados?.collections ?? '—'} | Dias de ADS: {syncStatus.resultados?.ads_dias ?? '—'}</span>
                    {(syncStatus.resultados?.pedidos_erro || syncStatus.resultados?.collections_erro || syncStatus.resultados?.ads_erro) && (
                      <span className="text-yellow-400 mt-0.5">
                        Avisos: {[syncStatus.resultados.pedidos_erro, syncStatus.resultados.collections_erro, syncStatus.resultados.ads_erro].filter(Boolean).join(' | ')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
