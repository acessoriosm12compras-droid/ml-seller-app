import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export default function StoreMultiSelect({ contas, selecionadas, onChange }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const todas = selecionadas.length === contas.length
  const resumo = selecionadas.length === 0 ? 'Selecione'
    : todas ? `Todas (${contas.length})`
    : selecionadas.length === 1 ? selecionadas[0]
    : `${selecionadas[0]} +${selecionadas.length - 1}`

  function toggle(conta) {
    const set = new Set(selecionadas)
    if (set.has(conta)) {
      if (set.size === 1) return            // mantém ao menos uma loja selecionada
      set.delete(conta)
    } else {
      set.add(conta)
    }
    onChange(contas.filter(c => set.has(c)))
  }

  function toggleTodas() {
    onChange(todas ? selecionadas.slice(0, 1) : contas)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        className="flex items-center gap-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        {resumo}
        <ChevronDown size={12} />
      </button>
      {aberto && (
        <div className="absolute z-20 mt-1 min-w-[140px] rounded-lg border border-white/[0.08] bg-[#0d0d0f] p-1 shadow-xl">
          <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-stone-300 hover:bg-white/[0.05] rounded cursor-pointer">
            <input type="checkbox" aria-label="Todas" checked={todas} onChange={toggleTodas} />
            <span className="font-medium">Todas</span>
          </label>
          <div className="my-1 h-px bg-white/[0.06]" />
          {contas.map(c => (
            <label key={c} className="flex items-center gap-2 px-2 py-1.5 text-xs text-stone-300 hover:bg-white/[0.05] rounded cursor-pointer">
              <input
                type="checkbox"
                aria-label={c}
                checked={selecionadas.includes(c)}
                onChange={() => toggle(c)}
              />
              <span>{c}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
