import { useAuth } from '../context/AuthContext'

export default function EditAccountBanner() {
  const { activeAccounts, editAccount, setEditAccount, role } = useAuth()

  if (role !== 'admin' || activeAccounts.length <= 1) return null

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
      <span className="shrink-0">Editando a loja:</span>
      <select
        value={editAccount || ''}
        onChange={e => setEditAccount(e.target.value)}
        className="bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5 text-xs text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer"
      >
        {activeAccounts.map(loja => (
          <option key={loja} value={loja}>{loja}</option>
        ))}
      </select>
      <span className="text-amber-500/60 text-[10px]">As operações de escrita serão aplicadas apenas nesta loja.</span>
    </div>
  )
}
