import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from './ThemeToggle'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/pedidos', label: 'Pedidos', icon: '📦' },
  { to: '/resultado', label: 'Resultado', icon: '💹' },
  { to: '/financeiro', label: 'Financeiro', icon: '💰' },
  { to: '/margem', label: 'Margem', icon: '📈' },
  { to: '/ranqueamento', label: 'Ranqueamento', icon: '🔍' },
  { to: '/configuracoes/custos', label: 'Custos', icon: '⚙️' },
]

export default function Sidebar() {
  const { logout } = useAuth()

  return (
    <aside className="w-56 min-h-screen bg-gray-900 dark:bg-gray-950 border-r border-gray-800 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-800">
        <span className="text-amber-400 font-bold text-lg tracking-tight">ML Seller</span>
      </div>
      <nav className="flex-1 py-4">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                isActive
                  ? 'bg-amber-500/10 text-amber-400 border-r-2 border-amber-400'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
              }`
            }
          >
            <span>{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-0 py-4 border-t border-gray-800">
        <ThemeToggle />
        <div className="px-6">
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </aside>
  )
}
