import { RefreshCw, Loader2, Moon } from 'lucide-react'
import PeriodSelector from './PeriodSelector'
import { useAuth } from '../context/AuthContext'

const CONTAS = ['YUSO', 'LOCITECH', 'J12', 'M12']

export default function Header({ title, onRefresh, isLoading }) {
  const { role, activeAccount, setActiveAccount } = useAuth()

  function toggleDark() {
    const isDark = document.documentElement.classList.toggle('dark')
    localStorage.setItem('color-schema', isDark ? 'dark' : 'light')
  }

  return (
    <header
      className="flex items-center justify-between gap-2 px-4 sm:px-6 min-h-14 shrink-0"
      style={{ backgroundColor: '#0d0d0f', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-3 shrink-0">
        <h1 className="text-stone-100 font-semibold text-sm tracking-tight">{title}</h1>
        {role === 'admin' && (
          <select
            value={activeAccount || ''}
            onChange={e => setActiveAccount(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {CONTAS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <PeriodSelector />
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            title="Atualizar"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] disabled:opacity-40 transition-colors"
          >
            {isLoading
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
          </button>
        )}
        <button
          onClick={toggleDark}
          title="Alternar tema"
          className="hidden sm:flex w-8 h-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
        >
          <Moon size={14} />
        </button>
      </div>
    </header>
  )
}
