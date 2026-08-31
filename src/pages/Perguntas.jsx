import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import EditAccountBanner from '../components/EditAccountBanner'

function Card({ pergunta, onResponder, onRecusar, enviando, recusando }) {
  const falhou = pergunta.status === 'erro'
  // Depois de um envio rejeitado pelo ML, o texto que ela digitou fica em
  // resposta_final (não some) — é isso que tem que voltar pro textarea, não
  // a sugestão original da IA.
  const [texto, setTexto] = useState(pergunta.resposta_final || pergunta.resposta_sugerida || '')
  const ocupado = enviando || recusando

  return (
    <div
      className={`rounded-xl border p-4 ${
        falhou ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-stone-800 bg-stone-900'
      }`}
    >
      {falhou && (
        <div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium mb-2">
          <AlertTriangle size={13} className="shrink-0" />
          Falha ao enviar ao Mercado Livre — revise e tente de novo
        </div>
      )}
      <div className="text-xs text-stone-500 mb-1">
        {pergunta.conta_ml} · {pergunta.item_titulo}
      </div>
      <p className="text-stone-200 text-sm font-medium mb-3">"{pergunta.texto_pergunta}"</p>
      <textarea
        className="w-full rounded-lg border border-stone-700 bg-stone-950 p-2.5 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-sky-500 transition-colors"
        rows={4}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escreva a resposta..."
      />
      <div className="flex gap-2 mt-3">
        <button
          className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          disabled={ocupado || !texto.trim()}
          onClick={() => onResponder(pergunta.question_id, texto)}
        >
          {enviando ? 'Enviando...' : falhou ? 'Tentar novamente' : 'Responder'}
        </button>
        <button
          className="px-4 py-2 rounded-lg border border-stone-700 text-stone-300 hover:text-stone-100 hover:border-stone-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          disabled={ocupado}
          onClick={() => onRecusar(pergunta.question_id)}
        >
          {recusando ? 'Recusando...' : 'Recusar'}
        </button>
      </div>
    </div>
  )
}

export default function Perguntas() {
  const { editAccount } = useAuth()
  const qc = useQueryClient()
  const [erro, setErro] = useState(null)
  const [idEmAcao, setIdEmAcao] = useState(null)

  const {
    data: pendentesData,
    isLoading: carregandoPendentes,
    error: erroPendentes,
    refetch: refetchPendentes,
  } = useQuery({
    queryKey: ['perguntas', editAccount, 'pendente'],
    queryFn: () => api.perguntas({ conta_ml: editAccount, status: 'pendente' }),
    enabled: !!editAccount,
  })

  // Quando um envio falha o card vira 'erro' — sem esta segunda query ele
  // some da única tela que ela usa no próximo refetch (inclusive um reload
  // de página), e o texto que ela digitou não aparece em lugar nenhum pra
  // ela tentar de novo.
  const {
    data: comFalhaData,
    isLoading: carregandoComFalha,
    error: erroComFalha,
    refetch: refetchComFalha,
  } = useQuery({
    queryKey: ['perguntas', editAccount, 'erro'],
    queryFn: () => api.perguntas({ conta_ml: editAccount, status: 'erro' }),
    enabled: !!editAccount,
  })

  const isLoading = carregandoPendentes || carregandoComFalha
  const queryError = erroPendentes || erroComFalha
  const refetch = () => { refetchPendentes(); refetchComFalha() }

  const invalidar = () => qc.invalidateQueries({ queryKey: ['perguntas', editAccount] })

  const responder = useMutation({
    mutationFn: ({ id, texto }) => api.responderPergunta(id, texto, editAccount),
    onMutate: ({ id }) => setIdEmAcao(id),
    onSuccess: () => {
      setErro(null)
      setIdEmAcao(null)
      invalidar()
    },
    onError: (e) => {
      setIdEmAcao(null)
      setErro(e.message || 'Não foi possível enviar a resposta. Tente de novo.')
    },
  })

  const recusar = useMutation({
    mutationFn: (id) => api.recusarPergunta(id, editAccount),
    onMutate: (id) => setIdEmAcao(id),
    onSuccess: () => {
      setErro(null)
      setIdEmAcao(null)
      invalidar()
    },
    onError: (e) => {
      setIdEmAcao(null)
      setErro(e.message || 'Não foi possível recusar a pergunta. Tente de novo.')
    },
  })

  const pendentes = pendentesData?.perguntas || []
  const comFalha = comFalhaData?.perguntas || []
  // Com falha primeiro: são as que precisam de atenção dela agora.
  const perguntas = [...comFalha, ...pendentes]

  return (
    <div className="flex flex-col flex-1">
      <Header title="Perguntas" onRefresh={refetch} isLoading={isLoading} showPeriod={false} />

      <main className="flex-1 p-3 sm:p-6 space-y-4 max-w-3xl">
        <EditAccountBanner />

        <p className="text-sm text-stone-500">
          {pendentes.length} pendente{pendentes.length === 1 ? '' : 's'}
          {comFalha.length > 0 && (
            <span className="text-amber-400"> · {comFalha.length} com falha</span>
          )}
        </p>

        {erro && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {erro}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-16 text-stone-500">Carregando perguntas...</div>
        ) : queryError ? (
          <div className="text-center py-16 text-red-400">{queryError.message}</div>
        ) : perguntas.length === 0 ? (
          <div className="text-center py-16 text-stone-500">
            Nenhuma pergunta pendente por aqui. Quando um cliente perguntar, ela aparece nesta lista.
          </div>
        ) : (
          <div className="space-y-4">
            {perguntas.map((p) => (
              <Card
                key={p.question_id}
                pergunta={p}
                enviando={responder.isPending && idEmAcao === p.question_id}
                recusando={recusar.isPending && idEmAcao === p.question_id}
                onResponder={(id, texto) => responder.mutate({ id, texto })}
                onRecusar={(id) => recusar.mutate(id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
