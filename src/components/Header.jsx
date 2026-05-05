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
    <header className="min-h-14 bg-stone-900 dark:bg-stone-950 border-b border-stone-800 flex items-center justify-between px-6 py-2 gap-4">
      <div className="flex items-center gap-3 shrink-0">
        <h1 className="text-stone-100 font-semibold text-base">{title}</h1>
        {role === 'admin' && (
          <select
            value={activeAccount || ''}
            onChange={e => setActiveAccount(e.target.value)}
            className="bg-stone-800 border border-stone-700 rounded-lg px-2 py-1 text-xs text-sky-700 dark:text-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {CONTAS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-2">
        <PeriodSelector />
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 text-stone-400 hover:text-stone-200 disabled:opacity-40 transition-colors"
          title="Atualizar"
        >
          {isLoading ? '⏳' : '🔄'}
        </button>
        <button
          onClick={toggleDark}
          className="p-2 text-stone-400 hover:text-stone-200 transition-colors"
          title="Alternar tema"
        >
          🌙
        </button>
      </div>
    </header>
  )
}
