import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-2 px-6 py-2 text-sm text-stone-500 hover:text-stone-300 transition-colors w-full"
      title={theme === 'dark' ? 'Mudar para claro' : 'Mudar para escuro'}
    >
      <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
      <span>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
    </button>
  )
}
