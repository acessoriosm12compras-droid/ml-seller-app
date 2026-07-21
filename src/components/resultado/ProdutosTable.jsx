import { useState } from 'react'
import { downloadCSV, todayStr } from '../../lib/exportCSV'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function fmtNum(v) {
  if (v === null || v === undefined) return ''
  return String(v).replace('.', ',')
}

// Valor por unidade que a ML banca na promoção ativa — diferença entre o
// preço riscado e o vigente, multiplicada pelo percentual de subsídio.
// null quando falta algum dos três dados ou não há desconto ativo agora.
function valorSubsidioMl(p) {
  if (p.rebate_meli_percent == null || p.preco_original == null || p.preco_atual == null) return null
  if (p.preco_original <= p.preco_atual) return null
  return (p.preco_original - p.preco_atual) * (p.rebate_meli_percent / 100)
}

function MargemBadge({ value }) {
  if (value === null || value === undefined) return <span className="text-stone-400">—</span>
  const [cls, bg] = value >= 30
    ? ['text-emerald-600', 'bg-emerald-500/10']
    : value >= 15
    ? ['text-sky-600', 'bg-sky-500/10']
    : ['text-red-600', 'bg-red-500/10']
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls} ${bg}`}>
      {value.toFixed(1)}%
    </span>
  )
}

const COLUMNS = [
  { key: 'titulo', label: 'Produto', align: 'left' },
  { key: 'preco_medio', label: 'Preço Médio', align: 'right' },
  { key: 'custo_unitario', label: 'Custo Unit.', align: 'right' },
  { key: 'unidades', label: 'Unidades', align: 'right' },
  { key: 'total_faturado', label: 'Total Faturado', align: 'right' },
  { key: 'representatividade', label: 'Represent.', align: 'right' },
  { key: 'lucro', label: 'Lucro', align: 'right' },
  { key: 'margem', label: 'Margem', align: 'center' },
  { key: 'custo_ads', label: 'Custo ADS', align: 'right' },
  { key: 'lucro_pos_ads', label: 'Lucro pós ADS', align: 'right' },
  { key: 'mpa', label: 'MPA', align: 'center' },
  { key: 'rebate_meli_percent', label: 'SUBS. ML (R$)', align: 'center' },
]

export default function ProdutosTable({ produtos, titulo = 'top-produtos' }) {
  const [sortKey, setSortKey] = useState('total_faturado')
  const [sortDir, setSortDir] = useState('desc')

  function handleExport() {
    const headers = [
      'SKU', 'Produto', 'Preço Médio', 'Custo Unitário', 'Unidades',
      'Total Faturado', 'Representatividade %', 'Lucro', 'Margem %',
      'Custo ADS', 'Lucro pós ADS', 'MPA %', 'SUBS. ML (R$)',
    ]
    const rows = sorted.map((p) => [
      p.sku || p.ml_item_id,
      p.titulo,
      fmtNum(p.preco_medio),
      fmtNum(p.custo_unitario),
      p.unidades,
      fmtNum(p.total_faturado),
      fmtNum(p.representatividade),
      fmtNum(p.lucro),
      fmtNum(p.margem),
      fmtNum(p.custo_ads),
      fmtNum(p.lucro_pos_ads),
      fmtNum(p.mpa),
      fmtNum(valorSubsidioMl(p)),
    ])
    downloadCSV(`${titulo}-${todayStr()}.csv`, headers, rows)
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...produtos].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    if (typeof av === 'string') {
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    return sortDir === 'asc' ? av - bv : bv - av
  })

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <div className="flex justify-end px-4 py-2 border-b border-stone-200">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-emerald-600 transition-colors"
          title="Exportar tabela como CSV"
        >
          <span>⬇</span>
          <span>Exportar CSV</span>
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-stone-100 text-stone-600 border-b border-stone-200">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-4 py-3 font-semibold cursor-pointer select-none hover:text-stone-900 transition-colors ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      <span className="text-xs text-sky-400">
                        {sortDir === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.ml_item_id} className="border-b border-stone-100 hover:bg-stone-50">
                {/* Produto */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {p.foto_capa ? (
                      <img
                        src={p.foto_capa}
                        alt=""
                        className="w-9 h-9 rounded object-cover shrink-0 border border-stone-200"
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-9 h-9 rounded shrink-0 bg-stone-100 border border-stone-200" />
                    )}
                    <div className="min-w-0">
                      <p className="text-stone-800 truncate max-w-[200px]">{p.titulo}</p>
                      <p className="text-stone-400 text-xs">{p.sku || p.ml_item_id}</p>
                    </div>
                  </div>
                </td>
                {/* Preço Médio (histórico do período) + preço vigente hoje, se tiver promoção ativa */}
                <td className="px-4 py-3 text-right text-stone-700">
                  {formatBRL(p.preco_medio)}
                  {p.preco_original != null && p.preco_atual != null && p.preco_original > p.preco_atual && (
                    <div className="text-xs mt-0.5 whitespace-nowrap">
                      <span className="text-stone-400">hoje: </span>
                      <span className="line-through text-stone-400">{formatBRL(p.preco_original)}</span>
                      {' '}
                      <span className="text-emerald-600 font-medium">{formatBRL(p.preco_atual)}</span>
                    </div>
                  )}
                </td>
                {/* Custo Unit. */}
                <td className="px-4 py-3 text-right">
                  {p.custo_unitario === null || p.custo_unitario === undefined
                    ? <span className="text-red-500 text-xs">sem custo</span>
                    : <span className="text-stone-700">{formatBRL(p.custo_unitario)}</span>
                  }
                </td>
                {/* Unidades */}
                <td className="px-4 py-3 text-right text-stone-700">
                  {p.unidades?.toLocaleString('pt-BR') ?? '—'}
                </td>
                {/* Total Faturado */}
                <td className="px-4 py-3 text-right text-stone-700">
                  {formatBRL(p.total_faturado)}
                </td>
                {/* Representatividade */}
                <td className="px-4 py-3 text-right">
                  <span className="text-stone-700">
                    {p.representatividade !== null && p.representatividade !== undefined
                      ? `${p.representatividade.toFixed(1)}%`
                      : '—'
                    }
                  </span>
                  {p.representatividade !== null && p.representatividade !== undefined && (
                    <div className="mt-1 h-0.5 bg-stone-200 rounded-full w-full">
                      <div
                        className="h-0.5 bg-sky-500/60 rounded-full"
                        style={{ width: `${Math.min(p.representatividade, 100)}%` }}
                      />
                    </div>
                  )}
                </td>
                {/* Lucro */}
                <td className="px-4 py-3 text-right">
                  {p.lucro === null || p.lucro === undefined
                    ? <span className="text-stone-400">—</span>
                    : <span className={p.lucro >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                        {formatBRL(p.lucro)}
                      </span>
                  }
                </td>
                {/* Margem */}
                <td className="px-4 py-3 text-center">
                  <MargemBadge value={p.margem} />
                </td>
                {/* Custo ADS */}
                <td className="px-4 py-3 text-right text-stone-600">
                  {formatBRL(p.custo_ads)}
                </td>
                {/* Lucro pós ADS */}
                <td className="px-4 py-3 text-right">
                  {p.lucro_pos_ads === null || p.lucro_pos_ads === undefined
                    ? <span className="text-stone-400">—</span>
                    : <span className={p.lucro_pos_ads >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                        {formatBRL(p.lucro_pos_ads)}
                      </span>
                  }
                </td>
                {/* MPA */}
                <td className="px-4 py-3 text-center">
                  {p.mpa === null || p.mpa === undefined
                    ? <span className="text-stone-400">—</span>
                    : <MargemBadge value={p.mpa} />
                  }
                </td>
                {/* SUBS. ML — valor por unidade que a ML banca na promoção ativa */}
                <td className="px-4 py-3 text-center">
                  {valorSubsidioMl(p) !== null ? (
                    <span
                      className="inline-block px-2 py-0.5 rounded text-xs font-medium text-sky-600 bg-sky-500/10"
                      title={`ML banca ${p.rebate_meli_percent}% do desconto de ${formatBRL(p.preco_original - p.preco_atual)}`}
                    >
                      {formatBRL(valorSubsidioMl(p))}
                    </span>
                  ) : (
                    <span className="text-stone-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
