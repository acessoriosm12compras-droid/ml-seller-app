import { useEffect } from 'react'

/**
 * Leva o visitante para a tela equivalente no Painel Financeiro.
 *
 * O Fechamento e o Lucro Real saíram do CRM em agosto de 2026: são telas de
 * fechamento mensal, e o critério combinado é que o Dashboard do CRM fique com a
 * operação diária enquanto o detalhamento financeiro mora no Painel.
 *
 * As rotas antigas continuam existindo, redirecionando em vez de sumir: a equipe
 * tem esses endereços salvos, e "página não encontrada" sem explicação é o pior
 * jeito de comunicar uma mudança de endereço.
 *
 * `replace` em vez de `assign` pra não empilhar no histórico — senão o botão
 * voltar traz de novo pro redirecionamento, num laço.
 */
export default function IrParaPainel({ para }) {
  const destino = `https://financeiro.cravelli.com.br${para}`

  useEffect(() => {
    window.location.replace(destino)
  }, [destino])

  return (
    <div className="p-8 text-sm text-stone-600">
      <p>Esta tela agora fica no Painel Financeiro.</p>
      <p className="mt-2">
        Levando você para lá… Se não abrir sozinho,{' '}
        <a href={destino} className="underline text-[var(--accent-text)]">clique aqui</a>.
      </p>
    </div>
  )
}
