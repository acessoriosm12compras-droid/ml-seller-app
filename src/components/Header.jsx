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
    <header className="min-h-14 bg-gray-900 dark:bg-gray-950 border-b border-gray-800 flex items-start justify-between px-6 py-2">
      <div className="flex items-center gap-3 mt-1.5">
        <h1 className="text-gray-100 font-semibold text-base">{title}</h1>
        {role === 'admin' && (
          <select
            value={activeAccount || ''}
            onChange={e => setActiveAccount(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {CONTAS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-3">
        <PeriodSelector />
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 text-gray-400 hover:text-gray-200 disabled:opacity-40 transition-colors"
          title="Atualizar"
        >
          {isLoading ? '⏳' : '🔄'}
        </button>
        <button
          onClick={toggleDark}
          className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
          title="Alternar tema"
        >
          🌙
        </button>
      </div>
    </header>
  )
}
