import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Pedidos from './pages/Pedidos'
import PedidoDetalhe from './pages/PedidoDetalhe'
import Financeiro from './pages/Financeiro'
import Margem from './pages/Margem'
import CustosProdutos from './pages/CustosProdutos'
import AdminUsuarios from './pages/AdminUsuarios'
import Resultado from './pages/Resultado'
import Conciliacao from './pages/Conciliacao'
import ProjecaoVendas from './pages/ProjecaoVendas'
import Vendas from './pages/Vendas'
import Graficos from './pages/Graficos'
import Analitico from './pages/Analitico'
import CurvaAbc from './pages/CurvaAbc'
import Movimentacoes from './pages/Movimentacoes'
import FinanceiroResumo from './pages/FinanceiroResumo'
import Gerenciamento from './pages/Gerenciamento'
import Inventario from './pages/Inventario'
import Configuracoes from './pages/Configuracoes'
import Fechamento from './pages/Fechamento'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60_000 } },
})

export default function App() {
  return (
    <ThemeProvider>
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
              <Route path="resultado" element={<Resultado />} />
              <Route path="custos-produtos" element={<CustosProdutos />} />
              <Route path="conciliacao" element={<Conciliacao />} />
              <Route path="projecao" element={<ProjecaoVendas />} />
              <Route path="graficos" element={<Graficos />} />
              <Route path="analitico" element={<Analitico />} />
              <Route path="curva-abc" element={<CurvaAbc />} />
              <Route path="movimentacoes" element={<Movimentacoes />} />
              <Route path="financeiro-resumo" element={<FinanceiroResumo />} />
              <Route path="gerenciamento" element={<Gerenciamento />} />
              <Route path="inventario" element={<Inventario />} />
              <Route path="configuracoes" element={<Configuracoes />} />
              <Route path="fechamento" element={<Fechamento />} />
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
    </ThemeProvider>
  )
}
