import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'

export default function Configuracoes() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState({}) // { nome: string value }
  const [status, setStatus] = useState({})   // { nome: 'saving' | 'saved' | 'error' }

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

  function handleBlur(conta) {
    const raw = editing[conta.nome]
    if (raw === undefined) return
    const value = parseFloat(raw.replace(',', '.'))
    if (isNaN(value) || value < 0 || value > 100) {
      setStatus(s => ({ ...s, [conta.nome]: 'error' }))
      return
    }
    if (value === conta.imposto) {
      setEditing(s => { const n = { ...s }; delete n[conta.nome]; return n })
      return
    }
    setStatus(s => ({ ...s, [conta.nome]: 'saving' }))
    mutation.mutate({ nome: conta.nome, imposto: value })
    setEditing(s => { const n = { ...s }; delete n[conta.nome]; return n })
  }

  const contas = data?.contas ?? []

  return (
    <div className="flex flex-col flex-1">
      <Header title="Configurações" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-3 sm:p-6 max-w-2xl">
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

                <div className="flex items-center gap-3">
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
                      onBlur={() => handleBlur(conta)}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                      className={`bg-stone-800 border rounded px-2 py-1 text-right text-sm text-stone-200 focus:outline-none focus:ring-1 w-20 ${
                        st === 'error'
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-stone-700 focus:ring-sky-500'
                      }`}
                    />
                    <span className="text-stone-400 text-sm">%</span>
                  </div>

                  <div className="w-20 text-xs text-right">
                    {st === 'saving' && <span className="text-stone-500">Salvando...</span>}
                    {st === 'saved' && <span className="text-emerald-400">✓ Salvo</span>}
                    {st === 'error' && <span className="text-red-400">✗ Erro</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
