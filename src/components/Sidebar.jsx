import { useState, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'
import { LayoutDashboard, LogOut, Megaphone, MessageCircle, Package, PieChart, Settings, ShoppingCart, SlidersHorizontal, Sparkles, Users } from 'lucide-react'

const NAV = [
  { to: '/dashboard',       label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/curva-abc',       label: 'Curva ABC',      icon: PieChart },
  { to: '/ads',             label: 'Mercado Ads',    icon: Megaphone },
  { to: '/estudio-ia',      label: 'Estúdio IA',     icon: Sparkles },
  { to: '/perguntas',       label: 'Perguntas',      icon: MessageCircle },
  { to: '/custos-produtos', label: 'Custos',         icon: Settings },
  { to: '/reposicao',       label: 'Reposição',      icon: ShoppingCart },
  { to: '/inventario',      label: 'Inventário',     icon: Package },
]

const NAV_ADMIN = [
  { to: '/admin/usuarios', label: 'Vendedores',    icon: Users },
  { to: '/configuracoes',  label: 'Configurações', icon: SlidersHorizontal },
]

const COLLAPSED_W = 60
const EXPANDED_W  = 200

export default function Sidebar() {
  const { logout, role } = useAuth()
  const isAdmin = role === 'admin'
  const [expanded, setExpanded] = useState(false)
  const timer = useRef(null)

  const onEnter = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setExpanded(true), 80)
  }
  const onLeave = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setExpanded(false), 120)
  }

  /* ── classes de item ── */
  const itemCls = (isActive) => [
    'flex items-center h-9 rounded-lg transition-all duration-150 overflow-hidden w-full',
    expanded ? '' : 'justify-center',
    isActive && expanded  ? 'bg-app-active text-ink font-semibold border-l-[3px] border-accent-text pl-[7px] pr-2.5' : '',
    isActive && !expanded ? 'bg-app-active text-accent-text' : '',
    !isActive && expanded ? 'text-ink-muted hover:text-ink hover:bg-app-hover border-l-[3px] border-transparent pl-[7px] pr-2.5' : '',
    !isActive && !expanded? 'text-ink-muted hover:text-ink hover:bg-app-hover' : '',
  ].filter(Boolean).join(' ')

  /* ── label animado ── */
  const Label = ({ text, size = 'sm', ml = 3 }) => (
    <span
      className={`text-${size} whitespace-nowrap overflow-hidden`}
      style={{
        marginLeft: expanded ? `${ml * 4}px` : '0',
        maxWidth: expanded ? '160px' : '0px',
        opacity: expanded ? 1 : 0,
        transition: 'max-width 200ms ease, opacity 140ms ease, margin-left 200ms ease',
      }}
    >
      {text}
    </span>
  )

  return (
    <>
      {/* ── Desktop icon rail ── */}
      <aside
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className="hidden md:flex flex-col shrink-0 z-40 md:sticky md:top-0 md:h-screen bg-app-sidebar overflow-hidden"
        style={{
          width: expanded ? `${EXPANDED_W}px` : `${COLLAPSED_W}px`,
          minWidth: expanded ? `${EXPANDED_W}px` : `${COLLAPSED_W}px`,
          transition: 'width 220ms cubic-bezier(0.4,0,0.2,1), min-width 220ms cubic-bezier(0.4,0,0.2,1)',
          borderRight: '1px solid var(--border)',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center h-14 shrink-0"
          style={{ paddingLeft: expanded ? '14px' : '16px', transition: 'padding 200ms ease' }}
        >
          <Logo size={26} />
          <span
            className="text-ink text-sm whitespace-nowrap overflow-hidden"
            style={{
              fontFamily: 'Syne, system-ui, sans-serif',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              marginLeft: expanded ? '10px' : '0',
              maxWidth: expanded ? '140px' : '0px',
              opacity: expanded ? 1 : 0,
              transition: 'max-width 200ms ease, opacity 160ms ease, margin-left 200ms ease',
            }}
          >
            Cravelli
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={!expanded ? label : undefined}
            >
              {({ isActive }) => (
                <span className={itemCls(isActive)}>
                  <Icon size={16} strokeWidth={1.75} className="shrink-0" style={{ marginLeft: expanded ? '0' : '2px' }} />
                  <Label text={label} />
                </span>
              )}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />
              {NAV_ADMIN.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} title={!expanded ? label : undefined}>
                  {({ isActive }) => (
                    <span className={itemCls(isActive)}>
                      <Icon size={16} strokeWidth={1.75} className="shrink-0" style={{ marginLeft: expanded ? '0' : '2px' }} />
                      <Label text={label} />
                    </span>
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
            title={!expanded ? 'Sair' : undefined}
            className="flex items-center w-full h-9 rounded-lg text-ink-muted hover:text-ink hover:bg-app-hover transition-all duration-150 overflow-hidden"
            style={{ justifyContent: expanded ? 'flex-start' : 'center' }}
          >
            <LogOut size={15} strokeWidth={1.75} className="shrink-0" style={{ marginLeft: expanded ? '2px' : '2px' }} />
            <Label text="Sair" ml={2} />
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom tab bar — primeiros 6 itens do NAV (era 5; "Perguntas"
          entrou como 5º e empurrava "Custos" pra fora do celular) ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch bg-app-sidebar"
        style={{ borderTop: '1px solid var(--border)', height: '56px' }}
      >
        {NAV.slice(0, 6).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
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
