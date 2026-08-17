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

// Sem centavos: nos valores grandes do card (meta, projeção, ritmo diário) os
// centavos só atrapalham a leitura rápida.
function formatBRLCurto(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(v)
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

// Formata o valor em repouso com separador de milhar (ponto) e decimal
// (vírgula) — ex: 60000 → "60.000,00" — pra ficar fácil de bater o olho e
// identificar a meta. Enquanto o usuário digita, o campo mostra o texto cru;
// parseValorBR já aceita tanto dígitos crus quanto esse formato.
function formatMilhar(v) {
  if (v == null) return ''
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function nomeDoMes() {
  const s = new Date().toLocaleDateString('pt-BR', { month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// O campo fica no cabeçalho, discreto: a meta é digitada uma vez por mês e antes
// ocupava o lugar mais visível do bloco, empurrando pra baixo justamente o que se
// olha todo dia. Continua sendo um input de verdade (não um botão que revela outro
// campo) pra não esconder o rótulo de quem navega por leitor de tela.
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
    <div className="text-right">
      <div className="flex items-center justify-end gap-2">
        <label htmlFor="meta-mensal" className="text-xs text-stone-500">
          Meta do mês
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
          className={`bg-white border border-stone-300 rounded-lg px-2.5 py-1 text-sm text-right text-stone-800 font-semibold focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 ${somenteLeitura ? 'w-40 cursor-not-allowed bg-stone-100 opacity-70' : 'w-32'}`}
        />
      </div>
      <p className="text-[11px] text-stone-400 mt-1">
        {somenteLeitura
          ? `Somada de ${qtdLojas} lojas — selecione uma única loja pra editar.`
          : salvando ? 'salvando...' : salvo ? 'salvo' : ''}
      </p>
      {erroFormato && <p className="text-red-500 text-xs mt-1">{erroFormato}</p>}
    </div>
  )
}

// Barra do mês com o traço de "onde eu deveria estar hoje". É o traço que
// transforma a barra em resposta: 47% sozinho não diz se está bem ou mal.
function BarraComIdeal({ pct, pctIdeal }) {
  const preenchido = Math.max(0, Math.min(100, pct ?? 0))
  const ideal = Math.max(0, Math.min(100, pctIdeal ?? 0))
  return (
    <div>
      <div className="relative w-full h-3.5 bg-stone-100 border border-stone-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--accent)] rounded-full transition-all"
          style={{ width: `${preenchido}%` }}
        />
      </div>
      {pctIdeal != null && (
        <div className="relative h-4">
          <div
            className="absolute -top-4 w-0.5 h-5 bg-stone-700"
            style={{ left: `${ideal}%` }}
          />
          <div
            className="absolute top-1 text-[11px] text-stone-500 whitespace-nowrap"
            style={{ left: `${ideal}%`, transform: 'translateX(-50%)' }}
          >
            ideal hoje
          </div>
        </div>
      )}
    </div>
  )
}

function Numero({ rotulo, valor, destaque }) {
  return (
    <div>
      <div className="text-xs text-stone-500">{rotulo}</div>
      <div className={`text-[15px] ${destaque || 'text-stone-800'}`}>{valor}</div>
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

  // Atraso/adiantamento em relação ao ritmo linear. `null` quando o backend não
  // manda a comparação (sem meta) — não inventamos zero.
  const diferenca = data?.diferenca_ideal
  const pctIdeal = data?.valor_meta ? (data.ideal_hoje / data.valor_meta) * 100 : null
  const pctProjecao = data?.valor_meta && data.projecao_fim_mes != null
    ? Math.round((data.projecao_fim_mes / data.valor_meta) * 100)
    : null

  return (
    <div className="rounded-2xl p-5 bg-white border border-stone-200 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-[var(--accent-text)]" />
          <h3 className="text-sm font-semibold text-stone-700">Meta de {nomeDoMes()}</h3>
        </div>
        <MetaEditor
          value={data?.valor_meta ?? null}
          onSave={(v) => mutation.mutate(v)}
          salvando={mutation.isPending}
          salvo={salvo}
          somenteLeitura={multiLoja}
          qtdLojas={qtdLojas}
        />
      </div>

      <LojasIndisponiveisAviso lojas={data?.lojas_indisponiveis} />

      {erroSalvar && <p className="text-red-400 text-xs -mt-2">{erroSalvar}</p>}

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
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-2xl font-semibold text-stone-800">
              {formatBRL(data.vendido_mes)}
            </span>
            {diferenca != null && (
              <span className={`text-sm ${diferenca < 0 ? 'text-red-500' : 'text-[var(--accent-text)]'}`}>
                {diferenca < 0
                  ? `${formatBRLCurto(Math.abs(diferenca))} atrás do ritmo`
                  : `${formatBRLCurto(diferenca)} à frente do ritmo`}
              </span>
            )}
            <span className="text-sm text-stone-400 ml-auto">{data.pct_mes}%</span>
          </div>

          <BarraComIdeal pct={data.pct_mes} pctIdeal={pctIdeal} />

          <div className="flex flex-wrap gap-6 pt-3 border-t border-stone-200">
            <Numero rotulo="Faltam" valor={`${data.dias_restantes} dias`} />
            <Numero
              rotulo="Precisa vender"
              valor={`${formatBRLCurto(data.ritmo_necessario)}/dia`}
            />
            <Numero
              rotulo="Está vendendo"
              valor={`${formatBRLCurto(data.ritmo_atual)}/dia`}
              destaque={
                data.ritmo_necessario != null && data.ritmo_atual != null &&
                data.ritmo_atual < data.ritmo_necessario ? 'text-red-500' : undefined
              }
            />
          </div>

          {metaBatida ? (
            <p className="text-sm text-[var(--accent-text)] font-semibold">Meta do mês batida!</p>
          ) : (
            <>
              {data.projecao_fim_mes != null && (
                <p className="text-sm text-stone-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Nesse ritmo, {nomeDoMes().toLowerCase()} fecha em{' '}
                  <strong>{formatBRLCurto(data.projecao_fim_mes)}</strong>
                  {pctProjecao != null && ` — ${pctProjecao}% da meta.`}
                </p>
              )}
              <p className="text-xs text-stone-500">
                Hoje: {formatBRL(data.vendido_hoje)} dos {formatBRL(data.meta_hoje)} do dia
                {data.pct_hoje != null && ` — ${data.pct_hoje}%`}
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
