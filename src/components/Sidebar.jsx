import { useState, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'
import {
  LayoutDashboard, PieChart,
  ShoppingBag, Settings, Package, SlidersHorizontal, Megaphone, Sparkles, LogOut,
  ShoppingCart, Users, ChevronDown, ChevronUp,
  Wallet, ArrowDownCircle, ArrowUpCircle, Building2, TrendingUp, GitMerge, Receipt, Tag, FileText,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard',       label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/curva-abc',       label: 'Curva ABC',      icon: PieChart },
  { to: '/pedidos',         label: 'Pedidos',        icon: ShoppingBag },
  { to: '/ads',             label: 'Mercado Ads',    icon: Megaphone },
  { to: '/estudio-ia',      label: 'Estúdio IA',     icon: Sparkles },
  { to: '/custos-produtos', label: 'Custos',         icon: Settings },
  { to: '/reposicao',       label: 'Reposição',      icon: ShoppingCart },
  { to: '/inventario',      label: 'Inventário',     icon: Package },
  { to: '/configuracoes',   label: 'Configurações',  icon: SlidersHorizontal },
]

const NAV_ADMIN = [
  { to: '/admin/usuarios', label: 'Vendedores', icon: Users },
]

const FIN_NAV = [
  { to: '/financeiro/contas-pagar',     label: 'Contas a Pagar',   icon: ArrowUpCircle },
  { to: '/financeiro/contas-receber',   label: 'Contas a Receber', icon: ArrowDownCircle },
  { to: '/financeiro/contas-correntes', label: 'Contas Correntes', icon: Building2 },
  { to: '/fluxo-caixa',                 label: 'Fluxo de Caixa',   icon: TrendingUp },
  { to: '/conciliacao',                 label: 'Conciliação',       icon: GitMerge },
  { to: '/movimentacoes',               label: 'Movimentos',        icon: Receipt },
  { to: '/financeiro/regras',           label: 'Regras',            icon: Tag },
  { to: '/boletos',                     label: 'Boletos MP',        icon: FileText },
]

const FIN_PREFIXES = ['/financeiro', '/fluxo-caixa', '/conciliacao', '/movimentacoes', '/boletos']

const COLLAPSED_W = 60
const EXPANDED_W  = 200

export default function Sidebar() {
  const { logout, role } = useAuth()
  const isAdmin = role === 'admin'
  const location = useLocation()
  const isFinanceiroActive = FIN_PREFIXES.some(p => location.pathname.startsWith(p))
  const [finOpen, setFinOpen] = useState(isFinanceiroActive)
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

  const subItemCls = (isActive) => [
    'flex items-center h-8 rounded-lg transition-all duration-150 overflow-hidden w-full',
    isActive
      ? 'bg-app-active text-ink font-semibold border-l-[3px] border-accent-text pl-[25px] pr-2.5'
      : 'text-ink-muted hover:text-ink hover:bg-app-hover border-l-[3px] border-transparent pl-7 pr-2.5',
  ].join(' ')

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
            Seller ML
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

          {/* Financeiro expansível */}
          <div className="mt-0.5">
            <button
              onClick={() => expanded && setFinOpen(o => !o)}
              title={!expanded ? 'Financeiro' : undefined}
              className={itemCls(isFinanceiroActive && !finOpen)}
              style={{ cursor: 'pointer' }}
            >
              <Wallet size={16} strokeWidth={1.75} className="shrink-0" style={{ marginLeft: expanded ? '0' : '2px' }} />
              <Label text="Financeiro" />
              {expanded && (
                <span className="ml-auto shrink-0 transition-opacity duration-150" style={{ opacity: expanded ? 1 : 0 }}>
                  {finOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
              )}
            </button>

            {finOpen && expanded && (
              <div className="mt-0.5 flex flex-col gap-0.5">
                {FIN_NAV.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to}>
                    {({ isActive }) => (
                      <span className={subItemCls(isActive)}>
                        <Icon size={13} strokeWidth={1.75} className="shrink-0 mr-2.5" />
                        <span className="text-xs whitespace-nowrap">{label}</span>
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

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

      {/* ── Mobile bottom tab bar — inalterado ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch bg-app-sidebar"
        style={{ borderTop: '1px solid var(--border)', height: '56px' }}
      >
        {[...NAV.slice(0, 4), { to: '/financeiro/contas-pagar', label: 'Financeiro', icon: Wallet }].map(({ to, label, icon: Icon }) => (
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
