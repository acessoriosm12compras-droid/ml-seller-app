import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from './ThemeToggle'
import {
  LayoutDashboard, PieChart, Banknote,
  ShoppingBag, Settings, Search, Package,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard',            label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/curva-abc',            label: 'Curva ABC',    icon: PieChart },
  { to: '/financeiro',           label: 'Financeiro',   icon: Banknote },
  { to: '/pedidos',              label: 'Pedidos',      icon: ShoppingBag },
  { to: '/configuracoes/custos', label: 'Custos',       icon: Settings },
  { to: '/ranqueamento',         label: 'Ranqueamento', icon: Search },
  { to: '/inventario',           label: 'Inventário',   icon: Package },
]

export default function Sidebar() {
  const { logout } = useAuth()

  return (
    <aside
      className="w-52 min-h-screen flex flex-col shrink-0"
      style={{ backgroundColor: '#0d0d0f', borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-sky-400 font-bold text-base tracking-tight">ML Seller</span>
      </div>

      <nav className="flex-1 py-2">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-white/[0.08] text-white'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`
            }
          >
            <Icon size={15} strokeWidth={1.75} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <ThemeToggle />
        <div className="px-5 mt-1">
          <button
            onClick={logout}
            className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </aside>
  )
}
