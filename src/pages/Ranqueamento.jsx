import { useQuery } from '@tanstack/react-query'
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
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ranqueamento'],
    queryFn: () => api.ranqueamento(),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="flex flex-col flex-1">
      <Header title="Ranqueamento" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-6">
        {isLoading && (
          <div className="text-gray-500 text-sm">Buscando posições dos seus anúncios... pode demorar alguns segundos.</div>
        )}
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
                  <th className="text-left px-4 py-3 font-medium">Keyword usada</th>
                  <th className="text-center px-4 py-3 font-medium">Posição</th>
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
                    <td className="px-4 py-3 text-gray-200">{r.titulo}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{r.keyword}</td>
                    <td className="px-4 py-3 text-center"><PositionBadge pos={r.posicao} /></td>
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
