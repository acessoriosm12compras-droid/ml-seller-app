import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

const CATEGORIAS_DESPESA = ['Logística', 'Embalagem', 'Marketing', 'Software', 'Funcionários', 'Aluguel', 'Contabilidade', 'Imposto', 'Outros']
const CATEGORIAS_RECEITA = ['Venda direta', 'Devolução', 'Bônus', 'Outros']

function MovModal({ item, onClose, onSave, isSaving }) {
  const isEditing = !!item?.id
  const [form, setForm] = useState({
    tipo: item?.tipo || 'despesa',
    categoria: item?.categoria || '',
    empresa: item?.empresa || '',
    valor: item?.valor ?? '',
    data: item?.data || new Date().toISOString().slice(0, 10),
    descricao: item?.descricao || '',
    recorrente: false,
    n_recorrencias: 1,
  })

  const categorias = form.tipo === 'despesa' ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      ...form,
      valor: parseFloat(form.valor),
      n_recorrencias: form.recorrente ? parseInt(form.n_recorrencias) : 1,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-stone-100">
            {isEditing ? 'Editar Movimentação' : 'Nova Movimentação'}
          </h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo */}
          <div className="flex gap-3">
            {['despesa', 'receita'].map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setForm(f => ({ ...f, tipo: t, categoria: '' }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  form.tipo === t
                    ? t === 'despesa' ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-stone-800 text-stone-400 border border-stone-700 hover:border-stone-600'
                }`}
              >
                {t === 'despesa' ? '↓ Despesa' : '↑ Receita'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Categoria</label>
              <select
                value={form.categoria}
                onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                required
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">Selecionar…</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.valor}
                onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                required
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Empresa / Fornecedor</label>
              <input
                type="text"
                value={form.empresa}
                onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="Ex: Correios"
              />
            </div>
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Data</label>
              <input
                type="date"
                value={form.data}
                onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                required
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-stone-500 mb-1 block">Descrição</label>
            <input
              type="text"
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="Opcional"
            />
          </div>

          {!isEditing && (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.recorrente}
                  onChange={e => setForm(f => ({ ...f, recorrente: e.target.checked }))}
                  className="w-4 h-4 accent-sky-500"
                />
                <span className="text-xs text-stone-400">Lançamento recorrente</span>
              </label>
              {form.recorrente && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={form.n_recorrencias}
                    onChange={e => setForm(f => ({ ...f, n_recorrencias: e.target.value }))}
                    className="w-16 bg-stone-800 border border-stone-700 rounded-lg px-2 py-1 text-xs text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <span className="text-xs text-stone-500">meses</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg text-sm text-stone-400 bg-stone-800 border border-stone-700 hover:border-stone-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2 rounded-lg text-sm font-medium text-black bg-sky-400 hover:bg-sky-300 disabled:opacity-50 transition-colors"
            >
              {isSaving ? 'Salvando…' : isEditing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Movimentacoes() {
  const { activeAccount } = useAuth()
  const qc = useQueryClient()
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))
  const [modal, setModal] = useState(null) // null | { item?: obj }
  const [deletingId, setDeletingId] = useState(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['movimentacoes', mes, activeAccount],
    queryFn: () => api.movimentacoes.list({ mes, conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  const saveMut = useMutation({
    mutationFn: (payload) =>
      modal?.item?.id
        ? api.movimentacoes.update(modal.item.id, payload)
        : api.movimentacoes.create({ ...payload, conta_ml: activeAccount }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movimentacoes'] }); setModal(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.movimentacoes.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movimentacoes'] }); setDeletingId(null) },
  })

  const items = data?.movimentacoes || []
  const despesas = items.filter(i => i.tipo === 'despesa')
  const receitas = items.filter(i => i.tipo === 'receita')
  const totalDespesas = despesas.reduce((s, i) => s + parseFloat(i.valor), 0)
  const totalReceitas = receitas.reduce((s, i) => s + parseFloat(i.valor), 0)
  const saldo = totalReceitas - totalDespesas

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Movimentações" onRefresh={refetch} isLoading={isLoading} />

      {modal !== null && (
        <MovModal
          item={modal.item}
          onClose={() => setModal(null)}
          onSave={payload => saveMut.mutate(payload)}
          isSaving={saveMut.isPending}
        />
      )}

      <main className="flex-1 p-3 sm:p-6 space-y-5 overflow-auto">
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            {error.message}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-4">
          <input
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <button
            onClick={() => setModal({ item: undefined })}
            className="px-4 py-2 rounded-lg text-sm font-medium text-black bg-sky-400 hover:bg-sky-300 transition-colors"
          >
            + Nova movimentação
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-red-500 rounded-xl p-4">
            <p className="text-xs text-stone-500">Total Despesas</p>
            <p className="text-xl font-bold text-red-400">{formatBRL(totalDespesas)}</p>
          </div>
          <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-emerald-500 rounded-xl p-4">
            <p className="text-xs text-stone-500">Total Receitas</p>
            <p className="text-xl font-bold text-emerald-400">{formatBRL(totalReceitas)}</p>
          </div>
          <div className={`bg-stone-900 border border-stone-800 border-l-4 ${saldo >= 0 ? 'border-l-blue-500' : 'border-l-red-500'} rounded-xl p-4`}>
            <p className="text-xs text-stone-500">Saldo</p>
            <p className={`text-xl font-bold ${saldo >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{formatBRL(saldo)}</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="px-4 py-3 text-left text-stone-500">Tipo</th>
                  <th className="px-4 py-3 text-left text-stone-500">Categoria</th>
                  <th className="px-4 py-3 text-left text-stone-500">Empresa</th>
                  <th className="px-4 py-3 text-left text-stone-500">Descrição</th>
                  <th className="px-4 py-3 text-right text-stone-500">Valor</th>
                  <th className="px-4 py-3 text-right text-stone-500">Data</th>
                  <th className="px-4 py-3 text-center text-stone-500">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-stone-600">Carregando…</td></tr>
                )}
                {!isLoading && items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-stone-600">
                      Nenhuma movimentação em {mes}.
                    </td>
                  </tr>
                )}
                {items.map(item => (
                  <tr key={item.id} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.tipo === 'despesa' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {item.tipo === 'despesa' ? '↓' : '↑'} {item.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-300">{item.categoria}</td>
                    <td className="px-4 py-3 text-stone-400">{item.empresa || '—'}</td>
                    <td className="px-4 py-3 text-stone-400 max-w-[180px] truncate">{item.descricao || '—'}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${item.tipo === 'despesa' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {formatBRL(item.valor)}
                    </td>
                    <td className="px-4 py-3 text-right text-stone-400">
                      {new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setModal({ item })}
                          className="text-stone-500 hover:text-sky-400 transition-colors"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        {deletingId === item.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => deleteMut.mutate(item.id)}
                              disabled={deleteMut.isPending}
                              className="text-red-400 hover:text-red-300 text-xs"
                            >
                              Confirmar
                            </button>
                            <button onClick={() => setDeletingId(null)} className="text-stone-500 text-xs">Cancelar</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingId(item.id)}
                            className="text-stone-500 hover:text-red-400 transition-colors"
                            title="Excluir"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
