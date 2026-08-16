import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react'
import { api } from '../api'
import Header from '../components/Header'
import LojasIndisponiveisAviso from '../components/LojasIndisponiveisAviso'
import { useAuth } from '../context/AuthContext'

const PARTES = {
  1: '1️⃣ Receitas do mês',
  2: '2️⃣ Deduções do marketplace',
  3: '3️⃣ CMV',
  4: '4️⃣ Despesas reais do mês',
  5: '5️⃣ Saídas que não são prejuízo',
  8: '8️⃣ Controle de estoque',
}

function formatBRL(v) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function Conferencia({ c }) {
  if (!c) return null
  if (c.status === 'indisponivel') {
    return (
      <div className="bg-stone-100 border border-stone-200 rounded-xl p-4 flex gap-3">
        <HelpCircle className="w-5 h-5 text-stone-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-stone-700">Conferência indisponível</p>
          <p className="text-sm text-stone-600">{c.motivo}</p>
        </div>
      </div>
    )
  }
  const bate = c.status === 'bate'
  return (
    <div className={`rounded-xl p-4 flex gap-3 border ${bate ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
      {bate ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            : <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />}
      <div>
        <p className={`text-sm font-semibold ${bate ? 'text-emerald-800' : 'text-amber-800'}`}>
          {bate ? 'Bate! Estoque, compras e CMV estão consistentes.'
                : 'Não bateu — a diferença passou de 5%.'}
        </p>
        <p className="text-sm text-stone-600">
          CMV pela movimentação do estoque: {formatBRL(c.cmv_teorico)} · CMV do sistema: {formatBRL(c.cmv_informado)} · diferença: {formatBRL(c.diferenca)}
        </p>
        {c.causas_provaveis?.length > 0 && (
          <ul className="mt-2 text-sm text-stone-600 list-disc list-inside space-y-1">
            {c.causas_provaveis.map((causa, i) => <li key={i}>{causa}</li>)}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function FechamentoLucroReal() {
  const [mesAno, setMesAno] = useState(mesAtual())
  const [galpao, setGalpao] = useState('')
  const qc = useQueryClient()
  // activeAccount é activeAccounts.join(',') — a string que parse_contas divide
  // no backend. É assim que o multi-loja funciona no repo (ver Dashboard.jsx).
  const { activeAccount } = useAuth()

  const q = useQuery({
    queryKey: ['lucro-real', mesAno, activeAccount],
    queryFn: () => api.fechamento.lucroReal({ mes_ano: mesAno, conta_ml: activeAccount }),
    enabled: !!activeAccount,
  })

  const registrar = useMutation({
    mutationFn: () => api.fechamento.estoque.registrar(
      { mes_ano: mesAno, valor_galpao: Number(galpao || 0) },
      { conta_ml: activeAccount },
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lucro-real', mesAno, activeAccount] }),
  })

  const linhas = q.data?.linhas || []
  const partes = [...new Set(linhas.map(l => l.parte))].sort((a, b) => a - b)

  const copiarTudo = () => {
    const txt = linhas
      .filter(l => l.valor != null)
      .map(l => `Linha ${l.linha} — ${l.rotulo}: ${formatBRL(l.valor)}`)
      .join('\n')
    navigator.clipboard.writeText(txt)
  }

  return (
    <div className="space-y-5">
      <Header
        title="Fechamento Lucro Real"
        onRefresh={q.refetch}
        isLoading={q.isLoading}
        showPeriod={false}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="month"
          value={mesAno}
          onChange={e => setMesAno(e.target.value)}
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={copiarTudo}
          disabled={!linhas.length}
          className="px-3 py-2 text-sm rounded-lg bg-stone-800 text-white disabled:opacity-40"
        >
          Copiar tudo
        </button>
      </div>

      <LojasIndisponiveisAviso lojas={q.data?.lojas_indisponiveis} />

      {q.isLoading && <p className="text-sm text-stone-500">Carregando…</p>}
      {q.error && <p className="text-sm text-red-600">{String(q.error.message || q.error)}</p>}

      <Conferencia c={q.data?.conferencia} />

      {/* Registro do estoque do mês */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">Estoque do mês</h2>
        <p className="text-sm text-stone-600">
          O Full e o FBM são capturados do Mercado Livre. No campo abaixo, informe
          <strong> apenas a mercadoria que está no seu galpão e que o Mercado Livre não enxerga</strong> —
          o que já está declarado no FBM não entra aqui, senão conta duas vezes.
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-sm">
            <span className="block text-stone-600 mb-1">Galpão (não anunciado), a custo</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={galpao}
              onChange={e => setGalpao(e.target.value)}
              className="border border-stone-300 rounded-lg px-3 py-2 text-sm w-48"
              placeholder="0,00"
            />
          </label>
          <button
            onClick={() => registrar.mutate()}
            disabled={registrar.isPending}
            className="px-3 py-2 text-sm rounded-lg bg-stone-800 text-white disabled:opacity-40"
          >
            {registrar.isPending ? 'Capturando…' : 'Registrar estoque do mês'}
          </button>
        </div>
        {registrar.error && (
          <p className="text-sm text-red-600">{String(registrar.error.message || registrar.error)}</p>
        )}
      </div>

      {/* Linhas da planilha */}
      {partes.map(parte => (
        <div key={parte} className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-stone-800 mb-3">{PARTES[parte]}</h2>
          <div className="space-y-2">
            {linhas.filter(l => l.parte === parte).map(l => (
              <div key={l.linha} className="border-b border-stone-100 last:border-0 pb-2 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono bg-stone-100 text-stone-600 rounded px-2 py-1 shrink-0">
                    linha {l.linha}
                  </span>
                  <span className="text-sm text-stone-700 flex-1">{l.rotulo}</span>
                  <span className={`text-sm font-semibold ${l.origem === 'indisponivel' ? 'text-stone-400' : 'text-stone-900'}`}>
                    {formatBRL(l.valor)}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(String(l.valor ?? ''))}
                    disabled={l.valor == null}
                    className="text-stone-400 hover:text-stone-700 disabled:opacity-30"
                    title="Copiar valor"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                {l.aviso && <p className="text-xs text-stone-500 mt-1 ml-[4.5rem]">{l.aviso}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
