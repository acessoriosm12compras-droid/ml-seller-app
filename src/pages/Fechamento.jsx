import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { api } from '../api'
import Header from '../components/Header'
import { Plus, Trash2, Check, X, Pencil } from 'lucide-react'

function formatBRL(v) {
  if (v === null || v === undefined || v === '') return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function totalOf(rows, field) {
  return rows.reduce((acc, r) => acc + (parseFloat(r[field]) || 0), 0)
}

const STATUS_OPTIONS = ['RECEBIDO', 'PAGO', 'PENDENTE', 'PRÉVIA', 'ENVIADO', 'AGENDADO']

// ── Inline-editable cell ──────────────────────────────────────────────────────
function EditCell({ value, onChange, type = 'text', className = '' }) {
  if (type === 'select') {
    return (
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className={`w-full bg-stone-800 border border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-xs rounded px-1 py-0.5 ${className}`}
      >
        <option value="">—</option>
        {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className={`w-full bg-transparent border-b border-stone-700 focus:border-sky-500 outline-none text-stone-200 text-xs py-0.5 ${className}`}
    />
  )
}

function statusColor(v) {
  if (!v) return 'text-stone-500'
  const u = v.toUpperCase()
  if (u === 'PAGO' || u === 'RECEBIDO') return 'text-emerald-400'
  if (u === 'PENDENTE') return 'text-amber-400'
  if (u === 'PRÉVIA' || u === 'PREVIA') return 'text-sky-400'
  return 'text-stone-400'
}

function StatusBadge({ value }) {
  return <span className={`font-medium ${statusColor(value)}`}>{value || <span className="text-stone-700">—</span>}</span>
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
                <th key={c.key} className={`px-3 py-2.5 text-stone-500 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2.5 w-20" />
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
                        onChange={v => setNewRow(r => c.onChange ? c.onChange(r, v) : { ...r, [c.key]: v })}
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
                  className="group border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors cursor-pointer"
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
                            onChange={v => setEdit(row.id, c.onChange ? c.onChange(editing, v) : { ...editing, [c.key]: v })}
                            className={c.align === 'right' ? 'text-right' : ''}
                          />
                        )
                      ) : (
                        c.type === 'status' ? (
                          <StatusBadge value={row[c.key]} />
                        ) : (
                          <span className={c.color ? c.color(row[c.key]) : 'text-stone-300'}>
                            {c.render ? c.render(row[c.key], row) : (row[c.key] ?? <span className="text-stone-700">—</span>)}
                          </span>
                        )
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
                      <div className="flex gap-1.5 items-center">
                        <Pencil size={12} className="text-stone-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <button onClick={() => onDelete(row.id)} className="text-stone-700 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
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

// ── Donut chart ───────────────────────────────────────────────────────────────
const CHART_COLORS = ['#38bdf8', '#a78bfa', '#fbbf24', '#fb7185']

function CostChart({ totalCompras, totalFretes, totalMontagem, totalDespesas }) {
  const data = [
    { name: 'Compras',    value: totalCompras },
    { name: 'Fretes',     value: totalFretes },
    { name: 'Montagem',   value: totalMontagem },
    { name: 'Despesas',   value: totalDespesas },
  ].filter(d => d.value > 0)

  const total = data.reduce((s, d) => s + d.value, 0)

  if (total === 0) return (
    <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 flex items-center justify-center text-stone-700 text-sm">
      Sem dados para o mês
    </div>
  )

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]
    const pct = ((d.value / total) * 100).toFixed(1)
    return (
      <div className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-xs shadow-lg">
        <p className="font-semibold text-stone-200">{d.name}</p>
        <p style={{ color: d.payload.fill }}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.value)}</p>
        <p className="text-stone-400">{pct}% do total</p>
      </div>
    )
  }

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null
    const RADIAN = Math.PI / 180
    const r = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + r * Math.cos(-midAngle * RADIAN)
    const y = cy + r * Math.sin(-midAngle * RADIAN)
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
        {(percent * 100).toFixed(0)}%
      </text>
    )
  }

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-stone-300 mb-4">Distribuição de Custos</h2>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={105}
            paddingAngle={3}
            dataKey="value"
            labelLine={false}
            label={CustomLabel}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value, entry) => (
              <span style={{ color: entry.color, fontSize: 12 }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
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
  const comprasQ  = useQuery({ queryKey: ['fechamento-compras',  mesAno], queryFn: () => api.fechamento.compras.list(mesAno) })
  const fretesQ   = useQuery({ queryKey: ['fechamento-fretes',   mesAno], queryFn: () => api.fechamento.fretes.list(mesAno) })
  const montagemQ = useQuery({ queryKey: ['fechamento-montagem', mesAno], queryFn: () => api.fechamento.montagem.list(mesAno) })
  const despesasQ = useQuery({ queryKey: ['fechamento-despesas', mesAno], queryFn: () => api.fechamento.despesas.list(mesAno) })

  // Edit maps
  const [comprasEdit,  setComprasEditMap]  = useState({})
  const [fretesEdit,   setFretesEditMap]   = useState({})
  const [montagemEdit, setMontagemEditMap] = useState({})
  const [despesasEdit, setDespesasEditMap] = useState({})

  // New row drafts
  const [newCompra,   setNewCompra]   = useState(null)
  const [newFrete,    setNewFrete]    = useState(null)
  const [newMontagem, setNewMontagem] = useState(null)
  const [newDespesa,  setNewDespesa]  = useState(null)

  function makeSetEdit(setMap) {
    return (id, val) => setMap(m => ({ ...m, [id]: val }))
  }

  const setComprasEdit  = makeSetEdit(setComprasEditMap)
  const setFretesEdit   = makeSetEdit(setFretesEditMap)
  const setMontagemEdit = makeSetEdit(setMontagemEditMap)
  const setDespesasEdit = makeSetEdit(setDespesasEditMap)

  // Mutations — top-level (Rules of Hooks)
  const invCompras  = () => qc.invalidateQueries({ queryKey: ['fechamento-compras',  mesAno] })
  const invFretes   = () => qc.invalidateQueries({ queryKey: ['fechamento-fretes',   mesAno] })
  const invMontagem = () => qc.invalidateQueries({ queryKey: ['fechamento-montagem', mesAno] })
  const invDespesas = () => qc.invalidateQueries({ queryKey: ['fechamento-despesas', mesAno] })

  const saveCompra = useMutation({ mutationFn: ({ id, data }) => id ? api.fechamento.compras.update(id, data)  : api.fechamento.compras.create({ ...data, mes_ano: mesAno }),  onSuccess: invCompras })
  const delCompra  = useMutation({ mutationFn: (id) => api.fechamento.compras.delete(id),  onSuccess: invCompras })
  const saveFrete  = useMutation({ mutationFn: ({ id, data }) => id ? api.fechamento.fretes.update(id, data)   : api.fechamento.fretes.create({ ...data, mes_ano: mesAno }),   onSuccess: invFretes })
  const delFrete   = useMutation({ mutationFn: (id) => api.fechamento.fretes.delete(id),   onSuccess: invFretes })
  const saveMontag = useMutation({ mutationFn: ({ id, data }) => id ? api.fechamento.montagem.update(id, data) : api.fechamento.montagem.create({ ...data, mes_ano: mesAno }), onSuccess: invMontagem })
  const delMontag  = useMutation({ mutationFn: (id) => api.fechamento.montagem.delete(id), onSuccess: invMontagem })
  const saveDesp   = useMutation({ mutationFn: ({ id, data }) => id ? api.fechamento.despesas.update(id, data) : api.fechamento.despesas.create({ ...data, mes_ano: mesAno }), onSuccess: invDespesas })
  const delDesp    = useMutation({ mutationFn: (id) => api.fechamento.despesas.delete(id), onSuccess: invDespesas })

  function handleSave(saveMut, setEditFn, setNew) {
    return (id, data) => {
      saveMut.mutate(
        { id, data },
        { onSuccess: () => { if (id) setEditFn(id, null); else setNew(null) } }
      )
    }
  }

  function handleDelete(delMut) {
    return (id) => { if (confirm('Excluir registro?')) delMut.mutate(id) }
  }

  // Auto-calculate valor_total when qtd or v_unit changes
  function comprasOnChange(row, key, v) {
    const next = { ...row, [key]: v }
    const qtd  = parseFloat(key === 'quantidade'    ? v : next.quantidade)    || 0
    const unit = parseFloat(key === 'valor_unitario' ? v : next.valor_unitario) || 0
    if (qtd && unit) next.valor_total = (qtd * unit).toFixed(2)
    return next
  }

  // Column definitions
  const comprasCols = [
    { key: 'data',          label: 'Data',     type: 'date' },
    { key: 'fornecedor',    label: 'Fornecedor' },
    { key: 'produto',       label: 'Produto' },
    {
      key: 'quantidade', label: 'Qtd', type: 'number', align: 'right',
      render: v => v != null ? <span>{Number(v).toLocaleString('pt-BR')} <span className="text-stone-600 text-[10px]">un</span></span> : <span className="text-stone-700">—</span>,
      onChange: (row, v) => comprasOnChange(row, 'quantidade', v),
    },
    {
      key: 'valor_unitario', label: 'V. Unit.', type: 'number', align: 'right',
      render: v => formatBRL(v), color: () => 'text-stone-300',
      onChange: (row, v) => comprasOnChange(row, 'valor_unitario', v),
    },
    { key: 'valor_total',   label: 'Total',   type: 'number', align: 'right',
      render: v => formatBRL(v), color: () => 'text-sky-400 font-semibold' },
    { key: 'status',        label: 'Status',  type: 'select',
      color: v => statusColor(v) },
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
      render: v => formatBRL(v), color: () => 'text-violet-400 font-semibold' },
    { key: 'status',     label: 'Status', type: 'select',
      color: v => statusColor(v) },
  ]

  const montagemCols = [
    { key: 'data',     label: 'Data',     type: 'date' },
    { key: 'montador', label: 'Montador' },
    { key: 'valor',    label: 'Valor', type: 'number', align: 'right',
      render: v => formatBRL(v), color: () => 'text-amber-400 font-semibold' },
  ]

  const despesasCols = [
    { key: 'data',      label: 'Data',     type: 'date' },
    { key: 'descricao', label: 'Descrição' },
    { key: 'valor',     label: 'Valor', type: 'number', align: 'right',
      render: v => formatBRL(v), color: () => 'text-rose-400 font-semibold' },
    { key: 'status',    label: 'Status', type: 'select',
      color: v => statusColor(v) },
  ]

  // Totals
  const compras  = comprasQ.data  || []
  const fretes   = fretesQ.data   || []
  const montagem = montagemQ.data || []
  const despesas = despesasQ.data || []

  const totalCompras  = totalOf(compras,  'valor_total')
  const totalFretes   = totalOf(fretes,   'total')
  const totalMontagem = totalOf(montagem, 'valor')
  const totalDespesas = totalOf(despesas, 'valor')
  const totalGeral    = totalCompras + totalFretes + totalMontagem + totalDespesas

  const isLoading = comprasQ.isLoading || fretesQ.isLoading || montagemQ.isLoading || despesasQ.isLoading
  const refetchAll = () => { comprasQ.refetch(); fretesQ.refetch(); montagemQ.refetch(); despesasQ.refetch() }

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

        {/* KPIs + Pie chart */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* KPI stack */}
          <div className="xl:col-span-2 grid grid-cols-2 sm:grid-cols-2 gap-4 content-start">
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
            <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-rose-500 rounded-xl p-4">
              <p className="text-xs text-stone-500">Despesas Variáveis</p>
              <p className="text-xl font-bold text-rose-400">{formatBRL(totalDespesas)}</p>
            </div>
            <div className="bg-stone-900 border border-stone-800 border-l-4 border-l-emerald-500 rounded-xl p-4 sm:col-span-2">
              <p className="text-xs text-stone-500">Total Geral</p>
              <p className="text-2xl font-bold text-emerald-400">{formatBRL(totalGeral)}</p>
            </div>
          </div>

          {/* Pie chart */}
          <CostChart
            totalCompras={totalCompras}
            totalFretes={totalFretes}
            totalMontagem={totalMontagem}
            totalDespesas={totalDespesas}
          />
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
          onAdd={() => setNewCompra({ data: '', fornecedor: '', produto: '', quantidade: '', valor_unitario: '', valor_total: '', status: 'PENDENTE', nota: '' })}
          onSave={handleSave(saveCompra, setComprasEdit, setNewCompra)}
          onDelete={handleDelete(delCompra)}
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
          onAdd={() => setNewFrete({ data: '', motorista: '', coleta_sp: false, frete_full: '', total: '', status: 'PENDENTE' })}
          onSave={handleSave(saveFrete, setFretesEdit, setNewFrete)}
          onDelete={handleDelete(delFrete)}
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
          onSave={handleSave(saveMontag, setMontagemEdit, setNewMontagem)}
          onDelete={handleDelete(delMontag)}
        />

        {/* Despesas Variáveis */}
        <Section
          title="Despesas Variáveis"
          columns={despesasCols}
          rows={despesas}
          isLoading={despesasQ.isLoading}
          editMap={despesasEdit}
          setEdit={setDespesasEdit}
          newRow={newDespesa}
          setNewRow={setNewDespesa}
          onAdd={() => setNewDespesa({ data: '', descricao: '', valor: '', status: 'PENDENTE' })}
          onSave={handleSave(saveDesp, setDespesasEdit, setNewDespesa)}
          onDelete={handleDelete(delDesp)}
        />

      </main>
    </div>
  )
}
