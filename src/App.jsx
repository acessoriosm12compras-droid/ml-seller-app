import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Pedidos from './pages/Pedidos'
import PedidoDetalhe from './pages/PedidoDetalhe'
import Financeiro from './pages/Financeiro'
import Margem from './pages/Margem'
import Ranqueamento from './pages/Ranqueamento'
import ImportarCustos from './pages/ImportarCustos'
import AdminUsuarios from './pages/AdminUsuarios'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="pedidos" element={<Pedidos />} />
              <Route path="pedidos/:id" element={<PedidoDetalhe />} />
              <Route path="financeiro" element={<Financeiro />} />
              <Route path="margem" element={<Margem />} />
              <Route path="ranqueamento" element={<Ranqueamento />} />
              <Route path="configuracoes/custos" element={<ImportarCustos />} />
              <Route
                path="admin/usuarios"
                element={
                  <ProtectedRoute adminOnly>
                    <AdminUsuarios />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
