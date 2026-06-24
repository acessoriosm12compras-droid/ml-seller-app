import { RefreshCw, Loader2 } from 'lucide-react'
import PeriodSelector from './PeriodSelector'
import StoreMultiSelect from './StoreMultiSelect'
import ThemeToggle from './ThemeToggle'
import { useAuth } from '../context/AuthContext'

const CONTAS = ['YUSO', 'LOCITECH', 'J12', 'M12']

export default function Header({ title, onRefresh, isLoading }) {
  const { role, activeAccounts, setActiveAccounts } = useAuth()

  return (
    <header
      className="flex items-center justify-between gap-2 px-4 sm:px-6 min-h-14 shrink-0 bg-app-bg"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3 shrink-0">
        <h1 className="text-ink font-semibold text-sm" style={{ fontFamily: 'Syne, system-ui, sans-serif', fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h1>
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
            className="w-8 h-8 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-app-hover disabled:opacity-40 transition-colors duration-150"
          >
            {isLoading
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
          </button>
        )}
        <ThemeToggle className="hidden sm:flex" />
      </div>
    </header>
  )
}
