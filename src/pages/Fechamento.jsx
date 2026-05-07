import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'
import { Plus, Trash2, Check, X } from 'lucide-react'

function formatBRL(v) {
  if (v === null || v === undefined || v === '') return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function parseBRL(s) {
  if (!s) return null
  const cleaned = String(s).replace(/[^\d,.-]/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function totalOf(rows, field) {
  return rows.reduce((acc, r) => acc + (parseFloat(r[field]) || 0), 0)
}

// ── Inline-editable cell ──────────────────────────────────────────────────────
function EditCell({ value, onChange, type = 'text', className = '' }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className={`w-full bg-transparent border-b border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-xs py-0.5 ${className}`}
    />
  )
}

// ── Generic section component ─────────────────────────────────────────────────
function Section({ title, columns, rows, isLoading, onAdd, onSave, onDelete, newRow, setNewRow, editMap, setEdit }) {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800">
        <h2 className="text-sm font-semibold text-stone-300">{title}</h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 text-xs bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={13} /> Adicionar
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-stone-800">
              {columns.map(c => (
                <th key={c.key} className={`px-3 py-2.5 text-stone-500 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2.5 w-16" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-stone-600">Carregando…</td></tr>
            )}

            {/* New row form */}
            {newRow && (
              <tr className="border-b border-stone-800 bg-sky-500/5">
                {columns.map(c => (
                  <td key={c.key} className="px-3 py-2">
                    {c.type === 'bool' ? (
                      <input
                        type="checkbox"
                        checked={!!newRow[c.key]}
                        onChange={e => setNewRow(r => ({ ...r, [c.key]: e.target.checked }))}
                        className="accent-sky-500"
                      />
                    ) : (
                      <EditCell
                        value={newRow[c.key]}
                        type={c.type || 'text'}
                        onChange={v => setNewRow(r => ({ ...r, [c.key]: v }))}
                        className={c.align === 'right' ? 'text-right' : ''}
                      />
                    )}
                  </td>
                ))}
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => onSave(null, newRow)} className="text-emerald-400 hover:text-emerald-300"><Check size={14} /></button>
                    <button onClick={() => setNewRow(null)} className="text-red-400 hover:text-red-300"><X size={14} /></button>
                  </div>
                </td>
              </tr>
            )}

            {/* Existing rows */}
            {rows.map(row => {
              const editing = editMap[row.id]
              return (
                <tr
                  key={row.id}
                  className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors cursor-pointer"
                  onClick={() => !editing && setEdit(row.id, row)}
                >
                  {columns.map(c => (
                    <td key={c.key} className={`px-3 py-2.5 ${c.align === 'right' ? 'text-right' : ''}`}>
                      {editing ? (
                        c.type === 'bool' ? (
                          <input
                            type="checkbox"
                            checked={!!editing[c.key]}
                            onChange={e => setEdit(row.id, { ...editing, [c.key]: e.target.checked })}
                            className="accent-sky-500"
                          />
                        ) : (
                          <EditCell
                            value={editing[c.key]}
                            type={c.type || 'text'}
                            onChange={v => setEdit(row.id, { ...editing, [c.key]: v })}
                            className={c.align === 'right' ? 'text-right' : ''}
                          />
                        )
                      ) : (
                        <span className={c.color ? c.color(row[c.key]) : 'text-stone-300'}>
                          {c.render ? c.render(row[c.key], row) : (row[c.key] ?? <span className="text-stone-700">—</span>)}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    {editing ? (
                      <div className="flex gap-1">
                        <button onClick={() => onSave(row.id, editing)} className="text-emerald-400 hover:text-emerald-300"><Check size={14} /></button>
                        <button onClick={() => setEdit(row.id, null)} className="text-stone-600 hover:text-stone-400"><X size={14} /></button>
                      </div>
                    ) : (
                      <button onClick={() => onDelete(row.id)} className="text-stone-700 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}

            {!isLoading && rows.length === 0 && !newRow && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-stone-700">Nenhum registro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Fechamento() {
  const now = new Date()
  const [mesAno, setMesAno] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  )

  const qc = useQueryClient()

  // Queries
  const comprasQ = useQuery({ queryKey: ['fechamento-compras', mesAno], queryFn: () => api.fechamento.compras.list(mesAno) })
  const fretesQ  = useQuery({ queryKey: ['fechamento-fretes',  mesAno], queryFn: () => api.fechamento.fretes.list(mesAno) })
  const montagemQ = useQuery({ queryKey: ['fechamento-montagem', mesAno], queryFn: () => api.fechamento.montagem.list(mesAno) })

  // Edit maps {id: draftRow | null}
  const [comprasEdit,  setComprasEditMap]  = useState({})
  const [fretesEdit,   setFretesEditMap]   = useState({})
  const [montagemEdit, setMontagemEditMap] = useState({})

  // New row drafts
  const [newCompra,   setNewCompra]   = useState(null)
  const [newFrete,    setNewFrete]    = useState(null)
  const [newMontagem, setNewMontagem] = useState(null)

  function makeSetEdit(map, setMap) {
    return (id, val) => setMap(m => ({ ...m, [id]: val }))
  }

  const setComprasEdit  = makeSetEdit(comprasEdit,  setComprasEditMap)
  const setFretesEdit   = makeSetEdit(fretesEdit,   setFretesEditMap)
  const setMontagemEdit = makeSetEdit(montagemEdit, setMontagemEditMap)

  // Mutations — must be at top level (Rules of Hooks)
  const invCompras  = () => qc.invalidateQueries({ queryKey: ['fechamento-compras',  mesAno] })
  const invFretes   = () => qc.invalidateQueries({ queryKey: ['fechamento-fretes',   mesAno] })
  const invMontagem = () => qc.invalidateQueries({ queryKey: ['fechamento-montagem', mesAno] })

  const saveCompra  = useMutation({ mutationFn: ({ id, data }) => id ? api.fechamento.compras.update(id, data)  : api.fechamento.compras.create({ ...data, mes_ano: mesAno }),  onSuccess: invCompras })
  const delCompra   = useMutation({ mutationFn: (id) => api.fechamento.compras.delete(id),  onSuccess: invCompras })
  const saveFrete   = useMutation({ mutationFn: ({ id, data }) => id ? api.fechamento.fretes.update(id, data)   : api.fechamento.fretes.create({ ...data, mes_ano: mesAno }),   onSuccess: invFretes })
  const delFrete    = useMutation({ mutationFn: (id) => api.fechamento.fretes.delete(id),   onSuccess: invFretes })
  const saveMontag  = useMutation({ mutationFn: ({ id, data }) => id ? api.fechamento.montagem.update(id, data) : api.fechamento.montagem.create({ ...data, mes_ano: mesAno }), onSuccess: invMontagem })
  const delMontag   = useMutation({ mutationFn: (id) => api.fechamento.montagem.delete(id), onSuccess: invMontagem })

  const comprasMut  = { save: saveCompra,  del: delCompra }
  const fretesMut   = { save: saveFrete,   del: delFrete }
  const montagemMut = { save: saveMontag,  del: delMontag }

  function handleSave(mutations, editMap, setEditFn, setNew) {
    return (id, data) => {
      // Clean numeric fields (strip BRL formatting if typed manually)
      mutations.save.mutate(
        { id, data },
        { onSuccess: () => { if (id) setEditFn(id, null); else setNew(null) } }
      )
    }
  }

  function handleDelete(mutations) {
    return (id) => { if (confirm('Excluir registro?')) mutations.del.mutate(id) }
  }

  // Column definitions
  const comprasCols = [
    { key: 'data',          label: 'Data',          type: 'date' },
    { key: 'fornecedor',    label: 'Fornecedor' },
    { key: 'nota_fiscal',   label: 'NF' },
    { key: 'produto',       label: 'Produto' },
    { key: 'quantidade',    label: 'Qtd',   type: 'number', align: 'right' },
    { key: 'valor_unitario', label: 'V. Unit.', type: 'number', align: 'right',
      render: v => formatBRL(v), color: () => 'text-stone-300' },
    { key: 'valor_total',   label: 'Total',   type: 'number', align: 'right',
      render: v => formatBRL(v), color: () => 'text-sky-400 font-semibold' },
    { key: 'status',        label: 'Status',
      color: v => v === 'Pago' ? 'text-emerald-400' : v === 'Pendente' ? 'text-amber-400' : 'text-stone-400' },
    { key: 'nota',          label: 'Obs.' },
  ]

  const fretesCols = [
    { key: 'data',       label: 'Data',      type: 'date' },
    { key: 'motorista',  label: 'Motorista' },
    { key: 'coleta_sp',  label: 'Coleta SP', type: 'bool',
      render: v => v ? <span className="text-emerald-400">Sim</span> : <span className="text-stone-600">Não</span> },
    { key: 'frete_full', label: 'Frete Full', type: 'number', align: 'right',
      render: v => formatBRL(v), color: () => 'text-stone-300' },
    { key: 'total',      label: 'Total', type: 'number', align: 'right',
      render: v => formatBRL(v), color: () => 'text-sky-400 font-semibold' },
    { key: 'status',     label: 'Status',
      color: v => v === 'Pago' ? 'text-emerald-400' : v === 'Pendente' ? 'text-amber-400' : 'text-stone-400' },
  ]

  const montagemCols = [
    { key: 'data',     label: 'Data',     type: 'date' },
    { key: 'montador', label: 'Montador' },
    { key: 'valor',    label: 'Valor', type: 'number', align: 'right',
      render: v => formatBRL(v), color: () => 'text-sky-400 font-semibold' },
  ]

  // Totals
  const compras  = comprasQ.data  || []
  const fretes   = fretesQ.data   || []
  const montagem = montagemQ.data || []

  const totalCompras  = totalOf(compras,  'valor_total')
  const totalFretes   = totalOf(fretes,   'total')
  const totalMontagem = totalOf(montagem, 'valor')
  const totalGeral    = totalCompras + totalFretes + totalMontagem

  const refetchAll = () => {
    comprasQ.refetch(); fretesQ.refetch(); montagemQ.refetch()
  }

  const isLoading = comprasQ.isLoading || fretesQ.isLoading || montagemQ.isLoading

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Fechamento YUSO" onRefresh={refetchAll} isLoading={isLoading} />

      <main className="flex-1 p-3 sm:p-6 space-y-6 overflow-auto">

        {/* Month selector */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-stone-500">Mês/Ano</label>
          <input
            type="month"
            value={mesAno}
            onChange={e => setMesAno(e.target.value)}
            className="bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-sky-500 rounded-xl p-4">
            <p className="text-xs text-stone-500">Total Compras</p>
            <p className="text-xl font-bold text-sky-400">{formatBRL(totalCompras)}</p>
          </div>
          <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-violet-500 rounded-xl p-4">
            <p className="text-xs text-stone-500">Total Fretes</p>
            <p className="text-xl font-bold text-violet-400">{formatBRL(totalFretes)}</p>
          </div>
          <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-amber-500 rounded-xl p-4">
            <p className="text-xs text-stone-500">Total Montagem</p>
            <p className="text-xl font-bold text-amber-400">{formatBRL(totalMontagem)}</p>
          </div>
          <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-emerald-500 rounded-xl p-4">
            <p className="text-xs text-stone-500">Total Geral</p>
            <p className="text-xl font-bold text-emerald-400">{formatBRL(totalGeral)}</p>
          </div>
        </div>

        {/* Compras */}
        <Section
          title="Compras"
          columns={comprasCols}
          rows={compras}
          isLoading={comprasQ.isLoading}
          editMap={comprasEdit}
          setEdit={setComprasEdit}
          newRow={newCompra}
          setNewRow={setNewCompra}
          onAdd={() => setNewCompra({ data: '', fornecedor: '', nota_fiscal: '', produto: '', quantidade: '', valor_unitario: '', valor_total: '', status: '', nota: '' })}
          onSave={handleSave(comprasMut, comprasEdit, setComprasEdit, setNewCompra)}
          onDelete={handleDelete(comprasMut)}
        />

        {/* Fretes */}
        <Section
          title="Fretes"
          columns={fretesCols}
          rows={fretes}
          isLoading={fretesQ.isLoading}
          editMap={fretesEdit}
          setEdit={setFretesEdit}
          newRow={newFrete}
          setNewRow={setNewFrete}
          onAdd={() => setNewFrete({ data: '', motorista: '', coleta_sp: false, frete_full: '', total: '', status: '' })}
          onSave={handleSave(fretesMut, fretesEdit, setFretesEdit, setNewFrete)}
          onDelete={handleDelete(fretesMut)}
        />

        {/* Montagem */}
        <Section
          title="Montagem"
          columns={montagemCols}
          rows={montagem}
          isLoading={montagemQ.isLoading}
          editMap={montagemEdit}
          setEdit={setMontagemEdit}
          newRow={newMontagem}
          setNewRow={setNewMontagem}
          onAdd={() => setNewMontagem({ data: '', montador: '', valor: '' })}
          onSave={handleSave(montagemMut, montagemEdit, setMontagemEdit, setNewMontagem)}
          onDelete={handleDelete(montagemMut)}
        />

      </main>
    </div>
  )
}
