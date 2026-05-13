import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

const OPTIONS = [
  { value: 'hoje',   label: 'Hoje' },
  { value: 'ontem',  label: 'Ontem' },
  { value: '7d',     label: 'Últimos 7 dias' },
  { value: '15d',    label: 'Últimos 15 dias' },
  { value: '20d',    label: 'Últimos 20 dias' },
  { value: '30d',    label: 'Últimos 30 dias' },
  { value: 'custom', label: 'Personalizado' },
]

function currentLabel(params) {
  const p = params.get('periodo') || 'hoje'
  if (p === 'custom') {
    const de = params.get('de')
    const ate = params.get('ate')
    if (de && ate) return `${de} → ${ate}`
    return 'Personalizado'
  }
  return OPTIONS.find(o => o.value === p)?.label ?? p
}

export default function PeriodSelector() {
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customDe, setCustomDe] = useState(params.get('de') || '')
  const [customAte, setCustomAte] = useState(params.get('ate') || '')
  const ref = useRef(null)

  const current = params.get('periodo') || 'hoje'

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        if (current !== 'custom') setShowCustom(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [current])

  function select(value) {
    if (value === 'custom') {
      setShowCustom(true)
      return
    }
    setShowCustom(false)
    setOpen(false)
    setCustomDe('')
    setCustomAte('')
    setParams(p => {
      const np = new URLSearchParams(p)
      np.set('periodo', value)
      np.delete('de')
      np.delete('ate')
      return np
    })
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
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 bg-stone-800 border border-stone-700 rounded-lg px-2.5 py-1.5 text-sm text-stone-300 hover:text-stone-100 hover:border-stone-600 transition-colors whitespace-nowrap"
      >
        <span className="text-sky-400">📅</span>
        <span className="hidden sm:inline">{currentLabel(params)}</span>
        <span className="text-stone-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-stone-900 border border-stone-700 rounded-xl shadow-xl py-1 min-w-[180px]">
          {OPTIONS.filter(o => o.value !== 'custom').map(({ value, label }) => (
            <button
              key={value}
              onClick={() => select(value)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                current === value
                  ? 'text-sky-400 bg-sky-500/10'
                  : 'text-stone-300 hover:bg-stone-800 hover:text-stone-100'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="border-t border-stone-800 mt-1 pt-1">
            <button
              onClick={() => select('custom')}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                current === 'custom'
                  ? 'text-sky-400 bg-sky-500/10'
                  : 'text-stone-300 hover:bg-stone-800 hover:text-stone-100'
              }`}
            >
              Personalizado…
            </button>
            {showCustom && (
              <div className="px-3 pb-2 pt-1 flex flex-col gap-1.5">
                <input
                  type="date"
                  value={customDe}
                  onChange={e => {
                    const val = e.target.value
                    setCustomDe(val)
                    if (val && customAte) applyCustom(val, customAte)
                  }}
                  className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-stone-200 focus:outline-none focus:border-sky-500"
                />
                <input
                  type="date"
                  value={customAte}
                  onChange={e => {
                    const val = e.target.value
                    setCustomAte(val)
                    if (customDe && val) applyCustom(customDe, val)
                  }}
                  className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-stone-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
