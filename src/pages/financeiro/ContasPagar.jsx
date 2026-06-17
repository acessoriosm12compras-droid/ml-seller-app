import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, DollarSign } from 'lucide-react'
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

const CATEGORIAS = ['Fornecedor','Folha de Pagamento','Aluguel','Marketing / Ads','Logística','Contador','Impostos','Outros']
const STATUS_OPTS = ['A pagar','Pago','Vencido']

const defaultInputs = {
  fornecedor1: '', fornecedor1Nome: 'Principal fornecedor ML',
  fornecedor2: '', fornecedor3: '', comprasMes: '',
  aluguel: '', folha: '', ads: '', logistica: '',
  softwares: '', contador: '', impostos: '', outras: '',
}

const defaultModal = { descricao: '', valor: '', vencimento: '', categoria: 'Fornecedor', status: 'A pagar' }

export default function ContasPagar() {
  const { activeAccount } = useAuth()
  const now = new Date()
  const [anoMes, setAnoMes] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const [showInputs, setShowInputs] = useState(false)
  const [inputs, setInputs] = useState(defaultInputs)
  const [lancamentos, setLancamentos] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [modal, setModal] = useState(defaultModal)
  const [saved, setSaved] = useState(false)

  const storageKey = `fin_cp_${activeAccount || 'default'}_${anoMes}`

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const d = JSON.parse(raw)
        setInputs(d.inputs || defaultInputs)
        setLancamentos(d.lancamentos || [])
      } else {
        setInputs(defaultInputs)
        setLancamentos([])
      }
    } catch {}
  }, [storageKey])

  function save(newInputs, newLanc) {
    localStorage.setItem(storageKey, JSON.stringify({ inputs: newInputs, lancamentos: newLanc }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleInputChange(k, v) {
    const ni = { ...inputs, [k]: v }
    setInputs(ni)
    save(ni, lancamentos)
  }

  function addLancamento() {
    if (!modal.descricao || !modal.valor) return
    const nl = [...lancamentos, { ...modal, id: Date.now() }]
    setLancamentos(nl)
    save(inputs, nl)
    setModal(defaultModal)
    setShowModal(false)
  }

  function removeLancamento(id) {
    const nl = lancamentos.filter(l => l.id !== id)
    setLancamentos(nl)
    save(inputs, nl)
  }

  function toggleStatus(id) {
    const nl = lancamentos.map(l => {
      if (l.id !== id) return l
      const idx = STATUS_OPTS.indexOf(l.status)
      return { ...l, status: STATUS_OPTS[(idx + 1) % STATUS_OPTS.length] }
    })
    setLancamentos(nl)
    save(inputs, nl)
  }

  const totalFornecedores = [inputs.fornecedor1, inputs.fornecedor2, inputs.fornecedor3, inputs.comprasMes]
    .reduce((acc, v) => acc + (parseFloat(v) || 0), 0)

  const totalFixos = [inputs.aluguel, inputs.folha, inputs.ads, inputs.logistica,
    inputs.softwares, inputs.contador, inputs.impostos, inputs.outras]
    .reduce((acc, v) => acc + (parseFloat(v) || 0), 0)

  const totalPeriodo = lancamentos.reduce((acc, l) => acc + (parseFloat(l.valor) || 0), 0)

  const hoje = new Date()
  const em7dias = lancamentos.filter(l => {
    if (l.status === 'Pago') return false
    const d = new Date(l.vencimento + 'T00:00:00')
    const diff = (d - hoje) / 86400000
    return diff >= 0 && diff <= 7
  }).reduce((acc, l) => acc + (parseFloat(l.valor) || 0), 0)

  const pagas = lancamentos.filter(l => l.status === 'Pago').reduce((acc, l) => acc + (parseFloat(l.valor) || 0), 0)
  const emAberto = lancamentos.filter(l => l.status !== 'Pago').reduce((acc, l) => acc + (parseFloat(l.valor) || 0), 0)

  const [ano, mesN] = anoMes.split('-')
  const mesLabel = `${MESES[parseInt(mesN)-1]} ${ano}`

  const statusColor = s => ({
    'Pago': 'text-emerald-400 bg-emerald-400/10',
    'Vencido': 'text-red-400 bg-red-400/10',
    'A pagar': 'text-amber-400 bg-amber-400/10',
  }[s] || 'text-stone-400')

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Contas a Pagar" />
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
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 text-xs bg-sky-700 hover:bg-sky-600 text-white px-3 py-1.5 rounded-lg transition-colors">
            <Plus size={13} /> Novo lançamento
          </button>
          {saved && <span className="text-xs text-emerald-400">✓ Salvo</span>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="A pagar no período" value={formatBRL(totalPeriodo)} sub="Informe os valores abaixo" accent="rose" />
          <KpiCard label="Vencendo em 7 dias" value={formatBRL(em7dias)} sub="Próximos vencimentos" accent="amber" />
          <KpiCard label="Pagas no período" value={formatBRL(pagas)} sub="Títulos liquidados" accent="emerald" />
          <KpiCard label="Total em aberto" value={formatBRL(emAberto)} sub="Pendente de pagamento" accent="red" />
        </div>

        {showInputs && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-stone-300">Fornecedores e despesas fixas — {mesLabel}</h3>
            <div>
              <p className="text-xs text-stone-500 font-medium mb-2 uppercase tracking-wider">Fornecedores</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { k: 'fornecedor1', label: 'Fornecedor principal', ph: 'Principal fornecedor ML' },
                  { k: 'fornecedor2', label: 'Fornecedor 2', ph: '' },
                  { k: 'fornecedor3', label: 'Fornecedor 3', ph: '' },
                  { k: 'comprasMes', label: 'Compras do mês', ph: 'Total pedidos realizados' },
                ].map(({ k, label, ph }) => (
                  <div key={k}>
                    <label className="text-xs text-stone-500">{label}</label>
                    <div className="flex items-center mt-1 bg-stone-800 border border-stone-700 rounded-lg px-3 focus-within:border-sky-500">
                      <span className="text-stone-500 text-xs mr-1">R$</span>
                      <input type="number" step="0.01" placeholder={ph} value={inputs[k]} onChange={e => handleInputChange(k, e.target.value)}
                        className="flex-1 bg-transparent py-2 text-sm text-stone-200 outline-none" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-stone-500 font-medium mb-2 uppercase tracking-wider">Despesas Fixas Mensais</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { k: 'aluguel', label: 'Aluguel / Infraestrutura' },
                  { k: 'folha', label: 'Folha de Pagamento' },
                  { k: 'ads', label: 'Mercado Ads / Marketing' },
                  { k: 'logistica', label: 'Logística / Frete próprio' },
                  { k: 'softwares', label: 'Softwares / Ferramentas' },
                  { k: 'contador', label: 'Contador / Consultoria' },
                  { k: 'impostos', label: 'Impostos / Taxas' },
                  { k: 'outras', label: 'Outras despesas' },
                ].map(({ k, label }) => (
                  <div key={k}>
                    <label className="text-xs text-stone-500">{label}</label>
                    <div className="flex items-center mt-1 bg-stone-800 border border-stone-700 rounded-lg px-2 focus-within:border-sky-500">
                      <span className="text-stone-500 text-xs mr-1">R$</span>
                      <input type="number" step="0.01" value={inputs[k]} onChange={e => handleInputChange(k, e.target.value)}
                        className="flex-1 bg-transparent py-1.5 text-sm text-stone-200 outline-none" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-stone-500 border-t border-stone-800 pt-2">
                <span>Total fixos: <span className="text-amber-400 font-semibold">{formatBRL(totalFixos)}</span></span>
                <span>Total fornecedores: <span className="text-sky-400 font-semibold">{formatBRL(totalFornecedores)}</span></span>
              </div>
            </div>
          </div>
        )}

        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-300">Contas a Pagar — {mesLabel}</h2>
            <span className="text-xs text-stone-500">{lancamentos.length} lançamento(s)</span>
          </div>
          {lancamentos.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-stone-500">
              Nenhuma conta lançada. Preencha os inputs acima ou clique em "+ Novo lançamento".
            </div>
          ) : (
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
                  {lancamentos.map(l => (
                    <tr key={l.id} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-stone-300">{l.descricao}</td>
                      <td className="px-3 py-2.5 text-stone-400">{l.categoria}</td>
                      <td className="px-3 py-2.5 text-right text-stone-200 font-medium">{formatBRL(l.valor)}</td>
                      <td className="px-3 py-2.5 text-center text-stone-400">{l.vencimento || '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => toggleStatus(l.id)}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(l.status)}`}>
                          {l.status}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button onClick={() => removeLancamento(l.id)} className="text-stone-600 hover:text-red-400 transition-colors">
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
            <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
              <DollarSign size={15} className="text-sky-400" /> Novo Lançamento
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-stone-500">Descrição</label>
                <input value={modal.descricao} onChange={e => setModal(m => ({...m, descricao: e.target.value}))}
                  className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-stone-500">Valor (R$)</label>
                  <input type="number" step="0.01" value={modal.valor} onChange={e => setModal(m => ({...m, valor: e.target.value}))}
                    className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="text-xs text-stone-500">Vencimento</label>
                  <input type="date" value={modal.vencimento} onChange={e => setModal(m => ({...m, vencimento: e.target.value}))}
                    className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="text-xs text-stone-500">Categoria</label>
                <select value={modal.categoria} onChange={e => setModal(m => ({...m, categoria: e.target.value}))}
                  className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2">
                  {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-stone-500">Status</label>
                <select value={modal.status} onChange={e => setModal(m => ({...m, status: e.target.value}))}
                  className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2">
                  {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={addLancamento} className="flex-1 bg-sky-700 hover:bg-sky-600 text-white text-sm py-2 rounded-lg transition-colors">Salvar</button>
              <button onClick={() => { setShowModal(false); setModal(defaultModal) }}
                className="flex-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm py-2 rounded-lg transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
