import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-stone-950 px-6 text-center">
      <span className="text-5xl font-black text-[#cc5c78]">404</span>
      <p className="text-stone-600 text-sm">
        Página não encontrada. O endereço pode estar errado ou a página foi movida.
      </p>
      <Link
        to="/dashboard"
        className="px-4 py-2 rounded-lg bg-[#6b2436] text-white text-sm font-medium hover:bg-[#551c2a] transition-colors"
      >
        Voltar para o Dashboard
      </Link>
    </div>
  )
}
