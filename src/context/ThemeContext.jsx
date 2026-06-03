import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  // Visual ML Seller é claro fixo (creme/âmbar). Modo escuro foi removido.
  const [theme] = useState('light')

  useEffect(() => {
    document.documentElement.classList.remove('dark')
  }, [])

  // Mantido por compatibilidade com quem chama useTheme(); não faz nada.
  function toggleTheme() {}

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
