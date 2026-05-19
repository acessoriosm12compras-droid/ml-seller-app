import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'

function fmtBRL(v) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function fmtPct(v) {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

// Classifica a divergência entre custo e preço de venda
function getDivergencia(produto) {
  const { custo_unitario, preco_venda, margem_estimada } = produto

  if (!custo_unitario || custo_unitario === 0) {
    return { tipo: 'sem_custo', label: 'Sem custo', cor: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' }
  }
  if (!preco_venda || preco_venda === 0) {
    return { tipo: 'sem_preco', label: 'Sem preço', cor: 'text-zinc-500', bg: '' }
  }
  if (custo_unitario >= preco_venda) {
    return { tipo: 'critico', label: 'Custo ≥ Preço', cor: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' }
  }
  if (margem_estimada !== null && margem_estimada < 15) {
    return { tipo: 'baixo', label: `Margem baixa (${fmtPct(margem_estimada)})`, cor: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' }
  }
  return { tipo: 'ok', label: 'OK', cor: 'text-emerald-400', bg: '' }
}

export default function CustosProdutos() {
  const { activeAccount } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState('todos') // todos | problemas | sem_custo
  const [editingCosts, setEditingCosts] = useState({})
  const [savingStatus, setSavingStatus] = useState({})

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
    if (rawValue === undefined) return
    const value = parseFloat(rawValue.replace(',', '.'))
    if (isNaN(value) || value < 0) {
      setSavingStatus(s => ({ ...s, [produto.item_id]: 'error' }))
      return
    }
    if (value === produto.custo_unitario) {
      setEditingCosts(s => { const n = {...s}; delete n[produto.item_id]; return n })
      return
    }
    setSavingStatus(s => ({ ...s, [produto.item_id]: 'saving' }))
    mutation.mutate({ item_id: produto.item_id, titulo: produto.titulo, custo_unitario: value, conta_ml: activeAccount })
    setEditingCosts(s => { const n = {...s}; delete n[produto.item_id]; return n })
  }

  const todos = data?.produtos ?? []

  // Contadores para filtro
  const nProblemas = todos.filter(p => {
    const d = getDivergencia(p)
    return d.tipo === 'critico' || d.tipo === 'baixo' || d.tipo === 'sem_custo'
  }).length
  const nSemCusto = todos.filter(p => !p.custo_unitario || p.custo_unitario === 0).length

  const filtered = todos
    .filter(p => p.titulo.toLowerCase().includes(search.toLowerCase()))
    .filter(p => {
      if (filtro === 'problemas') {
        const d = getDivergencia(p)
        return d.tipo === 'critico' || d.tipo === 'baixo' || d.tipo === 'sem_custo'
      }
      if (filtro === 'sem_custo') return !p.custo_unitario || p.custo_unitario === 0
      return true
    })
    .sort((a, b) => {
      // Prioriza problemas críticos no topo
      const ordem = { critico: 0, sem_custo: 1, baixo: 2, sem_preco: 3, ok: 4 }
      return (ordem[getDivergencia(a).tipo] ?? 5) - (ordem[getDivergencia(b).tipo] ?? 5)
    })

  function handleDownload() {
    const rows = [
      ['ml_item_id', 'titulo', 'preco_ml', 'custo_unitario', 'margem_estimada_%'],
      ...todos.map(p => [
        p.item_id,
        `"${(p.titulo ?? '').replace(/"/g, '""')}"`,
        p.preco_venda ?? '',
        p.custo_unitario ?? '',
        p.margem_estimada ?? '',
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
      <main className="flex-1 p-3 sm:p-6 space-y-4">

        {/* Cabeçalho + busca */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/resultado" className="text-sm text-stone-500 hover:text-sky-400 transition-colors">
            ← Voltar para Resultado
          </Link>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar produto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-sky-500 w-52"
            />
            <button
              onClick={handleDownload}
              disabled={!todos.length}
              title="Baixar CSV"
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-sm text-stone-400 hover:text-stone-200 hover:border-stone-600 disabled:opacity-40 transition-colors"
            >
              <Download size={14} /> CSV
            </button>
          </div>
        </div>

        {/* Alertas de divergência */}
        {!isLoading && nProblemas > 0 && (
          <div className="flex flex-wrap gap-3">
            {todos.filter(p => getDivergencia(p).tipo === 'critico').length > 0 && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <span className="text-red-300 text-sm">
                  <span className="font-bold">{todos.filter(p => getDivergencia(p).tipo === 'critico').length}</span> produto(s) com custo maior ou igual ao preço de venda
                </span>
              </div>
            )}
            {nSemCusto > 0 && (
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2.5">
                <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                <span className="text-amber-300 text-sm">
                  <span className="font-bold">{nSemCusto}</span> produto(s) sem custo cadastrado — margem aparece inflada
                </span>
              </div>
            )}
          </div>
        )}

        {/* Filtros rápidos */}
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'todos',     label: `Todos (${todos.length})` },
            { id: 'problemas', label: `⚠ Divergências (${nProblemas})` },
            { id: 'sem_custo', label: `Sem custo (${nSemCusto})` },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filtro === f.id
                  ? 'bg-sky-500/15 border-sky-500/30 text-sky-400'
                  : 'bg-stone-800 border-stone-700 text-stone-500 hover:text-stone-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Tabela */}
        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-800/50 text-stone-500 border-b border-stone-800 text-xs">
                  <th className="text-left px-4 py-3 font-medium">Produto</th>
                  <th className="text-right px-4 py-3 font-medium">Preço ML</th>
                  <th className="text-right px-4 py-3 font-medium">Custo Cadastrado</th>
                  <th className="text-right px-4 py-3 font-medium">Margem Est.</th>
                  <th className="text-center px-4 py-3 font-medium w-32">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-stone-500">Carregando produtos...</td>
                  </tr>
                )}
                {filtered.map(p => {
                  const isEditing = editingCosts[p.item_id] !== undefined
                  const displayValue = isEditing
                    ? editingCosts[p.item_id]
                    : p.custo_unitario != null
                    ? String(p.custo_unitario.toFixed(2)).replace('.', ',')
                    : ''
                  const status = savingStatus[p.item_id]
                  const div = getDivergencia(p)

                  return (
                    <tr
                      key={p.item_id}
                      className={`border-b border-stone-800/50 hover:bg-stone-800/30 ${
                        div.tipo === 'critico' ? 'bg-red-500/[0.04]' :
                        div.tipo === 'sem_custo' ? 'bg-amber-500/[0.03]' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="text-stone-200 truncate max-w-xs">{p.titulo}</p>
                        <p className="text-stone-600 text-xs">{p.item_id}</p>
                      </td>

                      {/* Preço atual do anúncio no ML */}
                      <td className="px-4 py-3 text-right">
                        <span className="text-stone-300 font-medium">{fmtBRL(p.preco_venda)}</span>
                      </td>

                      {/* Custo editável */}
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
                                [p.item_id]: p.custo_unitario != null
                                  ? String(p.custo_unitario.toFixed(2)).replace('.', ',')
                                  : ''
                              }))
                            }
                          }}
                          onBlur={() => handleBlur(p)}
                          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                          className={`bg-stone-800 border rounded px-2 py-1 text-right text-sm text-stone-200 focus:outline-none focus:ring-1 w-28 ${
                            status === 'error' || div.tipo === 'critico'
                              ? 'border-red-500/50 focus:ring-red-500'
                              : div.tipo === 'sem_custo'
                              ? 'border-amber-500/40 focus:ring-amber-500'
                              : 'border-stone-700 focus:ring-sky-500'
                          }`}
                        />
                      </td>

                      {/* Margem estimada (sem taxas ML) */}
                      <td className="px-4 py-3 text-right">
                        {p.margem_estimada != null ? (
                          <span className={
                            p.margem_estimada < 0 ? 'text-red-400 font-semibold' :
                            p.margem_estimada < 15 ? 'text-orange-400' :
                            'text-emerald-400'
                          }>
                            {fmtPct(p.margem_estimada)}
                          </span>
                        ) : (
                          <span className="text-stone-600">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        {status === 'saving' && <span className="text-stone-500 text-xs">Salvando...</span>}
                        {status === 'saved' && <span className="text-emerald-400 text-xs flex items-center justify-center gap-1"><CheckCircle2 size={12} /> Salvo</span>}
                        {status === 'error' && <span className="text-red-400 text-xs">Erro</span>}
                        {!status && (
                          <span className={`text-xs font-medium ${div.cor}`}>
                            {div.tipo === 'critico' && <span className="flex items-center justify-center gap-1"><AlertCircle size={11} />{div.label}</span>}
                            {div.tipo === 'baixo' && <span className="flex items-center justify-center gap-1"><AlertTriangle size={11} />{div.label}</span>}
                            {div.tipo === 'sem_custo' && <span className="flex items-center justify-center gap-1"><AlertTriangle size={11} />{div.label}</span>}
                            {div.tipo === 'ok' && <span className="flex items-center justify-center gap-1"><CheckCircle2 size={11} />OK</span>}
                            {div.tipo === 'sem_preco' && <span className="text-zinc-600">—</span>}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                      {search ? 'Nenhum produto encontrado.' : 'Nenhum produto ativo encontrado.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-stone-600">
          * Margem Est. = (Preço ML − Custo) ÷ Preço ML, sem deduzir taxas do Mercado Livre. Serve apenas para identificar divergências.
        </p>
      </main>
    </div>
  )
}
