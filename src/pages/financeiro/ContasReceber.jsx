import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function formatBRL(v) {
  const n = parseFloat(v)
  if (!v && v !== 0) return 'R$ 0'
  if (isNaN(n)) return 'R$ 0'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function KpiCard({ label, value, sub, accent = 'sky' }) {
  const colors = {
    sky:     { border: 'border-l-sky-500',     text: 'text-sky-400' },
    emerald: { border: 'border-l-emerald-500', text: 'text-emerald-400' },
    amber:   { border: 'border-l-amber-500',   text: 'text-amber-400' },
    violet:  { border: 'border-l-violet-500',  text: 'text-violet-400' },
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

const STATUS_COLOR = {
  'Recebido': 'text-emerald-400',
  'Previsto': 'text-amber-400',
  'Agendado': 'text-sky-400',
}
const STATUS_ICON = { 'Recebido': '✅', 'Previsto': '⏳', 'Agendado': '📅' }

const defaultInputs = { recebido: '', ate7dias: '', acima7dias: '', faturamento: '' }

export default function ContasReceber() {
  const { activeAccount } = useAuth()
  const now = new Date()
  const [anoMes, setAnoMes] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const [showInputs, setShowInputs] = useState(false)
  const [inputs, setInputs] = useState(defaultInputs)
  const [repasses, setRepasses] = useState([])
  const [saved, setSaved] = useState(false)

  const storageKey = `fin_cr_${activeAccount || 'default'}_${anoMes}`

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const d = JSON.parse(raw)
        setInputs(d.inputs || defaultInputs)
        setRepasses(d.repasses || [])
      } else {
        setInputs(defaultInputs)
        setRepasses([])
      }
    } catch {}
  }, [storageKey])

  function save(ni, nr) {
    localStorage.setItem(storageKey, JSON.stringify({ inputs: ni, repasses: nr }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleInputChange(k, v) {
    const ni = { ...inputs, [k]: v }
    setInputs(ni)
    save(ni, repasses)
  }

  function addRepasse() {
    const nr = [...repasses, { id: Date.now(), data: '', descricao: '', valorBruto: '', taxaML: '', valorLiq: '', status: 'Previsto' }]
    setRepasses(nr)
    save(inputs, nr)
  }

  function updateRepasse(id, field, value) {
    const nr = repasses.map(r => r.id === id ? { ...r, [field]: value } : r)
    setRepasses(nr)
    save(inputs, nr)
  }

  function removeRepasse(id) {
    const nr = repasses.filter(r => r.id !== id)
    setRepasses(nr)
    save(inputs, nr)
  }

  const totalRecebido = parseFloat(inputs.recebido) || 0
  const totalAte7 = parseFloat(inputs.ate7dias) || 0
  const totalAcima7 = parseFloat(inputs.acima7dias) || 0
  const totalAReceber = totalAte7 + totalAcima7
  const faturamento = parseFloat(inputs.faturamento) || 0

  const [mesN, ano] = anoMes.split('-')
  const mesLabel = `${MESES[parseInt(mesN)-1]} ${ano}`

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Contas a Receber" />

      <main className="flex-1 p-3 sm:p-6 space-y-6 overflow-auto">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-stone-500">Mês/Ano</label>
            <input type="month" value={anoMes} onChange={e => setAnoMes(e.target.value)}
              className="bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500" />
          </div>
          <button onClick={() => setShowInputs(s => !s)}
            className="flex items-center gap-1.5 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-1.5 rounded-lg transition-colors">
            {showInputs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showInputs ? 'Recolher' : 'Editar inputs'}
          </button>
          {saved && <span className="text-xs text-emerald-400">✓ Salvo</span>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="A receber (faturamento)" value={formatBRL(faturamento)} sub="Vendas ML acumuladas" accent="sky" />
          <KpiCard label="Repasses recebidos" value={formatBRL(totalRecebido)} sub="Já depositado na conta" accent="emerald" />
          <KpiCard label="Aguardando repasse" value={formatBRL(totalAReceber)} sub="Em processamento ML" accent="amber" />
          <KpiCard label="Prazo médio recebimento" value="~14 dias" sub="Após aprovação da compra" accent="violet" />
        </div>

        {showInputs && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-stone-300">Repasses Mercado Livre — {mesLabel}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { k: 'faturamento', label: 'Faturamento / A receber total (R$)', ph: 'Vendas ML acumuladas' },
                { k: 'recebido', label: 'Repasse já recebido (R$)', ph: 'Valores já na conta' },
                { k: 'ate7dias', label: 'A receber em até 7 dias (R$)', ph: 'Previsão para a semana' },
                { k: 'acima7dias', label: 'A receber acima de 7 dias (R$)', ph: 'Saldo retido ML' },
              ].map(({ k, label, ph }) => (
                <div key={k}>
                  <label className="text-xs text-stone-500">{label}</label>
                  <div className="flex items-center mt-1 bg-stone-800 border border-stone-700 rounded-lg px-3 focus-within:border-sky-500">
                    <span className="text-stone-500 text-xs mr-1">R$</span>
                    <input type="number" step="0.01" placeholder={ph}
                      value={inputs[k]} onChange={e => handleInputChange(k, e.target.value)}
                      className="flex-1 bg-transparent py-2 text-sm text-stone-200 outline-none" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-300">Previsão de Repasses — Mercado Livre</h2>
            <button onClick={addRepasse}
              className="text-xs text-sky-400 hover:text-sky-300 transition-colors">+ Adicionar</button>
          </div>
          {repasses.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-stone-500">
              Nenhum repasse cadastrado. Clique em "+ Adicionar" para começar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-stone-800">
                    <th className="px-3 py-2.5 text-left text-stone-500 font-medium">Data prevista</th>
                    <th className="px-3 py-2.5 text-left text-stone-500 font-medium">Descrição</th>
                    <th className="px-3 py-2.5 text-right text-stone-500 font-medium">Valor bruto</th>
                    <th className="px-3 py-2.5 text-right text-stone-500 font-medium">Taxa ML</th>
                    <th className="px-3 py-2.5 text-right text-stone-500 font-medium">Valor líquido</th>
                    <th className="px-3 py-2.5 text-center text-stone-500 font-medium">Status</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {repasses.map(r => {
                    const liq = (parseFloat(r.valorBruto) || 0) - (parseFloat(r.taxaML) || 0)
                    return (
                      <tr key={r.id} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                        <td className="px-3 py-2.5">
                          <input type="date" value={r.data} onChange={e => updateRepasse(r.id, 'data', e.target.value)}
                            className="bg-transparent text-stone-300 outline-none w-28" />
                        </td>
                        <td className="px-3 py-2.5">
                          <input value={r.descricao} onChange={e => updateRepasse(r.id, 'descricao', e.target.value)}
                            placeholder="Descrição" className="bg-transparent text-stone-300 outline-none w-40" />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <input type="number" step="0.01" value={r.valorBruto} onChange={e => updateRepasse(r.id, 'valorBruto', e.target.value)}
                            className="bg-transparent text-stone-200 outline-none w-24 text-right" />
                        </td>
                        <td className="px-3 py-2.5 text-right text-rose-400">
                          <input type="number" step="0.01" value={r.taxaML} onChange={e => updateRepasse(r.id, 'taxaML', e.target.value)}
                            className="bg-transparent text-rose-400 outline-none w-24 text-right" />
                        </td>
                        <td className="px-3 py-2.5 text-right text-emerald-400 font-medium">{formatBRL(liq)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <select value={r.status} onChange={e => updateRepasse(r.id, 'status', e.target.value)}
                            className={`bg-transparent outline-none ${STATUS_COLOR[r.status] || 'text-stone-400'}`}>
                            {Object.keys(STATUS_COLOR).map(s => <option key={s} value={s}>{STATUS_ICON[s]} {s}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => removeRepasse(r.id)} className="text-stone-600 hover:text-red-400 transition-colors">✕</button>
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
    </div>
  )
}
