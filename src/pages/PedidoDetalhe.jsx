import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function PedidoDetalhe() {
  const { id } = useParams()
  const { data, isLoading, error } = useQuery({
    queryKey: ['pedido', id],
    queryFn: () => api.pedido(id),
  })

  return (
    <div className="flex flex-col flex-1">
      <div className="h-14 bg-stone-900 border-b border-stone-800 flex items-center px-6 gap-3">
        <Link to="/pedidos" className="text-stone-500 hover:text-stone-300 text-sm">← Pedidos</Link>
        <span className="text-stone-700">/</span>
        <span className="text-stone-300 text-sm font-medium">Pedido #{id}</span>
      </div>
      <main className="flex-1 p-3 sm:p-6 max-w-2xl">
        {isLoading && <div className="text-stone-500 text-sm">Carregando...</div>}
        {error && <div className="text-red-400 text-sm">{error.message}</div>}
        {data && (
          <div className="space-y-4">
            <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-stone-500 mb-1">Total</p>
                <p className="text-xl font-bold text-stone-100">{formatBRL(data.total)}</p>
              </div>
              <div>
                <p className="text-xs text-stone-500 mb-1">Taxas ML</p>
                <p className="text-xl font-bold text-red-400">{formatBRL(data.taxas_ml)}</p>
              </div>
              <div>
                <p className="text-xs text-stone-500 mb-1">Status</p>
                <p className="text-stone-200 capitalize">{data.status}</p>
              </div>
              <div>
                <p className="text-xs text-stone-500 mb-1">Data</p>
                <p className="text-stone-200">{new Date(data.data).toLocaleString('pt-BR')}</p>
              </div>
            </div>
            <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
              <h2 className="text-sm font-medium text-stone-400 mb-3">Itens</h2>
              <div className="space-y-2">
                {data.itens.map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-stone-800/50 last:border-0">
                    <div>
                      <p className="text-stone-200 text-sm">{item.titulo}</p>
                      <p className="text-stone-500 text-xs">{item.ml_item_id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-stone-300 text-sm">{formatBRL(item.preco_unitario)}</p>
                      <p className="text-stone-500 text-xs">× {item.quantidade}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
