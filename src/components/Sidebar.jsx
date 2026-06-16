import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'
import {
  LayoutDashboard, PieChart, Banknote,
  ShoppingBag, Settings, Package, SlidersHorizontal, ClipboardList, Megaphone, Sparkles, LogOut,
  ShoppingCart, Wallet, Users,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard',       label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/curva-abc',       label: 'Curva ABC',      icon: PieChart },
  { to: '/fluxo-caixa',     label: 'Fluxo de Caixa', icon: Banknote },
  { to: '/pedidos',         label: 'Pedidos',        icon: ShoppingBag },
  { to: '/ads',             label: 'Mercado Ads',    icon: Megaphone },
  { to: '/estudio-ia',      label: 'Estúdio IA',     icon: Sparkles },
  { to: '/custos-produtos', label: 'Custos',         icon: Settings },
  { to: '/reposicao',       label: 'Reposição',      icon: ShoppingCart },
  { to: '/inventario',      label: 'Inventário',     icon: Package },
  { to: '/fechamento',      label: 'Fechamento',     icon: ClipboardList },
  { to: '/fluxo-caixa',     label: 'Fluxo de Caixa', icon: Wallet },
  { to: '/configuracoes',   label: 'Configurações',  icon: SlidersHorizontal },
]

const NAV_ADMIN = [
  { to: '/admin/usuarios', label: 'Vendedores', icon: Users },
]

const itemClass = ({ isActive }) =>
  `flex items-center gap-3 h-9 px-2.5 rounded-lg transition-colors duration-150 ${
    isActive
      ? 'bg-app-active text-ink font-medium'
      : 'text-ink-muted hover:text-ink hover:bg-app-hover'
  }`

export default function Sidebar() {
  const { logout, role } = useAuth()
  const isAdmin = role === 'admin'

  return (
    <>
      {/* ── Desktop sidebar — fixa e sempre expandida (200px) ── */}
      <aside
        className="hidden md:flex flex-col shrink-0 overflow-hidden z-40 md:sticky md:top-0 md:h-screen bg-app-sidebar"
        style={{ width: '200px', borderRight: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <div className="flex items-center h-14 shrink-0 px-3.5 gap-3">
          <Logo size={28} />
          <span className="text-ink font-semibold text-sm tracking-tight whitespace-nowrap overflow-hidden">
            Seller ML
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} title={label} className={itemClass}>
              {({ isActive }) => (
                <>
                  <Icon
                    size={16}
                    strokeWidth={1.75}
                    className={`shrink-0 ${isActive ? 'text-accent-text' : ''}`}
                  />
                  <span className="text-sm whitespace-nowrap overflow-hidden">
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
          {isAdmin && (
            <>
              <div className="my-1 border-t border-stone-800" />
              {NAV_ADMIN.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} title={label} className={itemClass}>
                  {({ isActive }) => (
                    <>
                      <Icon
                        size={16}
                        strokeWidth={1.75}
                        className={`shrink-0 ${isActive ? 'text-accent-text' : ''}`}
                      />
                      <span className="text-sm whitespace-nowrap overflow-hidden">
                        {label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Logout */}
        <div className="pb-4 pt-2 px-2 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={logout}
            title="Sair"
            className="flex items-center gap-3 w-full h-9 px-2.5 rounded-lg text-ink-muted hover:text-ink hover:bg-app-hover transition-colors duration-150"
          >
            <LogOut size={15} strokeWidth={1.75} className="shrink-0" />
            <span className="text-sm whitespace-nowrap overflow-hidden">Sair</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom tab bar — 5 itens principais ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch bg-app-sidebar"
        style={{ borderTop: '1px solid var(--border)', height: '56px' }}
      >
        {NAV.slice(0, 5).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors duration-150 ${
                isActive ? 'text-accent-text' : 'text-ink-muted hover:text-ink'
              }`
            }
          >
            <Icon size={19} strokeWidth={1.75} />
            <span className="text-[9px] font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
