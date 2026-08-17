import { useQuery } from '@tanstack/react-query'
import { Zap } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import LojasIndisponiveisAviso from '../LojasIndisponiveisAviso'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatBRLCurto(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(v)
}

function formatDia(iso) {
  if (!iso) return null
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

// Uma linha por produto, todas na MESMA escala: a barra é proporcional à maior
// variação da lista. Antes eram três cards com métricas diferentes, sem escala
// comum — dava pra achar que uma queda de R$ 247 era grave.
function LinhaMovimentacao({ item, maior }) {
  const v = item.variacao_reais
  const subiu = v > 0
  const largura = maior > 0 ? Math.round((Math.abs(v) / maior) * 100) : 0

  return (
    <div className="flex items-center gap-3 py-2 border-t border-stone-200">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-stone-800 truncate" title={item.titulo}>{item.titulo}</p>
        <p className="text-xs text-stone-400 truncate">
          {item.sku ? `${item.sku} · ` : ''}
          {formatBRLCurto(item.faturamento_atual)} agora · {formatBRLCurto(item.faturamento_anterior)} antes
        </p>
      </div>

      <div className="hidden sm:flex items-center w-32 shrink-0" aria-hidden="true">
        <div className="w-1/2 flex justify-end">
          {!subiu && (
            <div className="h-3 bg-red-400 rounded-l" style={{ width: `${largura}%` }} />
          )}
        </div>
        <div className="w-px h-4 bg-stone-300" />
        <div className="w-1/2">
          {subiu && (
            <div className="h-3 bg-[var(--accent)] rounded-r" style={{ width: `${largura}%` }} />
          )}
        </div>
      </div>

      <div className={`w-24 text-right text-sm shrink-0 ${subiu ? 'text-[var(--accent-text)]' : 'text-red-500'}`}>
        {subiu ? '+' : '−'}{formatBRLCurto(Math.abs(v))}
      </div>
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
          : `Não foi possível carregar o resumo: ${error.message || 'erro desconhecido'}`}
      </div>
    )
  }

  if (!data) return null

  const movimentacoes = data.movimentacoes || []
  const maior = movimentacoes.reduce((m, i) => Math.max(m, Math.abs(i.variacao_reais)), 0)
  const janela = data.janela

  return (
    <div className="rounded-2xl p-5 bg-white border border-stone-200 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-700">O que mudou</h3>
        {janela && (
          <span className="text-xs text-stone-400">
            7 dias até {formatDia(janela.fim)} vs. os 7 anteriores
          </span>
        )}
      </div>

      <LojasIndisponiveisAviso lojas={data.lojas_indisponiveis} />

      {movimentacoes.length === 0 ? (
        <p className="text-sm text-stone-400">
          Nenhum produto mudou de faturamento entre as duas semanas.
        </p>
      ) : (
        <div>
          {movimentacoes.map(item => (
            <LinhaMovimentacao key={item.ml_item_id} item={item} maior={maior} />
          ))}
        </div>
      )}

      {data.melhor_conversao && (
        <p className="text-xs text-stone-500 flex items-center gap-1.5 pt-1">
          <Zap size={13} className="text-sky-500 shrink-0" />
          <span className="truncate">
            Melhor conversão: {data.melhor_conversao.titulo} — {data.melhor_conversao.taxa_conversao}%
            ({data.melhor_conversao.vendas}/{data.melhor_conversao.visitas} visitas)
          </span>
        </p>
      )}
    </div>
  )
}
