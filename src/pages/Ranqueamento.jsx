import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'

export default function Performance() {
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
      alert('Erro ao atualizar: ' + e.message)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="flex flex-col flex-1">
      <Header title="Performance dos Anúncios" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-6 space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-gray-500 text-sm">Visitas nos últimos 30 dias por anúncio.</p>
          <button
            onClick={handleAtualizar}
            disabled={updating}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-gray-950 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            {updating ? 'Atualizando...' : 'Atualizar Dados'}
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
                  <th className="text-center px-4 py-3 font-medium">Visitas (30d)</th>
                  <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Atualizado em</th>
                </tr>
              </thead>
              <tbody>
                {data.ranqueamento.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-gray-600 text-sm">
                      Nenhum anúncio ativo encontrado.
                    </td>
                  </tr>
                )}
                {data.ranqueamento.map((r) => (
                  <tr key={r.ml_item_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex items-center gap-2">
                        <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${r.catalogo ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'}`}>
                          {r.catalogo ? 'Catálogo' : 'Normal'}
                        </span>
                        <span className="text-gray-200 truncate">{r.titulo}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.visitas_30d != null
                        ? <span className="text-amber-400 font-semibold">{r.visitas_30d.toLocaleString('pt-BR')}</span>
                        : <span className="text-gray-600 text-xs">não verificado</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 text-xs hidden md:table-cell">
                      {r.atualizado_em ? new Date(r.atualizado_em).toLocaleString('pt-BR') : '—'}
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
