import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import EditAccountBanner from '../components/EditAccountBanner'
import LojasIndisponiveisAviso from '../components/LojasIndisponiveisAviso'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function EditModal({ anuncio, onClose, onSave, isSaving }) {
  const [form, setForm] = useState({
    sku_interno: anuncio?.sku_interno || '',
    custo_unitario: anuncio?.custo_unitario ?? '',
  })

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      sku_interno: form.sku_interno.trim() || null,
      custo_unitario: form.custo_unitario !== '' ? parseFloat(form.custo_unitario) : null,
      titulo: anuncio?.titulo,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-stone-100">Associar Anúncio</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 text-xl leading-none">×</button>
        </div>

        <p className="text-xs text-stone-500 mb-4 truncate" title={anuncio?.titulo}>{anuncio?.titulo}</p>
        <p className="text-xs text-stone-600 font-mono mb-4">{anuncio?.ml_item_id}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-stone-500 mb-1 block">SKU Interno</label>
            <input
              type="text"
              value={form.sku_interno}
              onChange={e => setForm(f => ({ ...f, sku_interno: e.target.value }))}
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="Ex: PROD-001"
            />
          </div>
          <div>
            <label className="text-xs text-stone-500 mb-1 block">Custo Unitário (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.custo_unitario}
              onChange={e => setForm(f => ({ ...f, custo_unitario: e.target.value }))}
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="0,00"
            />
          </div>

          <div className="flex gap-3 pt-1">
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
              {isSaving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Gerenciamento() {
  const { activeAccount, editAccount } = useAuth()
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)
  const [semSku, setSemSku] = useState(false)
  const [busca, setBusca] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['gerenciamento-anuncios', activeAccount, semSku],
    queryFn: () => api.gerenciamento.anuncios({ conta_ml: activeAccount, sem_sku: semSku ? '1' : '0' }),
    enabled: !!activeAccount,
  })

  const saveMut = useMutation({
    mutationFn: ({ itemId, payload }) => api.gerenciamento.atualizarAnuncio(itemId, { ...payload, conta_ml: editAccount }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gerenciamento-anuncios'] }); setModal(null) },
  })

  const anuncios = (data?.anuncios || []).filter(a =>
    !busca || a.titulo?.toLowerCase().includes(busca.toLowerCase()) || a.ml_item_id?.includes(busca)
  )

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Gerenciamento" onRefresh={refetch} isLoading={isLoading} showPeriod={false} />

      {modal && (
        <EditModal
          anuncio={modal}
          onClose={() => setModal(null)}
          onSave={payload => saveMut.mutate({ itemId: modal.ml_item_id, payload })}
          isSaving={saveMut.isPending}
        />
      )}

      <main className="flex-1 p-3 sm:p-6 space-y-5 overflow-auto">
        <EditAccountBanner />
        <LojasIndisponiveisAviso lojas={data?.lojas_indisponiveis} />
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            {error.message}
          </div>
        )}

        {/* Summary */}
        {data && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-sky-500 rounded-xl p-4">
              <p className="text-xs text-stone-500">Total Anúncios</p>
              <p className="text-xl font-bold text-sky-400">{data.total}</p>
            </div>
            <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-emerald-500 rounded-xl p-4">
              <p className="text-xs text-stone-500">Com Custo Cadastrado</p>
              <p className="text-xl font-bold text-emerald-400">{data.associados}</p>
            </div>
            <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-red-500 rounded-xl p-4">
              <p className="text-xs text-stone-500">Sem Custo</p>
              <p className="text-xl font-bold text-red-400">{data.sem_custo}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por título ou ID…"
            className="flex-1 max-w-xs bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={semSku}
              onChange={e => setSemSku(e.target.checked)}
              className="w-4 h-4 accent-sky-500"
            />
            <span className="text-xs text-stone-400">Apenas sem custo</span>
          </label>
        </div>

        {/* Table */}
        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="px-4 py-3 text-left text-stone-500">Anúncio</th>
                  <th className="px-4 py-3 text-left text-stone-500">SKU Interno</th>
                  <th className="px-4 py-3 text-right text-stone-500">Custo Unit.</th>
                  <th className="px-4 py-3 text-center text-stone-500">Status</th>
                  <th className="px-4 py-3 text-center text-stone-500">SUBS. ML</th>
                  <th className="px-4 py-3 text-center text-stone-500">Ação</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-stone-600">Carregando anúncios…</td></tr>
                )}
                {!isLoading && anuncios.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-stone-600">Nenhum anúncio encontrado.</td></tr>
                )}
                {anuncios.map(a => (
                  <tr key={a.ml_item_id} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                    <td className="px-4 py-3 text-stone-300 max-w-[240px]">
                      <div className="truncate" title={a.titulo}>{a.titulo}</div>
                      <div className="text-stone-600 font-mono text-[10px]">{a.ml_item_id}</div>
                    </td>
                    <td className="px-4 py-3 text-stone-400 font-mono">{a.sku_interno || <span className="text-stone-600">—</span>}</td>
                    <td className="px-4 py-3 text-right text-stone-300">{a.custo_unitario !== null ? formatBRL(a.custo_unitario) : <span className="text-stone-600">—</span>}</td>
                    <td className="px-4 py-3 text-center">
                      {a.associado ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400">✓ Associado</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/10 text-red-400">⚠ Sem custo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.rebate_meli_percent !== null && a.rebate_meli_percent !== undefined ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-sky-500/10 text-sky-400">
                          ML cobre {a.rebate_meli_percent}%
                        </span>
                      ) : (
                        <span className="text-stone-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setModal(a)}
                        className="px-3 py-1 rounded-lg text-xs border border-sky-500/30 text-sky-400 hover:bg-sky-500/10 transition-colors"
                      >
                        {a.associado ? 'Editar' : 'Associar'}
                      </button>
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
