import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(null) // null = not yet initialized

  useEffect(() => {
    // Load from Supabase user_metadata, fallback to OS preference
    supabase.auth.getSession().then(({ data: { session } }) => {
      const saved = session?.user?.user_metadata?.tema
      const osPreference = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      const initial = saved || osPreference
      setTheme(initial)
      applyTheme(initial)
    })
  }, [])

  function applyTheme(t) {
    if (t === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  async function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    // Persist in Supabase user_metadata
    try {
      await supabase.auth.updateUser({ data: { tema: next } })
    } catch (e) {
      console.warn('Failed to persist theme preference:', e)
    }
  }

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
