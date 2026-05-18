import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, PieChart, Banknote,
  ShoppingBag, Settings, Package, SlidersHorizontal, ClipboardList, Megaphone, Sparkles, LogOut,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard',       label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/curva-abc',       label: 'Curva ABC',      icon: PieChart },
  { to: '/financeiro',      label: 'Financeiro',     icon: Banknote },
  { to: '/pedidos',         label: 'Pedidos',        icon: ShoppingBag },
  { to: '/ads',             label: 'Mercado Ads',    icon: Megaphone },
  { to: '/estudio-ia',      label: 'Estúdio IA',     icon: Sparkles },
  { to: '/custos-produtos', label: 'Custos',         icon: Settings },
  { to: '/inventario',      label: 'Inventário',     icon: Package },
  { to: '/fechamento',      label: 'Fechamento',     icon: ClipboardList },
  { to: '/configuracoes',   label: 'Configurações',  icon: SlidersHorizontal },
]

export default function Sidebar() {
  const { logout } = useAuth()

  return (
    <>
      {/* ── Desktop sidebar — expande no hover ── */}
      <aside
        className="group hidden md:flex flex-col shrink-0 overflow-hidden z-40"
        style={{
          width: '56px',
          minHeight: '100vh',
          backgroundColor: '#0d0d0f',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
        }}
        onMouseEnter={e => { e.currentTarget.style.width = '200px' }}
        onMouseLeave={e => { e.currentTarget.style.width = '56px' }}
      >
        {/* Logo */}
        <div
          className="flex items-center h-14 shrink-0 px-3.5 gap-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)' }}
          >
            <span className="text-white font-black" style={{ fontSize: '9px' }}>ML</span>
          </div>
          <span className="text-sky-400 font-bold text-sm whitespace-nowrap overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
            ML Seller
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-3 h-9 px-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-sky-500/[0.15] text-sky-400'
                    : 'text-zinc-600 hover:text-zinc-200 hover:bg-white/[0.05]'
                }`
              }
            >
              <Icon size={16} strokeWidth={1.75} className="shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div
          className="pb-4 pt-2 px-2 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <button
            onClick={logout}
            title="Sair"
            className="flex items-center gap-3 w-full h-9 px-2 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] transition-colors"
          >
            <LogOut size={15} strokeWidth={1.75} className="shrink-0" />
            <span className="text-sm whitespace-nowrap overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
              Sair
            </span>
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom tab bar — 5 itens principais ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
        style={{ backgroundColor: '#0d0d0f', borderTop: '1px solid rgba(255,255,255,0.08)', height: '56px' }}
      >
        {NAV.slice(0, 5).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-sky-400' : 'text-zinc-600 hover:text-zinc-300'
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
