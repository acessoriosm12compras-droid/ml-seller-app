import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { isLoggedIn, loading, role, contaMl, mlContas } = useAuth()
  if (loading) return null
  if (!isLoggedIn) return <Navigate to="/login" replace />
  if (adminOnly && role !== 'admin') return <Navigate to="/dashboard" replace />

  // Usuário logado mas sem nenhuma conta ML vinculada → onboarding
  const semContas = mlContas !== null && mlContas.length === 0 && !contaMl
  if (semContas) return <Navigate to="/onboarding" replace />

  return children
}
