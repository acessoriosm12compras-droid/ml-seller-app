import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'

function formatBRL(v) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function UrgenciaBadge({ urgencia }) {
  const map = {
    critico: 'bg-red-500/20 text-red-400 border border-red-500/30',
    alto:    'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    medio:   'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    baixo:   'bg-sky-500/20 text-sky-400 border border-sky-500/30',
    ok:      'bg-green-500/20 text-green-400 border border-green-500/30',
  }
  const labels = {
    critico: '🔴 Sem estoque',
    alto:    '🟠 Crítico',
    medio:   '🟡 Atenção',
    baixo:   '🔵 Repor',
    ok:      '🟢 OK',
  }
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${map[urgencia] || ''}`}>
      {labels[urgencia] || urgencia}
    </span>
  )
}

function EditableCell({ value, onSave, prefix = '', suffix = '', type = 'number', min = 0 }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))

  function handleKeyDown(e) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  function commit() {
    const parsed = type === 'number' ? parseFloat(draft) : parseInt(draft, 10)
    if (!isNaN(parsed) && parsed >= min) onSave(parsed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        type="number"
        min={min}
        step={type === 'number' ? '0.01' : '1'}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        autoFocus
        className="w-24 bg-stone-700 border border-sky-500 rounded px-2 py-0.5 text-sm text-stone-100 focus:outline-none"
      />
    )
  }

  return (
    <button
      onClick={() => { setDraft(String(value ?? '')); setEditing(true) }}
      className="text-sm text-stone-200 hover:text-sky-400 hover:underline transition-colors"
      title="Clique para editar"
    >
      {prefix}{value != null ? (type === 'number' ? value.toFixed(2) : value) : '—'}{suffix}
    </button>
  )
}

export default function ReposicaoSemanal() {
  const { activeAccount } = useAuth()
  const queryClient = useQueryClient()
  const [filtro, setFiltro] = useState('todos') // todos | repor | ok

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reposicao', activeAccount],
    queryFn: () => api.reposicao.semanal({ conta_ml: activeAccount }),
    enabled: !!activeAccount,
    staleTime: 5 * 60 * 1000,
  })

  const mutation = useMutation({
    mutationFn: (payload) => api.reposicao.atualizarEstoqueMinimo({ conta_ml: activeAccount, ...payload }),
    onSuccess: () => queryClient.invalidateQueries(['reposicao', activeAccount]),
  })

  const produtos = data?.produtos || []
  const resumo = data?.resumo || {}

  const produtosFiltrados = produtos.filter(p => {
    if (filtro === 'repor') return p.quantidade_repor > 0
    if (filtro === 'ok') return p.quantidade_repor === 0
    return true
  })

  const totalRepor = produtosFiltrados.reduce((s, p) => s + (p.quantidade_repor > 0 ? p.valor_repor : 0), 0)

  return (
    <div className="flex flex-col flex-1">
      <Header title="Planejador de Reposição" onRefresh={refetch} isLoading={isLoading} />

      <main className="flex-1 p-3 sm:p-6 space-y-6">

        {/* Resumo financeiro */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-stone-800/60 border border-stone-700 rounded-xl p-4">
            <p className="text-xs text-stone-400 mb-1">Total a investir</p>
            <p className="text-xl font-bold text-orange-400">{formatBRL(resumo.total_investimento)}</p>
            <p className="text-xs text-stone-500 mt-1">base: {resumo.periodo_base || '4 semanas'}</p>
          </div>

          <div className="bg-stone-800/60 border border-stone-700 rounded-xl p-4">
            <p className="text-xs text-stone-400 mb-1">Saldo disponível ML</p>
            <p className={`text-xl font-bold ${resumo.saldo_ml != null ? 'text-sky-400' : 'text-stone-500'}`}>
              {resumo.saldo_ml != null ? formatBRL(resumo.saldo_ml) : 'Indisponível'}
            </p>
            <p className="text-xs text-stone-500 mt-1">conta: {activeAccount}</p>
          </div>

          <div className="bg-stone-800/60 border border-stone-700 rounded-xl p-4">
            <p className="text-xs text-stone-400 mb-1">Capital livre</p>
            {resumo.capital_livre != null ? (
              <p className={`text-xl font-bold ${resumo.capital_livre >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatBRL(resumo.capital_livre)}
              </p>
            ) : (
              <p className="text-xl font-bold text-stone-500">—</p>
            )}
            <p className="text-xs text-stone-500 mt-1">após reposição</p>
          </div>

          <div className="bg-stone-800/60 border border-stone-700 rounded-xl p-4">
            <p className="text-xs text-stone-400 mb-1">Produtos críticos</p>
            <p className={`text-xl font-bold ${resumo.produtos_criticos > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {resumo.produtos_criticos ?? 0}
            </p>
            <p className="text-xs text-stone-500 mt-1">de {resumo.total_produtos ?? 0} com custo</p>
          </div>
        </div>

        {/* Info sobre edição */}
        <div className="flex items-start gap-2 bg-sky-500/5 border border-sky-500/20 rounded-lg px-4 py-3 text-sm text-sky-300">
          <span className="text-base leading-none mt-0.5">💡</span>
          <span>
            Clique no <strong>custo unitário</strong> ou <strong>estoque mínimo</strong> de qualquer produto para editar inline.
            Meta de estoque = maior entre o mínimo configurado e 2 semanas de vendas.
          </span>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2">
          {[
            { key: 'todos', label: `Todos (${produtos.length})` },
            { key: 'repor',  label: `Repor (${produtos.filter(p => p.quantidade_repor > 0).length})` },
            { key: 'ok',     label: `Em dia (${produtos.filter(p => p.quantidade_repor === 0).length})` },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                filtro === f.key
                  ? 'bg-sky-600 border-sky-500 text-white'
                  : 'bg-stone-800 border-stone-700 text-stone-400 hover:text-stone-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Tabela */}
        {isLoading ? (
          <div className="text-center py-16 text-stone-500">Carregando plano de reposição...</div>
        ) : error ? (
          <div className="text-center py-16 text-red-400">{error.message}</div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="text-center py-16 text-stone-500">
            {produtos.length === 0
              ? 'Nenhum produto com custo cadastrado. Cadastre os custos na página "Custos".'
              : 'Nenhum produto neste filtro.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-700 text-left text-xs text-stone-400 uppercase tracking-wide">
                  <th className="py-3 pr-4">Produto</th>
                  <th className="py-3 pr-4 text-center">Status</th>
                  <th className="py-3 pr-4 text-right">Venda/sem</th>
                  <th className="py-3 pr-4 text-right">Estoque atual</th>
                  <th className="py-3 pr-4 text-right">Estoque mínimo</th>
                  <th className="py-3 pr-4 text-right">Repor (un.)</th>
                  <th className="py-3 pr-4 text-right">Custo unit.</th>
                  <th className="py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800">
                {produtosFiltrados.map(p => (
                  <tr key={p.item_id} className="hover:bg-stone-800/40 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-stone-200 max-w-xs truncate" title={p.titulo}>
                        {p.titulo}
                      </div>
                      {p.sku && (
                        <div className="text-xs text-stone-500">SKU: {p.sku}</div>
                      )}
                    </td>

                    <td className="py-3 pr-4 text-center">
                      <UrgenciaBadge urgencia={p.urgencia} />
                      {p.cobertura_semanas != null && (
                        <div className="text-xs text-stone-500 mt-1">{p.cobertura_semanas}sem cobertura</div>
                      )}
                    </td>

                    <td className="py-3 pr-4 text-right text-stone-300">
                      {p.media_semanal > 0 ? p.media_semanal.toFixed(1) : '—'}
                    </td>

                    <td className="py-3 pr-4 text-right">
                      <span className={p.estoque_atual === 0 ? 'text-red-400 font-bold' : 'text-stone-300'}>
                        {p.estoque_atual}
                      </span>
                    </td>

                    <td className="py-3 pr-4 text-right">
                      <EditableCell
                        value={p.estoque_minimo}
                        type="integer"
                        min={0}
                        onSave={(val) => mutation.mutate({
                          item_id: p.item_id,
                          estoque_minimo: val,
                        })}
                      />
                    </td>

                    <td className="py-3 pr-4 text-right">
                      <span className={p.quantidade_repor > 0 ? 'text-orange-400 font-bold' : 'text-stone-500'}>
                        {p.quantidade_repor > 0 ? `+${p.quantidade_repor}` : '—'}
                      </span>
                    </td>

                    <td className="py-3 pr-4 text-right">
                      <EditableCell
                        value={p.custo_unitario}
                        type="number"
                        min={0}
                        prefix="R$ "
                        onSave={(val) => mutation.mutate({
                          item_id: p.item_id,
                          custo_unitario: val,
                        })}
                      />
                    </td>

                    <td className="py-3 text-right font-medium">
                      {p.quantidade_repor > 0 ? (
                        <span className="text-orange-300">{formatBRL(p.valor_repor)}</span>
                      ) : (
                        <span className="text-stone-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Rodapé com total */}
              {totalRepor > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-stone-600">
                    <td colSpan={7} className="py-3 pr-4 text-right text-sm font-medium text-stone-300">
                      Total selecionado ({filtro === 'todos' ? 'todos' : filtro}):
                    </td>
                    <td className="py-3 text-right font-bold text-orange-400 text-base">
                      {formatBRL(totalRepor)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
