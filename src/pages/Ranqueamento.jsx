import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'

const ML_SEARCH = 'https://api.mercadolibre.com/sites/MLB/search'

async function buscarPosicao(searchId, keyword, maxPaginas = 5) {
  const porPagina = 50
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const offset = pagina * porPagina
    try {
      const resp = await fetch(
        `${ML_SEARCH}?q=${encodeURIComponent(keyword)}&limit=${porPagina}&offset=${offset}`
      )
      if (!resp.ok) break
      const data = await resp.json()
      const results = data.results || []
      if (!results.length) break
      for (let i = 0; i < results.length; i++) {
        if (results[i].id === searchId || results[i].catalog_product_id === searchId) {
          return { posicao: offset + i + 1, pagina: pagina + 1 }
        }
      }
    } catch {
      break
    }
  }
  return { posicao: null, pagina: null }
}

function PositionBadge({ pos, pagina }) {
  if (pos === undefined) return <span className="text-stone-600 text-xs">—</span>
  if (pos === 'buscando') return <span className="text-stone-500 text-xs animate-pulse">buscando...</span>
  if (!pos) return <span className="text-stone-500 text-xs">não encontrado</span>
  const color = pos <= 5 ? 'text-emerald-400 bg-emerald-500/10' :
                pos <= 20 ? 'text-sky-400 bg-sky-500/10' :
                'text-red-400 bg-red-500/10'
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${color}`}>#{pos}</span>
      {pagina && <span className="text-stone-500 text-xs">pág. {pagina}</span>}
    </span>
  )
}

export default function Ranqueamento() {
  const [posicoes, setPosicoes] = useState({})
  const [verificando, setVerificando] = useState(false)
  const { activeAccount } = useAuth()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ranqueamento', activeAccount],
    queryFn: () => api.ranqueamento({ conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  const verificarPosicoes = useCallback(async () => {
    if (!data?.ranqueamento) return
    setVerificando(true)
    const inicial = {}
    data.ranqueamento.forEach(a => { inicial[a.ml_item_id] = 'buscando' })
    setPosicoes(inicial)

    for (const anuncio of data.ranqueamento) {
      const keyword = anuncio.titulo.split(' ').slice(0, 4).join(' ')
      const resultado = await buscarPosicao(anuncio.search_id, keyword)
      setPosicoes(prev => ({ ...prev, [anuncio.ml_item_id]: resultado }))
    }
    setVerificando(false)
  }, [data])

  return (
    <div className="flex flex-col flex-1">
      <Header title="Ranqueamento" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-3 sm:p-6 space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-stone-500 text-sm">
            Clique em "Verificar Posições" para buscar a posição de cada anúncio no ML.
          </p>
          <button
            onClick={verificarPosicoes}
            disabled={verificando || isLoading}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-stone-950 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            {verificando ? 'Verificando...' : 'Verificar Posições'}
          </button>
        </div>

        {isLoading && <div className="text-stone-500 text-sm">Carregando anúncios...</div>}
        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            {error.message}
          </div>
        )}
        {data && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-stone-800/50 text-stone-500 border-b border-stone-800">
                  <th className="text-left px-4 py-3 font-medium">Anúncio</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Keyword</th>
                  <th className="text-center px-4 py-3 font-medium">Posição</th>
                </tr>
              </thead>
              <tbody>
                {data.ranqueamento.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-stone-600 text-sm">
                      Nenhum anúncio ativo encontrado.
                    </td>
                  </tr>
                )}
                {data.ranqueamento.map((r) => {
                  const pos = posicoes[r.ml_item_id]
                  const keyword = r.titulo.split(' ').slice(0, 4).join(' ')
                  return (
                    <tr key={r.ml_item_id} className="border-b border-stone-800/50 hover:bg-stone-800/30">
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex items-center gap-2">
                          <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${r.catalogo ? 'bg-blue-500/20 text-blue-400' : 'bg-stone-700 text-stone-400'}`}>
                            {r.catalogo ? 'Catálogo' : 'Normal'}
                          </span>
                          <span className="text-stone-200 truncate">{r.titulo}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-500 text-xs hidden md:table-cell">{keyword}</td>
                      <td className="px-4 py-3 text-center">
                        <PositionBadge
                          pos={pos === 'buscando' ? 'buscando' : pos?.posicao}
                          pagina={pos?.pagina}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
