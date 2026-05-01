import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

const CONTAS = ['YUSO', 'LOCITECH', 'J12', 'M12']
const ROLES = ['admin', 'user']

export default function AdminUsuarios() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ email: '', senha: '', role: 'user', conta_ml: 'LOCITECH' })
  const [erro, setErro] = useState('')

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['admin-usuarios'],
    queryFn: api.admin.listarUsuarios,
  })

  const criar = useMutation({
    mutationFn: api.admin.criarUsuario,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-usuarios'] })
      setForm({ email: '', senha: '', role: 'user', conta_ml: 'LOCITECH' })
      setErro('')
    },
    onError: (e) => setErro(e.message),
  })

  const toggleAtivo = useMutation({
    mutationFn: ({ id, ativo }) => api.admin.toggleAtivo(id, ativo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-usuarios'] }),
  })

  async function handleCriar(e) {
    e.preventDefault()
    criar.mutate(form)
  }

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <h2 className="text-gray-100 font-semibold text-lg">Gerenciar Usuários</h2>

      <form onSubmit={handleCriar} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h3 className="text-gray-300 text-sm font-medium">Novo Usuário</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">E-mail</label>
            <input
              type="email" required value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Senha inicial</label>
            <input
              type="text" required value={form.senha}
              onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Conta ML</label>
            <select value={form.conta_ml} onChange={e => setForm(f => ({ ...f, conta_ml: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500">
              {CONTAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Perfil</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500">
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
        {erro && <p className="text-red-400 text-sm">{erro}</p>}
        <button type="submit" disabled={criar.isPending}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm">
          {criar.isPending ? 'Criando...' : 'Criar usuário'}
        </button>
      </form>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left text-gray-400 font-medium px-4 py-3">E-mail</th>
              <th className="text-left text-gray-400 font-medium px-4 py-3">Conta</th>
              <th className="text-left text-gray-400 font-medium px-4 py-3">Perfil</th>
              <th className="text-left text-gray-400 font-medium px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="text-center text-gray-500 py-6">Carregando...</td></tr>
            )}
            {usuarios.map(u => (
              <tr key={u.id} className="border-b border-gray-800 last:border-0">
                <td className="px-4 py-3 text-gray-200">{u.email}</td>
                <td className="px-4 py-3 text-amber-400">{u.conta_ml}</td>
                <td className="px-4 py-3 text-gray-400">{u.role}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.ativo ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleAtivo.mutate({ id: u.id, ativo: !u.ativo })}
                    className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    {u.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
