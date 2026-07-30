import { useQuery } from '@tanstack/react-query'
import { Trophy, AlertTriangle, Zap } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import LojasIndisponiveisAviso from '../LojasIndisponiveisAviso'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function DestaqueCard({ icon: Icon, iconColor, titulo, item, textoVazio, renderMetrica }) {
  return (
    <div className="rounded-2xl p-4 bg-white border border-stone-200 flex flex-col gap-2 flex-1 min-w-[220px]">
      <div className="flex items-center gap-2">
        <Icon size={16} className={iconColor} />
        <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{titulo}</h4>
      </div>
      {item ? (
        <>
          <p className="text-sm font-semibold text-stone-700 line-clamp-2">
            {item.titulo}
            {item.sku && <span className="text-stone-400 font-normal"> · {item.sku}</span>}
          </p>
          <p className="text-sm">{renderMetrica(item)}</p>
        </>
      ) : (
        <p className="text-sm text-stone-400">{textoVazio}</p>
      )}
    </div>
  )
}

export default function ResumoDiaCard() {
  const { activeAccount } = useAuth()

  const { data, isLoading, error } = useQuery({
    queryKey: ['resumo-dia', activeAccount],
    queryFn: () => api.resumoDia.get({ conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  if (isLoading) return null

  if (error) {
    return (
      <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">
        {error.status === 401
          ? 'Sessão expirada — faça login novamente.'
          : `Não foi possível carregar o resumo do dia: ${error.message || 'erro desconhecido'}`}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex flex-col gap-4">
      <LojasIndisponiveisAviso lojas={data.lojas_indisponiveis} />

      <div className="flex flex-wrap gap-4">
        <DestaqueCard
          icon={Trophy}
          iconColor="text-green-500"
          titulo="Melhor performance"
          item={data.melhor_performance}
          textoVazio="Nenhum produto subiu em faturamento hoje."
          renderMetrica={(i) => <span className="text-green-500 font-semibold">+{formatBRL(i.variacao_reais)}</span>}
        />
        <DestaqueCard
          icon={AlertTriangle}
          iconColor="text-red-500"
          titulo="Precisa de atenção"
          item={data.precisa_atencao}
          textoVazio="Nenhum produto caiu em faturamento hoje."
          renderMetrica={(i) => <span className="text-red-500 font-semibold">{formatBRL(i.variacao_reais)}</span>}
        />
        <DestaqueCard
          icon={Zap}
          iconColor="text-sky-500"
          titulo="Melhor conversão hoje"
          item={data.melhor_conversao}
          textoVazio="Sem dados suficientes de visitas hoje."
          renderMetrica={(i) => <span className="text-sky-500 font-semibold">{i.taxa_conversao}% ({i.vendas}/{i.visitas})</span>}
        />
      </div>
    </div>
  )
}
