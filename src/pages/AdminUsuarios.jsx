import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Check } from 'lucide-react'
import { api } from '../api'

const CONTAS = ['YUSO', 'M12', 'J12', 'LOCITECH']
const ROLES = ['user', 'admin']

export default function AdminUsuarios() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ email: '', role: 'user', conta_ml: 'LOCITECH' })
  const [erro, setErro] = useState('')
  const [linkGerado, setLinkGerado] = useState('')
  const [copiado, setCopiado] = useState(false)
  // per-row recovery link state: { [uid]: { link, copiado, loading, erro } }
  const [rowLinks, setRowLinks] = useState({})

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['admin-usuarios'],
    queryFn: api.admin.listarUsuarios,
  })

  const convidar = useMutation({
    mutationFn: api.admin.convidar,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-usuarios'] })
      setLinkGerado(data.link)
      setForm({ email: '', role: 'user', conta_ml: 'LOCITECH' })
      setErro('')
    },
    onError: (e) => setErro(e.message),
  })

  const toggleAtivo = useMutation({
    mutationFn: ({ id, ativo }) => api.admin.toggleAtivo(id, ativo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-usuarios'] }),
  })

  function handleConvidar(e) {
    e.preventDefault()
    setLinkGerado('')
    setCopiado(false)
    convidar.mutate(form)
  }

  function copiarLink() {
    navigator.clipboard.writeText(linkGerado).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    })
  }

  async function gerarLinkAcesso(uid) {
    setRowLinks(prev => ({ ...prev, [uid]: { loading: true, link: '', copiado: false, erro: '' } }))
    try {
      const data = await api.admin.linkAcesso(uid)
      setRowLinks(prev => ({ ...prev, [uid]: { loading: false, link: data.link, copiado: false, erro: '' } }))
    } catch (e) {
      setRowLinks(prev => ({ ...prev, [uid]: { loading: false, link: '', copiado: false, erro: e.message || 'Erro ao gerar link' } }))
    }
  }

  function copiarRowLink(uid) {
    const link = rowLinks[uid]?.link || ''
    navigator.clipboard.writeText(link).then(() => {
      setRowLinks(prev => ({ ...prev, [uid]: { ...prev[uid], copiado: true } }))
      setTimeout(() => setRowLinks(prev => ({ ...prev, [uid]: { ...prev[uid], copiado: false } })), 2500)
    })
  }

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <h2 className="text-stone-100 font-semibold text-lg">Gerenciar Vendedores</h2>

      {/* Formulário de convite */}
      <form onSubmit={handleConvidar} className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4">
        <h3 className="text-stone-300 text-sm font-medium">Convidar vendedor</h3>
        <p className="text-stone-500 text-xs">
          Um link de acesso será gerado. Envie para o vendedor — ele define a própria senha ao clicar.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs text-stone-400 mb-1">E-mail</label>
            <input
              type="email" required value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="email@exemplo.com"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">Conta ML</label>
            <select value={form.conta_ml} onChange={e => setForm(f => ({ ...f, conta_ml: e.target.value }))}
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-100 focus:outline-none focus:ring-2 focus:ring-sky-500">
              {CONTAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">Perfil</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-100 focus:outline-none focus:ring-2 focus:ring-sky-500">
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
        {erro && <p className="text-red-400 text-sm">{erro}</p>}
        <button type="submit" disabled={convidar.isPending}
          className="bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-stone-950 font-semibold px-4 py-2 rounded-lg text-sm">
          {convidar.isPending ? 'Gerando link…' : 'Gerar link de convite'}
        </button>
      </form>

      {/* Link gerado */}
      {linkGerado && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 space-y-3">
          <p className="text-green-400 text-sm font-medium">Link de convite gerado!</p>
          <p className="text-stone-400 text-xs">Copie e envie para o vendedor. O link expira em 24h.</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={linkGerado}
              className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-300 focus:outline-none overflow-hidden"
            />
            <button
              onClick={copiarLink}
              className="shrink-0 flex items-center gap-1.5 bg-stone-700 hover:bg-stone-600 text-stone-200 px-3 py-2 rounded-lg text-xs transition-colors"
            >
              {copiado ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
              {copiado ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      {/* Tabela de usuários */}
      <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-800">
                <th className="text-left text-stone-400 font-medium px-4 py-3">E-mail</th>
                <th className="text-left text-stone-400 font-medium px-4 py-3">Conta</th>
                <th className="text-left text-stone-400 font-medium px-4 py-3">Perfil</th>
                <th className="text-left text-stone-400 font-medium px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="text-center text-stone-500 py-6">Carregando...</td></tr>
              )}
              {usuarios.map(u => {
                const row = rowLinks[u.id] || {}
                return (
                  <>
                    <tr key={u.id} className="border-b border-stone-800 last:border-0">
                      <td className="px-4 py-3 text-stone-200">{u.email}</td>
                      <td className="px-4 py-3 text-sky-400">{u.conta_ml}</td>
                      <td className="px-4 py-3 text-stone-400">{u.role}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${u.ativo ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 flex items-center gap-3">
                        <button
                          onClick={() => toggleAtivo.mutate({ id: u.id, ativo: !u.ativo })}
                          className="text-xs text-stone-400 hover:text-stone-200 transition-colors"
                        >
                          {u.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                        <button
                          onClick={() => gerarLinkAcesso(u.id)}
                          disabled={row.loading}
                          className="text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {row.loading ? 'Gerando…' : 'Gerar link'}
                        </button>
                      </td>
                    </tr>
                    {(row.link || row.erro) && (
                      <tr key={`${u.id}-link`} className="border-b border-stone-800 bg-stone-950/50">
                        <td colSpan={5} className="px-4 py-2">
                          {row.erro && <p className="text-red-400 text-xs">{row.erro}</p>}
                          {row.link && (
                            <div className="flex items-center gap-2">
                              <input
                                readOnly value={row.link}
                                className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-300 focus:outline-none"
                              />
                              <button
                                onClick={() => copiarRowLink(u.id)}
                                className="shrink-0 flex items-center gap-1 bg-stone-700 hover:bg-stone-600 text-stone-200 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
                              >
                                {row.copiado ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                                {row.copiado ? 'Copiado!' : 'Copiar'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
