import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Clock, CheckCircle2, Copy, ExternalLink, AlertTriangle } from 'lucide-react'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'

const API = import.meta.env.VITE_API_URL

async function fetchBoletos(token, params) {
  const qs = new URLSearchParams(params).toString()
  const resp = await fetch(`${API}/api/boletos?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || `Erro ${resp.status}`)
  }
  return resp.json()
}

function formatBRL(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function isVencido(dateStr) {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  if (!text) return null
  const handle = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button
      onClick={handle}
      title="Copiar linha digitável"
      className="ml-2 shrink-0 p-1 rounded text-ink-muted hover:text-ink hover:bg-app-hover transition-colors"
    >
      {copied
        ? <CheckCircle2 size={13} className="text-emerald-400" />
        : <Copy size={13} />}
    </button>
  )
}

function BoletoRow({ b, tipo }) {
  const vencido = tipo === 'pendente' && isVencido(b.data_vencimento)
  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
      <td className="px-4 py-3 max-w-[240px]">
        <div className="font-medium text-stone-900 truncate" title={b.descricao}>
          {b.descricao}
        </div>
        {b.pagador_email && (
          <div className="text-stone-400 text-[10px] truncate">{b.pagador_email}</div>
        )}
      </td>
      <td className="px-4 py-3 text-right font-semibold text-stone-900 num whitespace-nowrap">
        {formatBRL(b.valor)}
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap">
        <span className="text-stone-500 text-xs">{formatDate(b.data_criacao)}</span>
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap">
        {tipo === 'pendente' ? (
          <span className={`text-xs font-medium ${vencido ? 'text-red-500' : 'text-amber-600'}`}>
            {vencido ? '⚠ Vencido' : formatDate(b.data_vencimento)}
          </span>
        ) : (
          <span className="text-xs text-emerald-500">{formatDate(b.data_pagamento)}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {b.linha_digitavel && (
            <div className="flex items-center max-w-[160px]">
              <span className="text-[10px] font-mono text-stone-400 truncate">{b.linha_digitavel}</span>
              <CopyBtn text={b.linha_digitavel} />
            </div>
          )}
          {b.boleto_url && (
            <a
              href={b.boleto_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 p-1 rounded text-ink-muted hover:text-ink hover:bg-app-hover transition-colors"
              title="Abrir boleto PDF"
            >
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </td>
    </tr>
  )
}

function Tabela({ titulo, icon: Icon, cor, boletos, tipo, totalLabel }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
        <div className="flex items-center gap-2">
          <Icon size={16} className={cor} />
          <h2 className="text-sm font-semibold text-stone-800">{titulo}</h2>
          <span className="text-xs text-stone-400 ml-1">({boletos.length})</span>
        </div>
        <span className={`text-sm font-bold num ${cor}`}>{totalLabel}</span>
      </div>

      {boletos.length === 0 ? (
        <div className="px-5 py-10 text-center text-stone-400 text-sm">Nenhum boleto encontrado.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-4 py-3 text-left text-stone-500 font-semibold uppercase tracking-wide text-[10px]">Descrição</th>
                <th className="px-4 py-3 text-right text-stone-500 font-semibold uppercase tracking-wide text-[10px]">Valor</th>
                <th className="px-4 py-3 text-center text-stone-500 font-semibold uppercase tracking-wide text-[10px]">Emissão</th>
                <th className="px-4 py-3 text-center text-stone-500 font-semibold uppercase tracking-wide text-[10px]">
                  {tipo === 'pendente' ? 'Vencimento' : 'Pago em'}
                </th>
                <th className="px-4 py-3 text-right text-stone-500 font-semibold uppercase tracking-wide text-[10px]">Linha / PDF</th>
              </tr>
            </thead>
            <tbody>
              {boletos.map(b => <BoletoRow key={b.id} b={b} tipo={tipo} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function Boletos() {
  const { token } = useAuth()

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['boletos'],
    queryFn: () => fetchBoletos(token, {}),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Boletos — Mercado Pago" onRefresh={refetch} isLoading={isFetching} />
      <main className="flex-1 p-4 sm:p-6 space-y-5 overflow-auto">

        {isError && (
          <div className="flex items-start gap-3 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Erro ao buscar boletos</p>
              <p className="text-xs mt-0.5 opacity-80">{error?.message}</p>
              {error?.message?.includes('ACCESS_TOKEN') && (
                <p className="text-xs mt-1 opacity-70">
                  Adicione <code className="bg-red-500/20 px-1 rounded">MERCADO_PAGO_ACCESS_TOKEN</code> nas variáveis de ambiente do EasyPanel.
                </p>
              )}
            </div>
          </div>
        )}

        {/* KPIs */}
        {data && (
          <div className="grid grid-cols-2 gap-4">
            <div className="card-kpi p-5">
              <p className="text-xs font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                A Pagar (pendentes)
              </p>
              <p className="text-2xl font-bold num" style={{ color: 'var(--danger)' }}>
                {formatBRL(data.total_pendente)}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {data.pendentes.length} boleto{data.pendentes.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="card-kpi p-5">
              <p className="text-xs font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                Pagos (últ. 90 dias)
              </p>
              <p className="text-2xl font-bold num" style={{ color: 'var(--success)' }}>
                {formatBRL(data.total_pago)}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {data.pagos.length} boleto{data.pagos.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-stone-400 text-sm gap-2">
            <span className="animate-spin">⏳</span> Buscando boletos no Mercado Pago…
          </div>
        )}

        {data && (
          <>
            <Tabela
              titulo="Pendentes / A Pagar"
              icon={Clock}
              cor="text-amber-500"
              boletos={data.pendentes}
              tipo="pendente"
              totalLabel={formatBRL(data.total_pendente)}
            />
            <Tabela
              titulo="Pagos"
              icon={CheckCircle2}
              cor="text-emerald-500"
              boletos={data.pagos}
              tipo="pago"
              totalLabel={formatBRL(data.total_pago)}
            />
          </>
        )}
      </main>
    </div>
  )
}
