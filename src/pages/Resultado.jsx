import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import KpiCard from '../components/resultado/KpiCard'
import ProdutosTable from '../components/resultado/ProdutosTable'

function formatBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)
}

export default function Resultado() {
  const [searchParams] = useSearchParams()
  const periodo = searchParams.get('periodo') || '30d'
  const de = searchParams.get('de')
  const ate = searchParams.get('ate')
  const { activeAccount } = useAuth()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['resultado', periodo, de, ate, activeAccount],
    queryFn: () => api.resultado({ periodo, ...(de && { de }), ...(ate && { ate }), conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  const kpis = data?.kpis
  const semCusto = data?.top_produtos?.filter(p => p.custo_unitario === null) ?? []

  return (
    <div className="flex flex-col flex-1">
      <Header title="Resultado" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-6 space-y-6">
        {error && <div className="text-red-400 text-sm">{error.message}</div>}

        {/* Alert: products without cost */}
        {semCusto.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-amber-400 text-sm font-medium mb-1">
                {semCusto.length} {semCusto.length === 1 ? 'produto sem' : 'produtos sem'} custo cadastrado
              </p>
              <p className="text-gray-400 text-xs">
                {semCusto.slice(0, 3).map(p => p.titulo).join(', ')}
                {semCusto.length > 3 && ` e mais ${semCusto.length - 3}...`}
              </p>
            </div>
            <Link to="/custos-produtos" className="text-amber-400 text-sm hover:text-amber-300 whitespace-nowrap">
              ⚙️ Cadastrar custos →
            </Link>
          </div>
        )}

        {/* Block 1: 8 KPI cards */}
        <div>
          <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Faturamento & Vendas</h2>
          <div className="grid grid-cols-4 gap-4">
            <KpiCard label="Faturamento" value={kpis ? formatBRL(kpis.faturamento) : '...'} />
            <KpiCard label="Líq. do Marketplace" value={kpis ? formatBRL(kpis.liquido_marketplace) : '...'} />
            <KpiCard
              label="Lucro Bruto"
              value={kpis ? formatBRL(kpis.lucro_bruto) : '...'}
              color={kpis && kpis.lucro_bruto >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
            <KpiCard
              label="Margem"
              value={kpis ? `${kpis.margem.toFixed(2)}%` : '...'}
              color={kpis && kpis.margem >= 15 ? 'text-emerald-400' : 'text-amber-400'}
            />
            <KpiCard label="Nº de Vendas" value={kpis ? kpis.n_vendas.toLocaleString('pt-BR') : '...'} />
            <KpiCard label="Unidades Vendidas" value={kpis ? kpis.unidades.toLocaleString('pt-BR') : '...'} />
            <KpiCard label="Ticket Médio" value={kpis ? formatBRL(kpis.ticket_medio) : '...'} />
            <KpiCard
              label="ROI"
              value={kpis ? `${kpis.roi.toFixed(2)}%` : '...'}
              color={kpis && kpis.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
          </div>
        </div>

        {/* Block 2: 4 ADS cards */}
        <div>
          <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-3">ADS & Resultado pós Publicidade</h2>
          <div className="grid grid-cols-4 gap-4">
            <KpiCard label="Valor em ADS" value={kpis ? formatBRL(kpis.valor_ads) : '...'} />
            <KpiCard label="TACOS" value={kpis ? `${kpis.tacos.toFixed(2)}%` : '...'} />
            <KpiCard
              label="Lucro Bruto pós ADS"
              value={kpis ? formatBRL(kpis.lucro_pos_ads) : '...'}
              color={kpis && kpis.lucro_pos_ads >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
            <KpiCard
              label="MPA"
              value={kpis ? `${kpis.mpa.toFixed(2)}%` : '...'}
              color={kpis && kpis.mpa >= 15 ? 'text-emerald-400' : 'text-amber-400'}
            />
          </div>
        </div>

        {/* Top 15 products table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs text-gray-500 uppercase tracking-wider">Top 15 Produtos</h2>
            <Link to="/custos-produtos" className="text-xs text-gray-500 hover:text-amber-400 transition-colors">
              ⚙️ Custos por produto
            </Link>
          </div>
          {data?.top_produtos && <ProdutosTable produtos={data.top_produtos} />}
        </div>
      </main>
    </div>
  )
}
