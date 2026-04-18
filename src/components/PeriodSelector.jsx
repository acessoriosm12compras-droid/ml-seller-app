import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const OPTIONS = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'custom', label: 'Personalizado' },
]

export default function PeriodSelector() {
  const [params, setParams] = useSearchParams()
  const current = params.get('periodo') || '7d'
  const [showCustom, setShowCustom] = useState(current === 'custom')

  function selectPeriod(value) {
    if (value === 'custom') {
      setShowCustom(true)
      return
    }
    setShowCustom(false)
    setParams(p => { const np = new URLSearchParams(p); np.set('periodo', value); np.delete('de'); np.delete('ate'); return np })
  }

  function applyCustom(de, ate) {
    if (!de || !ate) return
    setParams(p => {
      const np = new URLSearchParams(p)
      np.set('periodo', 'custom')
      np.set('de', de)
      np.set('ate', ate)
      return np
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
        {OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => selectPeriod(value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              (current === value || (value === 'custom' && showCustom))
                ? 'bg-amber-500 text-gray-950'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {showCustom && (
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
          <input
            type="date"
            defaultValue={params.get('de') || ''}
            onChange={e => applyCustom(e.target.value, params.get('ate') || '')}
            className="bg-transparent text-gray-200 text-sm focus:outline-none"
          />
          <span className="text-gray-500 text-sm">até</span>
          <input
            type="date"
            defaultValue={params.get('ate') || ''}
            onChange={e => applyCustom(params.get('de') || '', e.target.value)}
            className="bg-transparent text-gray-200 text-sm focus:outline-none"
          />
        </div>
      )}
    </div>
  )
}
