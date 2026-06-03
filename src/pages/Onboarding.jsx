import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'

export default function Onboarding() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [nomeConta, setNomeConta] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [planoInfo, setPlanoInfo] = useState(null)

  useEffect(() => {
    api.plano().then(setPlanoInfo).catch(() => {})
  }, [])

  useEffect(() => {
    if (searchParams.get('oauth') === 'success') {
      setSuccess(true)
      setTimeout(() => navigate('/dashboard', { replace: true }), 2500)
    }
  }, [searchParams, navigate])

  async function handleConectar(e) {
    e.preventDefault()
    const nome = nomeConta.trim()
    if (!nome) {
      setError('Digite um nome para identificar sua conta.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const { url } = await api.mlUrl(nome, '/onboarding')
      window.location.href = url
    } catch (err) {
      if (err.message?.includes('limite_atingido') || err.status === 403) {
        setError(
          planoInfo
            ? `Seu plano ${planoInfo.plano?.nome} permite até ${planoInfo.contas?.max} conta(s). Faça upgrade para adicionar mais.`
            : 'Limite de contas atingido. Faça upgrade do seu plano.'
        )
      } else {
        setError(err.message || 'Erro ao iniciar conexão. Tente novamente.')
      }
      setLoading(false)
    }
  }

  const limiteAtingido = planoInfo && !planoInfo.pode_adicionar

  if (success) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h2 className="text-xl font-semibold text-stone-100">Conta conectada com sucesso!</h2>
          <p className="text-stone-400 text-sm">Redirecionando para o dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-sky-400 font-bold text-3xl mb-1">Seller ML</h1>
          <p className="text-stone-500 text-sm">Gestão de Vendas — Mercado Livre</p>
        </div>

        {/* Info do plano */}
        {planoInfo?.plano && (
          <div className="bg-stone-900 rounded-xl border border-stone-800 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-stone-400 text-xs">Seu plano</p>
              <p className="text-stone-100 font-semibold">{planoInfo.plano.nome}</p>
            </div>
            <div className="text-right">
              <p className="text-stone-400 text-xs">Contas ML</p>
              <p className="text-stone-100 font-semibold">
                {planoInfo.contas.atual}
                {planoInfo.contas.max !== -1 ? ` / ${planoInfo.contas.max}` : ' / ∞'}
              </p>
            </div>
          </div>
        )}

        <div className="bg-stone-900 rounded-xl border border-stone-800 p-8 space-y-6">
          <div>
            <h2 className="text-stone-100 font-semibold text-lg">
              {limiteAtingido ? 'Limite de contas atingido' : 'Conecte sua conta do Mercado Livre'}
            </h2>
            <p className="text-stone-400 text-sm mt-1">
              {limiteAtingido
                ? `Seu plano ${planoInfo.plano?.nome} permite até ${planoInfo.contas?.max} conta(s). Faça upgrade para adicionar mais.`
                : 'Você será redirecionado para o Mercado Livre para autorizar o acesso. É rápido e seguro.'}
            </p>
          </div>

          {limiteAtingido ? (
            <div className="space-y-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full bg-sky-500 hover:bg-sky-400 text-stone-950 font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                Ir para o dashboard
              </button>
              <button
                className="w-full bg-stone-800 hover:bg-stone-700 text-stone-300 font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                Fazer upgrade do plano
              </button>
            </div>
          ) : (
            <form onSubmit={handleConectar} className="space-y-4">
              <div>
                <label className="block text-sm text-stone-400 mb-1.5">
                  Nome da conta{' '}
                  <span className="text-stone-600">(ex: Minha Loja, Conta Principal)</span>
                </label>
                <input
                  type="text"
                  value={nomeConta}
                  onChange={e => setNomeConta(e.target.value)}
                  placeholder="Ex: Minha Loja"
                  required
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2.5 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-stone-950 font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? 'Redirecionando...' : 'Conectar conta do Mercado Livre'}
              </button>
            </form>
          )}

          <div className="border-t border-stone-800 pt-4">
            <button
              onClick={logout}
              className="text-stone-500 hover:text-stone-400 text-sm transition-colors"
            >
              Sair da conta
            </button>
          </div>
        </div>

        <p className="text-center text-stone-600 text-xs">
          Seus dados são armazenados com segurança. Nunca compartilhamos suas credenciais.
        </p>
      </div>
    </div>
  )
}
