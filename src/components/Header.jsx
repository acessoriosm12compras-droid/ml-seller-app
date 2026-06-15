import { RefreshCw, Loader2, Moon } from 'lucide-react'
import PeriodSelector from './PeriodSelector'
import StoreMultiSelect from './StoreMultiSelect'
import { useAuth } from '../context/AuthContext'

const CONTAS = ['YUSO', 'LOCITECH', 'J12', 'M12']

export default function Header({ title, onRefresh, isLoading }) {
  const { role, activeAccounts, setActiveAccounts } = useAuth()

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
          <StoreMultiSelect contas={CONTAS} selecionadas={activeAccounts} onChange={setActiveAccounts} />
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
