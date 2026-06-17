import { useEffect } from 'react'

const FINANCEIRO_URL = 'https://ml-seller-financeiro.cnnmo2.easypanel.host'

export default function Financeiro() {
  useEffect(() => {
    window.location.href = FINANCEIRO_URL
  }, [])

  return (
    <div className="flex flex-col flex-1 items-center justify-center">
      <p className="text-stone-400 text-sm">Redirecionando para o painel financeiro…</p>
    </div>
  )
}
