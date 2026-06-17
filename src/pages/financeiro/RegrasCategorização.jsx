import { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'

const CATEGORIAS = [
  'Receita ML','Fornecedor','Folha de Pagamento','Aluguel','Marketing / Ads',
  'Logistica','Contador','Impostos','Tarifas Bancarias','Interno','Outros'
]

const CONTAS = ['C/C Principal','Mercado Pago','Outras']
const TIPOS = ['Entrada','Saida']

const defaultRegras = [
  { id: 1, palavra: 'ML REPASSE', tipo: 'Entrada', categoria: 'Receita ML', conta: 'C/C Principal' },
  { id: 2, palavra: 'MERCADO PAGO', tipo: 'Entrada', categoria: 'Receita ML', conta: 'C/C Principal' },
  { id: 3, palavra: 'FOLHA / SALARIO', tipo: 'Saida', categoria: 'Folha de Pagamento', conta: 'C/C Principal' },
  { id: 4, palavra: 'FORNECEDOR / COMPRA', tipo: 'Saida', categoria: 'Fornecedor', conta: 'C/C Principal' },
  { id: 5, palavra: 'ALUGUEL', tipo: 'Saida', categoria: 'Aluguel', conta: 'C/C Principal' },
  { id: 6, palavra: 'ADS / PUBLICIDADE', tipo: 'Saida', categoria: 'Marketing / Ads', conta: 'C/C Principal' },
  { id: 7, palavra: 'IOF / TARIFA', tipo: 'Saida', categoria: 'Tarifas Bancarias', conta: 'C/C Principal' },
]

const defaultForm = { palavra: '', tipo: 'Entrada', categoria: 'Receita ML', conta: 'C/C Principal' }

export default function RegrasCategorização() {
  const { activeAccount } = useAuth()
  const storageKey = `fin_regras_${activeAccount || 'default'}`
  const [regras, setRegras] = useState(defaultRegras)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [editId, setEditId] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setRegras(JSON.parse(raw))
    } catch {}
  }, [storageKey])

  function save(nr) {
    localStorage.setItem(storageKey, JSON.stringify(nr))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleAdd() {
    if (!form.palavra.trim()) return
    let nr
    if (editId !== null) {
      nr = regras.map(r => r.id === editId ? { ...r, ...form } : r)
      setEditId(null)
    } else {
      nr = [...regras, { ...form, id: Date.now() }]
    }
    setRegras(nr)
    save(nr)
    setForm(defaultForm)
    setShowForm(false)
  }

  function handleEdit(r) {
    setForm({ palavra: r.palavra, tipo: r.tipo, categoria: r.categoria, conta: r.conta })
    setEditId(r.id)
    setShowForm(true)
  }

  function handleDelete(id) {
    const nr = regras.filter(r => r.id !== id)
    setRegras(nr)
    save(nr)
  }

  function handleCancel() {
    setForm(defaultForm)
    setEditId(null)
    setShowForm(false)
  }

  const tipoColor = t => t === 'Entrada' ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Regras de Categorizacao" />
      <main className="flex-1 p-3 sm:p-6 space-y-6 overflow-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-stone-500">
            Quando um movimento e importado, o sistema verifica as palavras-chave abaixo e categoriza automaticamente.
          </p>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-emerald-400">Salvo</span>}
            <button onClick={() => { setShowForm(s => !s); setEditId(null); setForm(defaultForm) }}
              className="flex items-center gap-1.5 text-xs bg-sky-700 hover:bg-sky-600 text-white px-3 py-1.5 rounded-lg transition-colors">
              <Plus size={13} /> Nova regra
            </button>
          </div>
        </div>
        {showForm && (
          <div className="bg-stone-900 border border-sky-500/30 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-stone-300 mb-4">
              {editId !== null ? 'Editar regra' : 'Nova regra de categorizacao'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-stone-500">Palavra-chave</label>
                <input value={form.palavra} onChange={e => setForm(f => ({...f, palavra: e.target.value}))}
                  placeholder="ex: ML REPASSE"
                  className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2 uppercase placeholder:normal-case placeholder:text-stone-600" />
              </div>
              <div>
                <label className="text-xs text-stone-500">Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({...f, tipo: e.target.value}))}
                  className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2">
                  {TIPOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-stone-500">Categoria</label>
                <select value={form.categoria} onChange={e => setForm(f => ({...f, categoria: e.target.value}))}
                  className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2">
                  {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-stone-500">Conta</label>
                <select value={form.conta} onChange={e => setForm(f => ({...f, conta: e.target.value}))}
                  className="mt-1 w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-sm rounded-lg px-3 py-2">
                  {CONTAS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button onClick={handleAdd}
                className="flex items-center gap-1.5 text-xs bg-sky-700 hover:bg-sky-600 text-white px-4 py-1.5 rounded-lg transition-colors">
                <Check size={13} /> {editId !== null ? 'Salvar alteracoes' : 'Adicionar regra'}
              </button>
              <button onClick={handleCancel}
                className="flex items-center gap-1.5 text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 px-4 py-1.5 rounded-lg transition-colors">
                <X size={13} /> Cancelar
              </button>
            </div>
          </div>
        )}
        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-300">Regras ativas</h2>
            <span className="text-xs text-stone-500">{regras.length} regra(s)</span>
          </div>
          {regras.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-stone-500">Nenhuma regra configurada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-stone-800">
                    <th className="px-3 py-2.5 text-left text-stone-500 font-medium">Palavra-chave</th>
                    <th className="px-3 py-2.5 text-center text-stone-500 font-medium">Tipo</th>
                    <th className="px-3 py-2.5 text-left text-stone-500 font-medium">Categoria</th>
                    <th className="px-3 py-2.5 text-left text-stone-500 font-medium">Conta</th>
                    <th className="px-3 py-2.5 text-center text-stone-500 font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {regras.map(r => (
                    <tr key={r.id} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-stone-200 font-mono">{r.palavra}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tipoColor(r.tipo)}`}>{r.tipo}</span>
                      </td>
                      <td className="px-3 py-2.5 text-stone-300">{r.categoria}</td>
                      <td className="px-3 py-2.5 text-stone-400">{r.conta}</td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => handleEdit(r)} className="text-stone-500 hover:text-sky-400 transition-colors"><Pencil size={12} /></button>
                          <button onClick={() => handleDelete(r.id)} className="text-stone-500 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="bg-stone-900/50 border border-stone-800 rounded-xl p-4 text-xs text-stone-500 space-y-1">
          <p className="font-medium text-stone-400">Como funciona:</p>
          <p>As regras sao verificadas na ordem em que aparecem. A primeira correspondencia vence.</p>
          <p>A comparacao e feita na descricao do extrato bancario.</p>
          <p>Movimentos sem correspondencia ficam como "Sem categoria" para revisao manual.</p>
        </div>
      </main>
    </div>
  )
}
