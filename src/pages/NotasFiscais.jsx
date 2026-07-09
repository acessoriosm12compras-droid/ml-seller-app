import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, FileCheck2 } from 'lucide-react'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'

function formatBRL(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function CertificadoBanner({ certificadosVencendo }) {
  if (!certificadosVencendo?.length) return null
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div>
        {certificadosVencendo.map((c) => (
          <p key={c.conta_ml}>
            Certificado digital de <strong>{c.conta_ml}</strong> vence em {c.dias_para_vencer} dia(s) — renove pra não interromper a captura de notas.
          </p>
        ))}
      </div>
    </div>
  )
}

export default function NotasFiscais() {
  const { activeAccount } = useAuth()
  const [tipo, setTipo] = useState('')

  const accountParams = activeAccount ? { conta_ml: activeAccount } : {}
  const params = { ...accountParams, ...(tipo ? { tipo } : {}) }

  const { data: statusData, isError: statusError } = useQuery({
    queryKey: ['notas-fiscais-status', activeAccount],
    queryFn: () => api.notasFiscais.status(accountParams),
  })

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['notas-fiscais', activeAccount, tipo],
    queryFn: () => api.notasFiscais.listar(params),
  })

  const notas = data?.notas || []
  const contasSemFiscal = ['J12', 'LOCITECH']
  const contaSemFiscalConfigurado = activeAccount && contasSemFiscal.includes(activeAccount)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="NF / Fiscal" onRefresh={refetch} isLoading={isFetching} />
      <main className="flex-1 p-4 sm:p-6 space-y-5 overflow-auto">
        <CertificadoBanner certificadosVencendo={statusError ? [] : statusData?.certificados_vencendo} />

        {contaSemFiscalConfigurado ? (
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
            A conta {activeAccount} ainda não tem certificado/captura fiscal configurados.
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
              >
                <option value="">Todas</option>
                <option value="entrada">Compras (entrada)</option>
                <option value="saida">Vendas (saída)</option>
              </select>
            </div>

            {isLoading && (
              <div className="flex items-center justify-center py-20 text-stone-400 text-sm gap-2">
                <span className="animate-spin">⏳</span> Buscando notas fiscais…
              </div>
            )}

            {isError && (
              <div className="flex items-start gap-3 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Erro ao buscar notas fiscais</p>
                  <p className="text-xs mt-0.5 opacity-80">{error?.message}</p>
                </div>
              </div>
            )}

            {!isLoading && !isError && notas.length === 0 && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
                Nenhuma nota fiscal capturada ainda pra esse filtro.
              </div>
            )}

            {notas.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-stone-200">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-left text-xs text-stone-500">
                    <tr>
                      <th className="px-4 py-2">Data</th>
                      <th className="px-4 py-2">Tipo</th>
                      <th className="px-4 py-2">Conta</th>
                      <th className="px-4 py-2">Valor</th>
                      <th className="px-4 py-2">Chave de acesso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notas.map((n) => (
                      <tr key={n.chave_acesso} className="border-t border-stone-100">
                        <td className="px-4 py-2">{formatDate(n.data_emissao)}</td>
                        <td className="px-4 py-2 flex items-center gap-1">
                          <FileCheck2 size={13} className={n.tipo === 'saida' ? 'text-emerald-500' : 'text-sky-500'} />
                          {n.tipo === 'saida' ? 'Venda' : 'Compra'}
                        </td>
                        <td className="px-4 py-2">{n.conta_ml}</td>
                        <td className="px-4 py-2">{formatBRL(n.valor_total)}</td>
                        <td className="px-4 py-2 font-mono text-xs text-stone-500">{n.chave_acesso}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
