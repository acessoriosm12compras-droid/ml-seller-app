import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Upload, Trash2, CheckCircle2, Loader2 } from 'lucide-react'
import Header from '../../components/Header'
import EditAccountBanner from '../../components/EditAccountBanner'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../api'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const CATEGORIAS = ['Luz', 'Água', 'Gás', 'Internet', 'Fornecedor', 'Folha de Pagamento', 'Aluguel', 'Marketing / Ads', 'Logística', 'Contador', 'Impostos', 'Outros']

function formatBRL(v) {
  const n = parseFloat(v)
  if (!v && v !== 0) return 'R$ 0'
  if (isNaN(n)) return 'R$ 0'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function KpiCard({ label, value, sub, accent = 'sky' }) {
  const colors = {
    sky:     { border: 'border-l-sky-500',     text: 'text-sky-400' },
    rose:    { border: 'border-l-rose-500',     text: 'text-rose-400' },
    emerald: { border: 'border-l-emerald-500', text: 'text-emerald-400' },
    amber:   { border: 'border-l-amber-500',   text: 'text-amber-400' },
    red:     { border: 'border-l-red-500',     text: 'text-red-400' },
  }
  const c = colors[accent] || colors.sky
  return (
    <div className={`bg-stone-900 border border-stone-800 border-l-4 ${c.border} rounded-xl p-4`}>
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`text-xl font-bold ${c.text}`}>{value}</p>
      {sub && <p className="text-xs text-stone-600 mt-0.5">{sub}</p>}
    </div>
  )
}

const defaultForm = { descricao: '', categoria: 'Outros', valor: '', vencimento: '', competencia: '', status: 'a_pagar' }

export default function ContasPagar() {
  const { activeAccount, editAccount, getToken } = useAuth()
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [camposIA, setCamposIA] = useState({}) // { campo: true } pros campos que vieram da IA
  const [enviandoPdf, setEnviandoPdf] = useState(false)
  const [erroUpload, setErroUpload] = useState(null)

  const params = activeAccount ? { conta_ml: activeAccount } : {}

  const listaQ = useQuery({
    queryKey: ['contas-a-pagar', activeAccount],
    queryFn: () => api.contasAPagar.listar(params),
    enabled: !!activeAccount,
  })

  const criarM = useMutation({
    mutationFn: (data) => api.contasAPagar.criar({ ...data, conta_ml: editAccount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contas-a-pagar', activeAccount] })
      setShowModal(false)
      setForm(defaultForm)
      setCamposIA({})
    },
  })

  const atualizarM = useMutation({
    mutationFn: ({ id, data }) => api.contasAPagar.atualizar(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contas-a-pagar', activeAccount] }),
  })

  const removerM = useMutation({
    mutationFn: (id) => api.contasAPagar.remover(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contas-a-pagar', activeAccount] }),
  })

  async function handleUploadPdf(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setEnviandoPdf(true)
    setErroUpload(null)
    try {
      const body = new FormData()
      body.append('arquivo', file)
      if (editAccount) body.append('conta_ml', editAccount)
      const resp = await fetch(`${BASE}/api/contas-a-pagar/extrair`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body,
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.erro || `HTTP ${resp.status}`)

      if (data.extraido) {
        setForm({
          descricao: data.descricao || '',
          categoria: data.categoria || 'Outros',
          valor: data.valor ?? '',
          vencimento: data.vencimento || '',
          competencia: data.competencia || '',
          status: 'a_pagar',
        })
        setCamposIA({
          descricao: !!data.descricao,
          categoria: !!data.categoria,
          valor: data.valor != null,
          vencimento: !!data.vencimento,
          competencia: !!data.competencia,
        })
      } else {
        setForm(defaultForm)
        setCamposIA({})
        setErroUpload('Não consegui ler esse PDF automaticamente (provavelmente é uma imagem escaneada) — preencha manualmente.')
      }
      setShowModal(true)
    } catch (err) {
      setErroUpload(err.message)
    } finally {
      setEnviandoPdf(false)
    }
  }

  const contas = listaQ.data?.contas || []

  const hoje = new Date()
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const emAbertoContas = contas.filter(c => c.status !== 'pago')
  const totalEmAberto = emAbertoContas.reduce((acc, c) => acc + (parseFloat(c.valor) || 0), 0)
  const em7dias = emAbertoContas.filter(c => {
    if (!c.vencimento) return false
    const d = new Date(c.vencimento + 'T00:00:00')
    const diff = (d - hojeSemHora) / 86400000
    return diff >= 0 && diff <= 7
  }).reduce((acc, c) => acc + (parseFloat(c.valor) || 0), 0)
  const totalPagas = contas.filter(c => c.status === 'pago').reduce((acc, c) => acc + (parseFloat(c.valor) || 0), 0)
  const totalVencidas = emAbertoContas.filter(c => c.vencimento && new Date(c.vencimento + 'T00:00:00') < hojeSemHora)
    .reduce((acc, c) => acc + (parseFloat(c.valor) || 0), 0)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Contas a Pagar" />
      <main className="flex-1 p-3 sm:p-6 space-y-6 overflow-auto">
        <EditAccountBanner />

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setForm(defaultForm); setCamposIA({}); setErroUpload(null); setShowModal(true) }}
            className="flex items-center gap-1.5 text-xs bg-sky-700 hover:bg-sky-600 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={13} /> Lançar manual
          </button>
          <label
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${enviandoPdf ? 'opacity-60 cursor-wait bg-stone-800 border border-stone-700 text-stone-400' : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'}`}
          >
            {enviandoPdf ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {enviandoPdf ? 'Lendo PDF...' : 'Subir PDF'}
            <input type="file" accept="application/pdf" className="hidden" onChange={handleUploadPdf} disabled={enviandoPdf} />
          </label>
        </div>

        {erroUpload && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
            {erroUpload}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="Total em aberto" value={formatBRL(totalEmAberto)} sub="Pendente de pagamento" accent="rose" />
          <KpiCard label="Vencendo em 7 dias" value={formatBRL(em7dias)} sub="Próximos vencimentos" accent="amber" />
          <KpiCard label="Vencidas" value={formatBRL(totalVencidas)} sub="Atenção — já passou do prazo" accent="red" />
          <KpiCard label="Pagas" value={formatBRL(totalPagas)} sub="Títulos liquidados" accent="emerald" />
        </div>

        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-300">Contas a Pagar</h2>
            <span className="text-xs text-stone-500">{contas.length} lançamento(s)</span>
          </div>

          {listaQ.isLoading && (
            <div className="px-4 py-8 text-center text-xs text-stone-500">Carregando...</div>
          )}

          {!listaQ.isLoading && contas.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-stone-500">
              Nenhuma conta lançada. Clique em "Lançar manual" ou suba o PDF da conta.
            </div>
          )}

          {!listaQ.isLoading && contas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-stone-800">
                    <th className="px-3 py-2.5 text-left text-stone-500 font-medium">Descrição</th>
                    <th className="px-3 py-2.5 text-left text-stone-500 font-medium">Categoria</th>
                    <th className="px-3 py-2.5 text-right text-stone-500 font-medium">Valor</th>
                    <th className="px-3 py-2.5 text-center text-stone-500 font-medium">Vencimento</th>
                    <th className="px-3 py-2.5 text-center text-stone-500 font-medium">Status</th>
                    <th className="px-3 py-2.5 text-center text-stone-500 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {contas.map((c) => {
                    const vencido = c.status === 'a_pagar' && c.vencimento && new Date(c.vencimento + 'T00:00:00') < hojeSemHora
                    return (
                      <tr key={c.id} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                        <td className="px-3 py-2.5 text-stone-300">{c.descricao}</td>
                        <td className="px-3 py-2.5 text-stone-400">{c.categoria}</td>
                        <td className="px-3 py-2.5 text-right text-stone-200 font-medium">{formatBRL(c.valor)}</td>
                        <td className="px-3 py-2.5 text-center text-stone-400">{c.vencimento || '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          {c.status === 'pago'
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-emerald-400 bg-emerald-400/10"><CheckCircle2 size={11} /> Pago</span>
                            : vencido
                              ? <span className="px-2 py-0.5 rounded-full text-xs font-medium text-red-400 bg-red-400/10">Vencido</span>
                              : <span className="px-2 py-0.5 rounded-full text-xs font-medium text-amber-400 bg-amber-400/10">A pagar</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-3">
                            {c.status !== 'pago' && (
                              <button
                                onClick={() => atualizarM.mutate({ id: c.id, data: { status: 'pago' } })}
                                className="text-emerald-400 hover:text-emerald-300 transition-colors"
                                title="Marcar como pago"
                              >
                                Marcar pago
                              </button>
                            )}
                            <button onClick={() => removerM.mutate(c.id)} className="text-stone-600 hover:text-red-400 transition-colors" title="Excluir">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-5 w-full max-w-sm space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-stone-200">Lançar conta</h3>
              {Object.values(camposIA).some(Boolean) && (
                <p className="text-xs text-emerald-400 mt-1">✨ Campos sugeridos pela IA — confira antes de salvar (marcados abaixo)</p>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-stone-500 flex items-center gap-1">
                  Descrição {camposIA.descricao && <span className="text-emerald-400">✨</span>}
                </label>
                <input
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  className={`mt-1 w-full border outline-none text-stone-200 text-sm rounded-lg px-3 py-2 ${camposIA.descricao ? 'bg-emerald-500/5 border-emerald-500/40 focus:border-emerald-400' : 'bg-stone-800 border-stone-700 focus:border-sky-500'}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-stone-500 flex items-center gap-1">
                    Valor (R$) {camposIA.valor && <span className="text-emerald-400">✨</span>}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.valor}
                    onChange={(e) => setForm({ ...form, valor: e.target.value })}
                    className={`mt-1 w-full border outline-none text-stone-200 text-sm rounded-lg px-3 py-2 ${camposIA.valor ? 'bg-emerald-500/5 border-emerald-500/40 focus:border-emerald-400' : 'bg-stone-800 border-stone-700 focus:border-sky-500'}`}
                  />
                </div>
                <div>
                  <label className="text-xs text-stone-500 flex items-center gap-1">
                    Vencimento {camposIA.vencimento && <span className="text-emerald-400">✨</span>}
                  </label>
                  <input
                    type="date"
                    value={form.vencimento}
                    onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
                    className={`mt-1 w-full border outline-none text-stone-200 text-sm rounded-lg px-3 py-2 ${camposIA.vencimento ? 'bg-emerald-500/5 border-emerald-500/40 focus:border-emerald-400' : 'bg-stone-800 border-stone-700 focus:border-sky-500'}`}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-stone-500 flex items-center gap-1">
                  Competência (AAAA-MM) {camposIA.competencia && <span className="text-emerald-400">✨</span>}
                </label>
                <input
                  type="text"
                  placeholder="AAAA-MM"
                  value={form.competencia}
                  onChange={(e) => setForm({ ...form, competencia: e.target.value })}
                  className={`mt-1 w-full border outline-none text-stone-200 text-sm rounded-lg px-3 py-2 ${camposIA.competencia ? 'bg-emerald-500/5 border-emerald-500/40 focus:border-emerald-400' : 'bg-stone-800 border-stone-700 focus:border-sky-500'}`}
                />
              </div>
              <div>
                <label className="text-xs text-stone-500 flex items-center gap-1">
                  Categoria {camposIA.categoria && <span className="text-emerald-400">✨</span>}
                </label>
                <select
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  className={`mt-1 w-full border outline-none text-stone-200 text-sm rounded-lg px-3 py-2 ${camposIA.categoria ? 'bg-emerald-500/5 border-emerald-500/40 focus:border-emerald-400' : 'bg-stone-800 border-stone-700 focus:border-sky-500'}`}
                >
                  {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => criarM.mutate(form)}
                disabled={criarM.isPending || !form.descricao || !form.valor}
                className="flex-1 bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-white text-sm py-2 rounded-lg transition-colors"
              >
                {criarM.isPending ? 'Salvando...' : 'Confirmar e salvar'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
