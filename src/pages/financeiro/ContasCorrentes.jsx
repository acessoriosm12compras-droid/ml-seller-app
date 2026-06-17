import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
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
    teal:    { border: 'border-l-teal-500',    text: 'text-teal-400' },
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

const CATEGORIAS_EXT = ['Receita ML','Fornecedor','Banco','Interno','Outros']
const defaultInputs = { cc: '', mp: '', outras: '' }
const defaultModal = { data: '', descricao: '', categoria: 'Receita ML', entrada: '', saida: '' }

export default function ContasCorrentes() {
  const { activeAccount } = useAuth()
  const now = new Date()
  const [anoMes, setAnoMes] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const [showInputs, setShowInputs] = useState(false)
  const [inputs, setInputs] = useState(defaultInputs)
  const [extrato, setExtrato] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [modal, setModal] = useState(defaultModal)
  const [saved, setSaved] = useState(false)

  const storageKey = `fin_cc_${activeAccount || 'default'}_${anoMes}`

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const d = JSON.parse(raw)
        setInputs(d.inputs || defaultInputs)
        setExtrato(d.extrato || [])
      } else {
        setInputs(defaultInputs)
        setExtrato([])
      }
    } catch {}
  }, [storageKey])

  function save(ni, ne) {
    localStorage.setItem(storageKey, JSON.stringify({ inputs: ni, extrato: ne }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleInputChange(k, v) {
    const ni = { ...inputs, [k]: v }
    setInputs(ni)
    save(ni, extrato)
  }

  function addMovimento() {
    if (!modal.descricao) return
    const ne = [...extrato, { ...modal, id: Date.now() }]
    setExtrato(ne)
    save(inputs, ne)
    setModal(defaultModal)
    setShowModal(false)
  }

  function removeMovimento(id) {
    const ne = extrato.filter(e => e.id !== id)
    setExtrato(ne)
    save(inputs, ne)
  }

  const saldoCC = parseFloat(inputs.cc) || 0
  const saldoMP = parseFloat(inputs.mp) || 0
  const saldoOutras = parseFloat(inputs.outras) || 0
  const totalDisponivel = saldoCC + saldoMP + saldoOutras

  let saldoRunning = saldoCC
  const extratoComSaldo = extrato.map(e => {
    saldoRunning += (parseFloat(e.entrada) || 0) - (parseFloat(e.saida) || 0)
    return { ...e, saldoApos: saldoRunning }
  })

  const [ano, mesN] = anoMes.split('-')
  const mesLabel = `${MESES[parseInt(mesN)-1]} ${ano}`

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Contas Correntes" />
      <main className="flex-1 p-3 sm:p-6 space-y-6 overflow-auto">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-stone-500">Mes/Ano</label>
            <input type="month" value={anoMes} onChange={e => setAnoMes(e.target.value)}
              className="bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500" />
          </div>
          <button onClick={() => setShowInputs(s => !s)}
            className="flex items-center gap-1.5 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-1.5 rounded-lg transition-colors">
            {showInputs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showInputs ? 'Recolher' : 'Editar saldos'}
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 text-xs bg-sky-700 hover:bg-sky-600 text-white px-3 py-1.5 rounded-lg transition-colors">
            <Plus size={13} /> Novo lancamento
          </button>
          {saved && <span className="text-xs text-emerald-400">Salvo</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="Saldo atual C/C" value={formatBRL(saldoCC)} sub="Conta corrente principal" accent="sky" />
          <KpiCard label="Mercado Pago" value={formatBRL(saldoMP)} sub="Saldo conta ML" accent="teal" />
          <KpiCard label="Total disponivel" value={formatBRL(totalDisponivel)} sub="Soma de todas as contas" accent="emerald" />
          <KpiCard label="Outras contas" value={formatBRL(saldoOutras)} sub="Poupanca, caixinha, etc." accent="violet" />
        </div>
        {showInputs && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-stone-300">Saldos das Contas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { k: 'cc', label: 'Conta Corrente Principal (R$)', ph: 'Banco principal' },
                { k: 'mp', label: 'Mercado Pago (R$)', ph: 'Saldo na conta ML' },
                { k: 'outras', label: 'Outras contas (R$)', ph: 'Poupanca, etc.' },
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
            <h2 className="text-sm font-semibold text-stone-300">Extrato</h2>
            <span className="text-xs text-stone-500">{extrato.length} lancamento(s)</span>
          </div>
          {extrato.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-stone-500">
              Nenhuma movimentacao registrada.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-stone-800">
                    <th className="px-3 py-2.5 text-left text-stone-500 font-medium">Data</th>
                    <th className="px-3 py-2.5 text-left text-stone-500 font-medium">Descricao</th>
                    <th className="px-3 py-2.5 text-left text-stone-500 font-medium">Categoria</th>
                    <th className="px-3 py-2.5 text-right text-stone-500 font-medium">Entrada</th>
                    <th className="px-3 py-2.5 text-right text-stone-500 font-medium">Saida</th>
                    <th className="px-3 py-2.5 text-right text-stone-500 font-medium">Saldo</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {extratoComSaldo.map(e => (
                    <tr key={e.id} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-stone-400">{e.data || '-'}</td>
                      <td className="px-3 py-2.5 text-stone-300">{e.descricao}</td>
                      <td className="px-3 py-2.5 text-stone-500">{e.categoria}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-400">{e.entrada ? formatBRL(e.entrada) : '-'}</td>
                      <td className="px-3 py-2.5 text-right text-rose-400">{e.saida ? formatBRL(e.saida) : '-'}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-stone-200">{formatBRL(e.saldoApos)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => removeMovimento(e.id)} className="text-stone-600 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-5 w-full max-w-sm space-y-4">
            <h3 className="text-sm font-semibold text-stone-200">Novo lancamento</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-stone-500">Data</label>
                  <input type="date" value={modal.data} onChange={e => setModal(m => ({...m, data: e.target.value}))}
                    className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="text-xs text-stone-500">Categoria</label>
                  <select value={modal.categoria} onChange={e => setModal(m => ({...m, categoria: e.target.value}))}
                    className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2">
                    {CATEGORIAS_EXT.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-stone-500">Descricao</label>
                <input value={modal.descricao} onChange={e => setModal(m => ({...m, descricao: e.target.value}))}
                  className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-stone-500">Entrada (R$)</label>
                  <input type="number" step="0.01" value={modal.entrada} onChange={e => setModal(m => ({...m, entrada: e.target.value}))}
                    className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="text-xs text-stone-500">Saida (R$)</label>
                  <input type="number" step="0.01" value={modal.saida} onChange={e => setModal(m => ({...m, saida: e.target.value}))}
                    className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={addMovimento} className="flex-1 bg-sky-700 hover:bg-sky-600 text-white text-sm py-2 rounded-lg transition-colors">Salvar</button>
              <button onClick={() => { setShowModal(false); setModal(defaultModal) }} className="flex-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm py-2 rounded-lg transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
