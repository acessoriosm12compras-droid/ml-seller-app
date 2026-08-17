import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Target } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import LojasIndisponiveisAviso from '../LojasIndisponiveisAviso'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

// Interpreta valores digitados no formato brasileiro sem cair na armadilha do
// parseFloat ("50.000" viraria 50). Devolve `null` para qualquer coisa que não
// seja um número limpo — nada de truncar "700abc" em 700 silenciosamente.
export function parseValorBR(input) {
  const s = String(input ?? '').trim()
  if (!s) return null

  let normalizado
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) {
    // "50.000", "1.234,56" — pontos são separadores de milhar
    normalizado = s.replace(/\./g, '').replace(',', '.')
  } else if (/^\d+(,\d{1,2})?$/.test(s)) {
    // "50000", "700,50"
    normalizado = s.replace(',', '.')
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    // "700.50" — ponto usado como decimal
    normalizado = s
  } else {
    return null
  }

  const n = parseFloat(normalizado)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function ProgressBar({ pct, color = 'amber' }) {
  const clamped = Math.max(0, Math.min(100, pct ?? 0))
  const bg = { amber: 'bg-[var(--accent)]', sky: 'bg-sky-500' }[color]
  return (
    <div className="w-full h-2 bg-stone-100 border border-stone-200 rounded-full overflow-hidden">
      <div className={`h-full ${bg} rounded-full transition-all`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

// Formata o valor em repouso com separador de milhar (ponto) e decimal
// (vírgula) — ex: 60000 → "60.000,00" — pra ficar fácil de bater o olho e
// identificar a meta. Enquanto o usuário digita, o campo mostra o texto cru;
// parseValorBR já aceita tanto dígitos crus quanto esse formato.
function formatMilhar(v) {
  if (v == null) return ''
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function MetaEditor({ value, onSave, salvando, salvo, somenteLeitura, qtdLojas }) {
  const [draft, setDraft] = useState(value != null ? formatMilhar(value) : '')
  const [erroFormato, setErroFormato] = useState('')

  useEffect(() => {
    setDraft(value != null ? formatMilhar(value) : '')
    setErroFormato('')
  }, [value])

  function commit() {
    if (somenteLeitura) return

    const original = value != null ? formatMilhar(value) : ''
    if (draft.trim() === original.trim()) {
      setErroFormato('')
      return
    }

    const parsed = parseValorBR(draft)
    if (parsed === null) {
      setErroFormato('Valor inválido — use só números (ex: 50000 ou 50.000,00).')
      setDraft(original)
      return
    }

    setErroFormato('')
    if (parsed !== value) onSave(parsed)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5 bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border-2 border-[var(--accent)] rounded-xl px-4 py-3">
        <label htmlFor="meta-mensal" className="text-sm text-stone-700 font-semibold">
          🎯 Meta do mês:
        </label>
        <input
          id="meta-mensal"
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          value={somenteLeitura ? (value != null ? formatBRL(value) : '—') : draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          disabled={salvando}
          readOnly={somenteLeitura}
          className={`bg-white border-2 border-stone-300 rounded-lg px-3 py-1.5 text-base text-right text-stone-800 font-bold focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 ${somenteLeitura ? 'w-48 cursor-not-allowed bg-stone-100 opacity-70' : 'w-40'}`}
        />
        <span className="text-xs text-stone-500">
          {somenteLeitura
            ? `Meta somada de ${qtdLojas} lojas — selecione uma única loja pra editar.`
            : salvando ? 'salvando...' : salvo ? '✅ salvo' : 'digite o valor em R$ e clique fora do campo'}
        </span>
      </div>
      {erroFormato && <p className="text-red-500 text-xs mt-1.5 px-1">{erroFormato}</p>}
    </div>
  )
}

export default function MetaVendasCard() {
  const { activeAccount, activeAccounts, editAccount } = useAuth()
  const queryClient = useQueryClient()
  const [salvo, setSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')

  const qtdLojas = activeAccounts?.length ?? 0
  const multiLoja = qtdLojas > 1

  const { data, isLoading, error } = useQuery({
    queryKey: ['metas', activeAccount],
    queryFn: () => api.metas.get({ conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  const mutation = useMutation({
    mutationFn: (valor_meta) => api.metas.save({ conta_ml: editAccount, valor_meta }),
    onSuccess: () => {
      setErroSalvar('')
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2500)
      queryClient.invalidateQueries({ queryKey: ['metas', activeAccount] })
    },
    onError: (err) => setErroSalvar(err?.message || 'Não foi possível salvar a meta.'),
  })

  if (isLoading) {
    return (
      <div className="rounded-2xl p-5 bg-white border border-stone-200 text-sm text-stone-400">
        Carregando meta...
      </div>
    )
  }

  const metaBatida = data?.valor_meta != null && data.meta_hoje === 0 && data.vendido_mes >= data.valor_meta
  const contasSemMeta = data?.contas_sem_meta || []

  return (
    <div className="rounded-2xl p-5 bg-white border border-stone-200 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Target size={18} className="text-[var(--accent-text)]" />
        <h3 className="text-sm font-semibold text-stone-700">Meta de Vendas</h3>
      </div>

      <LojasIndisponiveisAviso lojas={data?.lojas_indisponiveis} />

      <MetaEditor
        value={data?.valor_meta ?? null}
        onSave={(v) => mutation.mutate(v)}
        salvando={mutation.isPending}
        salvo={salvo}
        somenteLeitura={multiLoja}
        qtdLojas={qtdLojas}
      />

      {erroSalvar && <p className="text-red-400 text-xs -mt-2 px-1">{erroSalvar}</p>}

      {contasSemMeta.length > 0 && (
        <p className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          <strong>{contasSemMeta.join(', ')}</strong>{' '}
          {contasSemMeta.length === 1 ? 'ainda não tem meta' : 'ainda não têm meta'} deste mês — o % considera
          só as lojas com meta definida.
        </p>
      )}

      {error ? (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          {error.status === 401
            ? 'Sessão expirada — faça login novamente.'
            : `Não foi possível carregar a meta: ${error.message || 'erro desconhecido'}`}
        </div>
      ) : data?.valor_meta == null ? (
        <p className="text-sm text-stone-400">
          {multiLoja
            ? 'Nenhuma das lojas selecionadas tem meta deste mês — selecione uma única loja pra definir.'
            : 'Defina a meta do mês acima pra acompanhar o progresso aqui.'}
        </p>
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
