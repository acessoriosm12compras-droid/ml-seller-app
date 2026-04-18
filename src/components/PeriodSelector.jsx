import { useSearchParams } from 'react-router-dom'

const OPTIONS = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
]

export default function PeriodSelector() {
  const [params, setParams] = useSearchParams()
  const current = params.get('periodo') || '7d'

  return (
    <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setParams(p => { const np = new URLSearchParams(p); np.set('periodo', value); return np })}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            current === value
              ? 'bg-amber-500 text-gray-950'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
