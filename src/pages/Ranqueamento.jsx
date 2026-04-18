import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'

function PositionBadge({ pos }) {
  if (pos == null) return <span className="text-gray-600 text-xs">não verificado</span>
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
  const [updating, setUpdating] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ranqueamento'],
    queryFn: () => api.ranqueamento(),
  })

  async function handleAtualizar() {
    setUpdating(true)
    try {
      const result = await api.atualizarRanqueamento()
      queryClient.setQueryData(['ranqueamento'], result)
    } catch (e) {
      alert('Erro ao atualizar posições: ' + e.message)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="flex flex-col flex-1">
      <Header title="Ranqueamento" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-6 space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-gray-500 text-sm">
            Posições salvas do último check. Clique em "Atualizar Posições" para verificar agora.
          </p>
          <button
            onClick={handleAtualizar}
            disabled={updating}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-gray-950 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            {updating ? 'Verificando...' : 'Atualizar Posições'}
          </button>
        </div>

        {isLoading && <div className="text-gray-500 text-sm">Carregando anúncios...</div>}
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            {error.message}
          </div>
        )}
        {data && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/50 text-gray-500 border-b border-gray-800">
                  <th className="text-left px-4 py-3 font-medium">Anúncio</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Keyword</th>
                  <th className="text-center px-4 py-3 font-medium">Posição</th>
                  <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Verificado em</th>
                </tr>
              </thead>
              <tbody>
                {data.ranqueamento.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-600 text-sm">
                      Nenhum anúncio ativo encontrado.
                    </td>
                  </tr>
                )}
                {data.ranqueamento.map((r) => (
                  <tr key={r.ml_item_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-200 max-w-xs truncate">{r.titulo}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">{r.keyword}</td>
                    <td className="px-4 py-3 text-center"><PositionBadge pos={r.posicao} /></td>
                    <td className="px-4 py-3 text-right text-gray-600 text-xs hidden md:table-cell">
                      {r.verificado_em ? new Date(r.verificado_em).toLocaleString('pt-BR') : '—'}
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
