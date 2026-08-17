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
import Margem from './pages/Margem'
import CustosProdutos from './pages/CustosProdutos'
import AdminUsuarios from './pages/AdminUsuarios'
import Resultado from './pages/Resultado'
import Graficos from './pages/Graficos'
import Analitico from './pages/Analitico'
import CurvaAbc from './pages/CurvaAbc'
import Gerenciamento from './pages/Gerenciamento'
import Inventario from './pages/Inventario'
import Configuracoes from './pages/Configuracoes'
import Fechamento from './pages/Fechamento'
import FechamentoLucroReal from './pages/FechamentoLucroReal'
import Ads from './pages/Ads'
import EstudioIA from './pages/EstudioIA'
import Onboarding from './pages/Onboarding'
import ReposicaoSemanal from './pages/ReposicaoSemanal'
import DefinirSenha from './pages/DefinirSenha'
import NotFound from './pages/NotFound'
import AvisoNovaVersao from './components/AvisoNovaVersao'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60_000 } },
})

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <AvisoNovaVersao />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/definir-senha" element={<DefinirSenha />} />
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
                <Route path="margem" element={<Margem />} />
                <Route path="resultado" element={<Resultado />} />
                <Route path="custos-produtos" element={<CustosProdutos />} />
                <Route path="graficos" element={<Graficos />} />
                <Route path="analitico" element={<Analitico />} />
                <Route path="curva-abc" element={<CurvaAbc />} />
                <Route path="gerenciamento" element={<Gerenciamento />} />
                <Route path="inventario" element={<Inventario />} />
                <Route path="configuracoes" element={<Configuracoes />} />
                <Route path="fechamento" element={<Fechamento />} />
                <Route path="fechamento-lucro-real" element={<FechamentoLucroReal />} />
                <Route path="ads" element={<Ads />} />
                <Route path="estudio-ia" element={<EstudioIA />} />
                <Route path="reposicao" element={<ReposicaoSemanal />} />
                <Route
                  path="admin/usuarios"
                  element={
                    <ProtectedRoute adminOnly>
                      <AdminUsuarios />
                    </ProtectedRoute>
                  }
                />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
