import PeriodSelector from './PeriodSelector'

export default function Header({ title, onRefresh, isLoading }) {
  function toggleDark() {
    const isDark = document.documentElement.classList.toggle('dark')
    localStorage.setItem('color-schema', isDark ? 'dark' : 'light')
  }

  return (
    <header className="min-h-14 bg-gray-900 dark:bg-gray-950 border-b border-gray-800 flex items-start justify-between px-6 py-2">
      <h1 className="text-gray-100 font-semibold text-base mt-1.5">{title}</h1>
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
