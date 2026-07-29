import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Target } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function ProgressBar({ pct, color = 'amber' }) {
  const clamped = Math.max(0, Math.min(100, pct ?? 0))
  const bg = { amber: 'bg-amber-500', sky: 'bg-sky-500' }[color]
  return (
    <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden">
      <div className={`h-full ${bg} rounded-full transition-all`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

function MetaEditor({ value, onSave, salvando, salvo }) {
  const [draft, setDraft] = useState(value != null ? String(value) : '')

  useEffect(() => { setDraft(value != null ? String(value) : '') }, [value])

  function commit() {
    const parsed = parseFloat(draft.replace(',', '.'))
    if (!isNaN(parsed) && parsed >= 0 && parsed !== value) {
      onSave(parsed)
    } else if (value != null) {
      setDraft(String(value))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 bg-stone-900 border-2 border-amber-500 rounded-xl px-4 py-3">
      <label htmlFor="meta-mensal" className="text-sm text-stone-200 font-semibold">
        🎯 Meta do mês:
      </label>
      <input
        id="meta-mensal"
        type="text"
        inputMode="decimal"
        placeholder="0,00"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        disabled={salvando}
        className="w-32 bg-stone-800 border-2 border-stone-600 rounded-lg px-3 py-1.5 text-base text-right text-stone-100 font-bold focus:outline-none focus:border-amber-400 disabled:opacity-50"
      />
      <span className="text-xs text-stone-400">
        {salvando ? 'salvando...' : salvo ? '✅ salvo' : 'digite o valor em R$ e clique fora do campo'}
      </span>
    </div>
  )
}

export default function MetaVendasCard() {
  const { activeAccount, editAccount } = useAuth()
  const queryClient = useQueryClient()
  const [salvo, setSalvo] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['metas', activeAccount],
    queryFn: () => api.metas.get({ conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  const mutation = useMutation({
    mutationFn: (valor_meta) => api.metas.save({ conta_ml: editAccount, valor_meta }),
    onSuccess: () => {
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2500)
      queryClient.invalidateQueries(['metas', activeAccount])
    },
  })

  if (isLoading) {
    return (
      <div className="rounded-2xl p-5 bg-white border border-stone-200 text-sm text-stone-400">
        Carregando meta...
      </div>
    )
  }

  const metaBatida = data?.valor_meta != null && data.meta_hoje === 0 && data.vendido_mes >= data.valor_meta

  return (
    <div className="rounded-2xl p-5 bg-white border border-stone-200 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Target size={18} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-stone-700">Meta de Vendas</h3>
      </div>

      <MetaEditor
        value={data?.valor_meta ?? null}
        onSave={(v) => mutation.mutate(v)}
        salvando={mutation.isPending}
        salvo={salvo}
      />

      {data?.valor_meta == null ? (
        <p className="text-sm text-stone-400">Defina a meta do mês acima pra acompanhar o progresso aqui.</p>
      ) : (
        <>
          <div>
            <div className="flex justify-between text-xs text-stone-400 mb-1">
              <span>Vendido no mês: {formatBRL(data.vendido_mes)}</span>
              <span>{data.pct_mes}%</span>
            </div>
            <ProgressBar pct={data.pct_mes} color="amber" />
          </div>

          {metaBatida ? (
            <p className="text-sm text-green-500 font-semibold">Meta do mês batida! 🎉</p>
          ) : (
            <div>
              <div className="flex justify-between text-xs text-stone-400 mb-1">
                <span>Meta de hoje: {formatBRL(data.meta_hoje)} · vendido: {formatBRL(data.vendido_hoje)}</span>
                <span>{data.pct_hoje}%</span>
              </div>
              <ProgressBar pct={data.pct_hoje} color="sky" />
            </div>
          )}
        </>
      )}
    </div>
  )
}
