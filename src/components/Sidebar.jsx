import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from './ThemeToggle'
import {
  LayoutDashboard, BarChart2, Activity, PieChart, FileText,
  ArrowLeftRight, ShoppingBag, ClipboardList, Banknote,
  Scale, TrendingUp, Percent, Search, Tag, Package, Settings,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard',           label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/graficos',            label: 'Gráficos',       icon: BarChart2 },
  { to: '/analitico',           label: 'Analítico',      icon: Activity },
  { to: '/curva-abc',           label: 'Curva ABC',      icon: PieChart },
  { to: '/financeiro-resumo',   label: 'Fin. Resumo',    icon: FileText },
  { to: '/movimentacoes',       label: 'Movimentações',  icon: ArrowLeftRight },
  { to: '/pedidos',             label: 'Pedidos',        icon: ShoppingBag },
  { to: '/resultado',           label: 'Resultado',      icon: ClipboardList },
  { to: '/financeiro',          label: 'Financeiro',     icon: Banknote },
  { to: '/conciliacao',         label: 'Conciliação',    icon: Scale },
  { to: '/projecao',            label: 'Projeção',       icon: TrendingUp },
  { to: '/margem',              label: 'Margem',         icon: Percent },
  { to: '/ranqueamento',        label: 'Ranqueamento',   icon: Search },
  { to: '/gerenciamento',       label: 'Gerenciamento',  icon: Tag },
  { to: '/inventario',          label: 'Inventário',     icon: Package },
  { to: '/configuracoes/custos', label: 'Custos',        icon: Settings },
]

export default function Sidebar() {
  const { logout } = useAuth()

  return (
    <aside className="w-56 min-h-screen bg-stone-900 dark:bg-stone-950 border-r border-stone-800 flex flex-col">
      <div className="px-6 py-5 border-b border-stone-800">
        <span className="text-sky-400 font-bold text-lg tracking-tight">ML Seller</span>
      </div>
      <nav className="flex-1 py-4">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                isActive
                  ? 'bg-sky-500/10 text-sky-400 border-r-2 border-sky-400'
                  : 'text-stone-400 hover:text-stone-100 hover:bg-stone-800'
              }`
            }
          >
            <Icon size={16} strokeWidth={1.75} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-0 py-4 border-t border-stone-800">
        <ThemeToggle />
        <div className="px-6">
          <button
            onClick={logout}
            className="text-sm text-stone-500 hover:text-stone-300 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </aside>
  )
}
