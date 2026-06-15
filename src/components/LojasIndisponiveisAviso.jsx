import { AlertTriangle } from 'lucide-react'

export default function LojasIndisponiveisAviso({ lojas }) {
  if (!lojas || lojas.length === 0) return null
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
      <AlertTriangle size={14} />
      <span>
        {lojas.length === 1 ? 'Loja indisponível' : 'Lojas indisponíveis'} no momento:{' '}
        <strong>{lojas.join(', ')}</strong>. Os totais mostram apenas as lojas disponíveis.
      </span>
    </div>
  )
}
