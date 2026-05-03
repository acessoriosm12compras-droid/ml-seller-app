import { useState } from 'react'

function formatBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function MargemBadge({ value }) {
  if (value === null || value === undefined) return <span className="text-gray-600">—</span>
  const [cls, bg] = value >= 30
    ? ['text-emerald-400', 'bg-emerald-500/10']
    : value >= 15
    ? ['text-amber-400', 'bg-amber-500/10']
    : ['text-red-400', 'bg-red-500/10']
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
]

export default function ProdutosTable({ produtos }) {
  const [sortKey, setSortKey] = useState('total_faturado')
  const [sortDir, setSortDir] = useState('desc')

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
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/50 text-gray-500 border-b border-gray-800">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-300 transition-colors text-${col.align}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      <span className="text-xs text-amber-400">
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
              <tr key={p.item_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                {/* Produto */}
                <td className="px-4 py-3">
                  <p className="text-gray-200 truncate max-w-[200px]">{p.titulo}</p>
                  <p className="text-gray-600 text-xs">{p.item_id}</p>
                </td>
                {/* Preço Médio */}
                <td className="px-4 py-3 text-right text-gray-300">
                  {formatBRL(p.preco_medio)}
                </td>
                {/* Custo Unit. */}
                <td className="px-4 py-3 text-right">
                  {p.custo_unitario === null || p.custo_unitario === undefined
                    ? <span className="text-red-400 text-xs">sem custo</span>
                    : <span className="text-gray-300">{formatBRL(p.custo_unitario)}</span>
                  }
                </td>
                {/* Unidades */}
                <td className="px-4 py-3 text-right text-gray-300">
                  {p.unidades?.toLocaleString('pt-BR') ?? '—'}
                </td>
                {/* Total Faturado */}
                <td className="px-4 py-3 text-right text-gray-300">
                  {formatBRL(p.total_faturado)}
                </td>
                {/* Representatividade */}
                <td className="px-4 py-3 text-right">
                  <span className="text-gray-300">
                    {p.representatividade !== null && p.representatividade !== undefined
                      ? `${p.representatividade.toFixed(1)}%`
                      : '—'
                    }
                  </span>
                  {p.representatividade !== null && p.representatividade !== undefined && (
                    <div className="mt-1 h-0.5 bg-gray-800 rounded-full w-full">
                      <div
                        className="h-0.5 bg-amber-500/60 rounded-full"
                        style={{ width: `${Math.min(p.representatividade, 100)}%` }}
                      />
                    </div>
                  )}
                </td>
                {/* Lucro */}
                <td className="px-4 py-3 text-right">
                  {p.lucro === null || p.lucro === undefined
                    ? <span className="text-gray-600">—</span>
                    : <span className={p.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {formatBRL(p.lucro)}
                      </span>
                  }
                </td>
                {/* Margem */}
                <td className="px-4 py-3 text-center">
                  <MargemBadge value={p.margem} />
                </td>
                {/* Custo ADS */}
                <td className="px-4 py-3 text-right text-gray-400">
                  {formatBRL(p.custo_ads)}
                </td>
                {/* Lucro pós ADS */}
                <td className="px-4 py-3 text-right">
                  {p.lucro_pos_ads === null || p.lucro_pos_ads === undefined
                    ? <span className="text-gray-600">—</span>
                    : <span className={p.lucro_pos_ads >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {formatBRL(p.lucro_pos_ads)}
                      </span>
                  }
                </td>
                {/* MPA */}
                <td className="px-4 py-3 text-center">
                  {p.mpa === null || p.mpa === undefined
                    ? <span className="text-gray-600">—</span>
                    : <MargemBadge value={p.mpa} />
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
