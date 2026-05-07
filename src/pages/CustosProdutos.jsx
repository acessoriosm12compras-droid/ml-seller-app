import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'

export default function CustosProdutos() {
  const { activeAccount } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [editingCosts, setEditingCosts] = useState({}) // { item_id: string value while editing }
  const [savingStatus, setSavingStatus] = useState({}) // { item_id: 'saving' | 'saved' | 'error' }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['custos', activeAccount],
    queryFn: () => api.custos.list({ conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  const mutation = useMutation({
    mutationFn: (payload) => api.custos.save(payload),
    onSuccess: (_, variables) => {
      setSavingStatus(s => ({ ...s, [variables.item_id]: 'saved' }))
      setTimeout(() => setSavingStatus(s => ({ ...s, [variables.item_id]: null })), 2000)
      queryClient.invalidateQueries({ queryKey: ['custos', activeAccount] })
      queryClient.invalidateQueries({ queryKey: ['resultado'] })
    },
    onError: (_, variables) => {
      setSavingStatus(s => ({ ...s, [variables.item_id]: 'error' }))
    },
  })

  function handleBlur(produto) {
    const rawValue = editingCosts[produto.item_id]
    if (rawValue === undefined) return // not editing this item
    const value = parseFloat(rawValue.replace(',', '.'))
    if (isNaN(value) || value < 0) {
      setSavingStatus(s => ({ ...s, [produto.item_id]: 'error' }))
      return
    }
    // Only save if changed
    if (value === produto.custo_unitario) {
      setEditingCosts(s => { const n = {...s}; delete n[produto.item_id]; return n })
      return
    }
    setSavingStatus(s => ({ ...s, [produto.item_id]: 'saving' }))
    mutation.mutate({ item_id: produto.item_id, titulo: produto.titulo, custo_unitario: value, conta_ml: activeAccount })
    setEditingCosts(s => { const n = {...s}; delete n[produto.item_id]; return n })
  }

  const filtered = (data?.produtos ?? []).filter(p =>
    p.titulo.toLowerCase().includes(search.toLowerCase())
  )

  function handleDownload() {
    const produtos = data?.produtos ?? []
    const rows = [
      ['ml_item_id', 'titulo', 'custo'],
      ...produtos.map(p => [
        p.item_id,
        `"${(p.titulo ?? '').replace(/"/g, '""')}"`,
        p.custo_unitario !== null ? String(p.custo_unitario) : '',
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `custos_${activeAccount}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col flex-1">
      <Header title="Custos por Produto" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-3 sm:p-6">
        {/* Back link + search */}
        <div className="flex items-center justify-between mb-6">
          <Link to="/resultado" className="text-sm text-stone-500 hover:text-sky-400 transition-colors">
            ← Voltar para Resultado
          </Link>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar produto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-sky-500 w-64"
            />
            <button
              onClick={handleDownload}
              disabled={!data?.produtos?.length}
              title="Baixar CSV"
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-sm text-stone-400 hover:text-stone-200 hover:border-stone-600 disabled:opacity-40 transition-colors"
            >
              <Download size={14} />
              CSV
            </button>
          </div>
        </div>

        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-800/50 text-stone-500 border-b border-stone-800">
                <th className="text-left px-4 py-3 font-medium">Produto</th>
                <th className="text-right px-4 py-3 font-medium">Custo Unitário (R$)</th>
                <th className="text-center px-4 py-3 font-medium w-24">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-stone-500">Carregando produtos...</td>
                </tr>
              )}
              {filtered.map(p => {
                const isEditing = editingCosts[p.item_id] !== undefined
                const displayValue = isEditing
                  ? editingCosts[p.item_id]
                  : p.custo_unitario !== null
                  ? String(p.custo_unitario.toFixed(2)).replace('.', ',')
                  : ''
                const status = savingStatus[p.item_id]

                return (
                  <tr key={p.item_id} className="border-b border-stone-800/50 hover:bg-stone-800/30">
                    <td className="px-4 py-3">
                      <p className="text-stone-200 truncate max-w-lg">{p.titulo}</p>
                      <p className="text-stone-600 text-xs">{p.item_id}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="text"
                        value={displayValue}
                        placeholder="0,00"
                        onChange={e => setEditingCosts(s => ({ ...s, [p.item_id]: e.target.value }))}
                        onFocus={() => {
                          if (!isEditing) {
                            setEditingCosts(s => ({
                              ...s,
                              [p.item_id]: p.custo_unitario !== null ? String(p.custo_unitario.toFixed(2)).replace('.', ',') : ''
                            }))
                          }
                        }}
                        onBlur={() => handleBlur(p)}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                        className={`bg-stone-800 border rounded px-2 py-1 text-right text-sm text-stone-200 focus:outline-none focus:ring-1 w-28 ${
                          status === 'error'
                            ? 'border-red-500 focus:ring-red-500'
                            : 'border-stone-700 focus:ring-sky-500'
                        }`}
                      />
                    </td>
                    <td className="px-4 py-3 text-center text-xs">
                      {status === 'saving' && <span className="text-stone-500">💾 Salvando...</span>}
                      {status === 'saved' && <span className="text-emerald-400">✓ Salvo</span>}
                      {status === 'error' && <span className="text-red-400">✗ Erro</span>}
                      {!status && p.custo_unitario === null && (
                        <span className="text-sky-500/70">⚠ sem custo</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-stone-500">
                    {search ? 'Nenhum produto encontrado.' : 'Nenhum produto ativo encontrado.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </main>
    </div>
  )
}
