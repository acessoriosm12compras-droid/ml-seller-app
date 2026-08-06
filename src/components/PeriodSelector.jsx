import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const OPTIONS = [
  { value: 'hoje',   label: 'Hoje' },
  { value: 'ontem',  label: 'Ontem' },
  { value: '7d',     label: 'Últimos 7 dias' },
  { value: '15d',    label: 'Últimos 15 dias' },
  { value: '20d',    label: 'Últimos 20 dias' },
  { value: '30d',    label: 'Últimos 30 dias' },
  { value: 'mes',    label: 'Mês' },
  { value: 'custom', label: 'Personalizado' },
]

function _mesRange(ano, mes) {
  const de = `${ano}-${mes}-01`
  const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate()
  const ate = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`
  return { de, ate }
}

function _ehMesInteiro(de, ate) {
  if (!de || !ate) return null
  const [ano, mes] = de.split('-')
  const { ate: ultimoDiaDoMes } = _mesRange(ano, mes)
  if (ate !== ultimoDiaDoMes || !de.endsWith('-01')) return null
  return `${MESES[Number(mes) - 1]} de ${ano}`
}

function currentLabel(params) {
  const p = params.get('periodo') || 'hoje'
  if (p === 'custom') {
    const de = params.get('de')
    const ate = params.get('ate')
    const mesInteiro = _ehMesInteiro(de, ate)
    if (mesInteiro) return mesInteiro
    if (de && ate) return `${de} → ${ate}`
    return 'Personalizado'
  }
  return OPTIONS.find(o => o.value === p)?.label ?? p
}

export default function PeriodSelector() {
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [showMes, setShowMes] = useState(false)
  const [customDe, setCustomDe] = useState(params.get('de') || '')
  const [customAte, setCustomAte] = useState(params.get('ate') || '')
  const now = new Date()
  const [mesSel, setMesSel] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [anoSel, setAnoSel] = useState(String(now.getFullYear()))
  const anosDisponiveis = Array.from({ length: 4 }, (_, i) => now.getFullYear() - 2 + i)
  const ref = useRef(null)

  const current = params.get('periodo') || 'hoje'
  const isFiltered = current !== 'hoje'

  const mesInteiroAtual = _ehMesInteiro(params.get('de'), params.get('ate'))

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        if (current !== 'custom') { setShowCustom(false); setShowMes(false) }
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [current])

  function select(value) {
    if (value === 'custom') {
      setShowMes(false)
      setShowCustom(true)
      return
    }
    if (value === 'mes') {
      setShowCustom(false)
      setShowMes(true)
      applyMes(mesSel, anoSel)
      return
    }
    setShowCustom(false)
    setShowMes(false)
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

  function applyMes(mes, ano) {
    const { de, ate } = _mesRange(ano, mes)
    applyCustom(de, ate)
  }

  const mesAtivo = current === 'custom' && !!mesInteiroAtual
  const personalizadoAtivo = current === 'custom' && !mesInteiroAtual

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        title={isFiltered ? 'Filtro de período aplicado' : 'Escolher período'}
        className={`flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 text-sm transition-colors whitespace-nowrap ${
          isFiltered
            ? 'bg-sky-500/10 border-sky-500/40 text-sky-300'
            : 'bg-stone-800 border-stone-700 text-stone-300 hover:text-stone-100 hover:border-stone-600'
        }`}
      >
        <Search size={13} className={isFiltered ? 'text-sky-400' : 'text-stone-500'} />
        <span className="hidden sm:inline">{currentLabel(params)}</span>
        <span className="text-stone-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-stone-900 border border-stone-700 rounded-xl shadow-xl py-1 min-w-[200px]">
          {OPTIONS.filter(o => o.value !== 'custom' && o.value !== 'mes').map(({ value, label }) => (
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
              onClick={() => select('mes')}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                mesAtivo ? 'text-sky-400 bg-sky-500/10' : 'text-stone-300 hover:bg-stone-800 hover:text-stone-100'
              }`}
            >
              Mês…
            </button>
            {showMes && (
              <div className="px-3 pb-2 pt-1 flex gap-1.5">
                <select
                  value={mesSel}
                  onChange={e => { setMesSel(e.target.value); applyMes(e.target.value, anoSel) }}
                  className="flex-1 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-stone-200 focus:outline-none focus:border-sky-500"
                >
                  {MESES.map((nome, i) => (
                    <option key={nome} value={String(i + 1).padStart(2, '0')}>{nome}</option>
                  ))}
                </select>
                <select
                  value={anoSel}
                  onChange={e => { setAnoSel(e.target.value); applyMes(mesSel, e.target.value) }}
                  className="bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-stone-200 focus:outline-none focus:border-sky-500"
                >
                  {anosDisponiveis.map(ano => (
                    <option key={ano} value={ano}>{ano}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="border-t border-stone-800 mt-1 pt-1">
            <button
              onClick={() => select('custom')}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                personalizadoAtivo
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
