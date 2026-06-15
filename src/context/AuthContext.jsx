import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { setTokenProvider, api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeAccounts, setActiveAccounts] = useState([])
  const [mlContas, setMlContas] = useState(null) // null = ainda carregando

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        const meta = session.user?.user_metadata || {}
        // Só inicializa se ainda não há seleção — não sobrescreve a escolha do
        // usuário quando o Supabase re-dispara eventos (refresh de token, re-foco).
        setActiveAccounts(prev => prev.length ? prev : (meta.conta_ml ? [meta.conta_ml] : []))
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        const meta = session.user?.user_metadata || {}
        // Só inicializa se ainda não há seleção — não sobrescreve a escolha do
        // usuário quando o Supabase re-dispara eventos (refresh de token, re-foco).
        setActiveAccounts(prev => prev.length ? prev : (meta.conta_ml ? [meta.conta_ml] : []))
      } else {
        setActiveAccounts([])
        setMlContas(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setTokenProvider(() => session?.access_token || null)
    if (session) {
      api.minhasContas()
        .then(({ contas }) => setMlContas(contas))
        .catch(() => setMlContas([]))
    }
  }, [session])

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }

  function loginWithGoogle() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const redirectTo = encodeURIComponent(window.location.origin + '/dashboard')
    window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`
  }

  async function logout() {
    await supabase.auth.signOut()
    setSession(null)
    setActiveAccounts([])
    setMlContas(null)
  }

  const user = session?.user || null
  const role = user?.user_metadata?.role || 'user'
  const contaMl = user?.user_metadata?.conta_ml || null
  const isLoggedIn = !!session

  // Derived from activeAccounts — keeps existing read pages working unchanged
  const activeAccount = activeAccounts.join(',')
  const editAccount = activeAccounts[0] || null
  const setActiveAccount = (c) => setActiveAccounts(c ? [c] : [])

  return (
    <AuthContext.Provider value={{
      isLoggedIn, loading, user, role, contaMl,
      activeAccounts, setActiveAccounts,
      activeAccount, setActiveAccount,
      editAccount,
      mlContas, setMlContas,
      login, loginWithGoogle, logout,
      getToken: () => session?.access_token || null,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
