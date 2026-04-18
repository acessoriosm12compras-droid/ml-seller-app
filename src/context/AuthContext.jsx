import { createContext, useContext, useState } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => localStorage.getItem('ml_auth') === '1'
  )

  async function login(username, password) {
    await api.login(username, password)
    localStorage.setItem('ml_auth', '1')
    setIsLoggedIn(true)
  }

  async function logout() {
    await api.logout().catch(() => {})
    localStorage.removeItem('ml_auth')
    setIsLoggedIn(false)
  }

  return (
    <AuthContext.Provider value={{ isLoggedIn, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
