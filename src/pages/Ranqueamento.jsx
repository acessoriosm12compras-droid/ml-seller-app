import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'

function PositionBadge({ pos }) {
  if (!pos) return <span className="text-gray-500 text-xs">não encontrado</span>
  const color = pos <= 5 ? 'text-emerald-400 bg-emerald-500/10' :
                pos <= 20 ? 'text-amber-400 bg-amber-500/10' :
                'text-red-400 bg-red-500/10'
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${color}`}>
      #{pos}
    </span>
  )
}

export default function Ranqueamento() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ ml_item_id: '', keyword: '' })
  const [formError, setFormError] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ranqueamento'],
    queryFn: () => api.ranqueamento(),
  })

  const addMutation = useMutation({
    mutationFn: ({ ml_item_id, keyword }) => api.adicionarKeyword(ml_item_id, keyword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ranqueamento'] })
      setForm({ ml_item_id: '', keyword: '' })
      setFormError('')
    },
    onError: (err) => setFormError(err.message),
  })

  function handleAdd(e) {
    e.preventDefault()
    if (!form.ml_item_id.trim() || !form.keyword.trim()) {
      setFormError('Preencha todos os campos')
      return
    }
    addMutation.mutate(form)
  }

  return (
    <div className="flex flex-col flex-1">
      <Header title="Ranqueamento" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-6 space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Monitorar novo anúncio</h2>
          <form onSubmit={handleAdd} className="flex gap-3 flex-wrap">
            <input
              placeholder="ID do anúncio (ex: MLB123456)"
              value={form.ml_item_id}
              onChange={e => setForm(f => ({ ...f, ml_item_id: e.target.value }))}
              className="flex-1 min-w-48 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              placeholder="Keyword de busca"
              value={form.keyword}
              onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
              className="flex-1 min-w-48 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              disabled={addMutation.isPending}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-gray-950 text-sm font-semibold rounded-lg transition-colors"
            >
              {addMutation.isPending ? 'Buscando...' : 'Monitorar'}
            </button>
          </form>
          {formError && <p className="text-red-400 text-xs mt-2">{formError}</p>}
        </div>

        {isLoading && <div className="text-gray-500 text-sm">Carregando...</div>}
        {error && <div className="text-red-400 text-sm">{error.message}</div>}
        {data && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/50 text-gray-500 border-b border-gray-800">
                  <th className="text-left px-4 py-3 font-medium">ID do Anúncio</th>
                  <th className="text-left px-4 py-3 font-medium">Keyword</th>
                  <th className="text-center px-4 py-3 font-medium">Posição</th>
                  <th className="text-right px-4 py-3 font-medium">Verificado em</th>
                </tr>
              </thead>
              <tbody>
                {data.ranqueamento.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-600 text-sm">
                      Nenhum anúncio monitorado ainda.
                    </td>
                  </tr>
                )}
                {data.ranqueamento.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">{r.ml_item_id}</td>
                    <td className="px-4 py-3 text-gray-200">{r.keyword}</td>
                    <td className="px-4 py-3 text-center"><PositionBadge pos={r.posicao} /></td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      {new Date(r.verificado_em).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
