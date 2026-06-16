import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

export default function DefinirSenha() {
  const navigate = useNavigate()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Supabase JS processa automaticamente o hash #access_token=...&type=invite
    // e dispara onAuthStateChange com event SIGNED_IN.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })
    // Verifica se já há sessão (ex: reload da página)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    if (senha.length < 8) { setErro('A senha deve ter ao menos 8 caracteres.'); return }
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setLoading(false)

    if (error) { setErro(error.message); return }
    setOk(true)
    setTimeout(() => navigate('/dashboard'), 2500)
  }

  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <Logo size={36} />
          <h1 className="text-stone-100 text-xl font-semibold">Definir senha</h1>
          <p className="text-stone-400 text-sm text-center">
            Crie uma senha para acessar o Seller ML.
          </p>
        </div>

        {!sessionReady && (
          <p className="text-stone-400 text-sm text-center">Validando convite…</p>
        )}

        {sessionReady && !ok && (
          <form onSubmit={handleSubmit} className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-xs text-stone-400 mb-1">Nova senha</label>
              <input
                type="password"
                required
                minLength={8}
                value={senha}
                onChange={e => setSenha(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Confirmar senha</label>
              <input
                type="password"
                required
                value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            {erro && <p className="text-red-400 text-sm">{erro}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-stone-950 font-semibold py-2.5 rounded-lg text-sm"
            >
              {loading ? 'Salvando…' : 'Definir senha e entrar'}
            </button>
          </form>
        )}

        {ok && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 text-center space-y-2">
            <p className="text-green-400 font-medium">Senha definida com sucesso!</p>
            <p className="text-stone-400 text-sm">Redirecionando para o painel…</p>
          </div>
        )}
      </div>
    </div>
  )
}
