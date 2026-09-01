import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import EditAccountBanner from '../components/EditAccountBanner'

// Contas com linha em ml_conta_briefing — as únicas em que o botão "Excluir
// no ML" pode aparecer. M12 e J12 são explicitamente fora de escopo deste
// trabalho (ver plano da fase B/C): as perguntas delas continuam sendo
// coletadas e mostradas aqui, mas antes desta rota existir a única ação
// possível era arquivar localmente — apagar de verdade no Mercado Livre pra
// essas duas contas é um efeito colateral novo que ninguém pediu. Não existe
// flag "tem briefing" vinda do backend para esta tela; espelhar a lista aqui
// é a forma mais simples e honesta de não inventar um endpoint novo só para
// isso. Se um dia mais contas ganharem briefing, atualizar esta lista junto.
const CONTAS_COM_EXCLUSAO_HABILITADA = ['YUSO', 'LOCITECH']

function Card({ pergunta, onResponder, onExcluir, enviando, excluindo }) {
  const falhou = pergunta.status === 'erro'
  // Depois de um envio rejeitado pelo ML, o texto que ela digitou fica em
  // resposta_final (não some) — é isso que tem que voltar pro textarea, não
  // a sugestão original da IA.
  const [texto, setTexto] = useState(pergunta.resposta_final || pergunta.resposta_sugerida || '')
  const ocupado = enviando || excluindo

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
        {CONTAS_COM_EXCLUSAO_HABILITADA.includes(pergunta.conta_ml) && (
          <button
            className="px-4 py-2 rounded-lg border border-red-900/40 text-red-400 hover:text-red-300 hover:border-red-800/60 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            disabled={ocupado}
            onClick={() => onExcluir(pergunta.question_id)}
          >
            {excluindo ? 'Excluindo...' : 'Excluir no ML'}
          </button>
        )}
      </div>
    </div>
  )
}

export default function Perguntas() {
  const { editAccount } = useAuth()
  const qc = useQueryClient()
  const [erro, setErro] = useState(null)

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

  // FIX 7: o disabled de cada card é derivado de `mutation.variables` (React
  // Query v5), não de um `idEmAcao` compartilhado entre as duas mutations.
  // Com estado compartilhado, começar a excluir o card B reabilitava os
  // botões do card A ainda com a exclusão dele em voo — um segundo clique no
  // card A caía no guard global `excluir.isPending` e não fazia nada,
  // silenciosamente, no único controle irreversível da tela. `variables`
  // aponta pro card certo mesmo com as duas mutations coexistindo.
  const responder = useMutation({
    mutationFn: ({ id, texto }) => api.responderPergunta(id, texto, editAccount),
    onSuccess: () => {
      setErro(null)
      invalidar()
    },
    onError: (e) => {
      setErro(e.message || 'Não foi possível enviar a resposta. Tente de novo.')
    },
  })

  // Excluir é irreversível no Mercado Livre — a confirmação vive aqui, antes
  // de a mutation disparar, não só no botão. Um clique não some com a
  // pergunta sem ela confirmar de novo.
  const excluir = useMutation({
    mutationFn: (id) => api.excluirPergunta(id, editAccount),
    onSuccess: () => {
      setErro(null)
      invalidar()
    },
    onError: (e) => {
      setErro(e.message || 'Não foi possível excluir a pergunta no Mercado Livre. Tente de novo.')
    },
  })

  const confirmarExclusao = (id) => {
    // Guarda contra clique duplo NESTE card: enquanto a exclusão DELE está em
    // voo, ignora um novo pedido de confirmação para o mesmo id. Checar só
    // `excluir.isPending` (sem comparar o id) bloquearia silenciosamente a
    // exclusão de outro card enquanto qualquer exclusão estivesse em voo — o
    // próprio bug do FIX 7, só que reaparecendo aqui: o botão do outro card
    // apareceria habilitado (ver `excluindo` derivado de `excluir.variables`
    // abaixo) e o clique não faria nada mesmo assim.
    if (excluir.isPending && excluir.variables === id) return
    if (!window.confirm('Excluir esta pergunta no Mercado Livre? Não dá para desfazer.')) return
    excluir.mutate(id)
  }

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
                enviando={responder.isPending && responder.variables?.id === p.question_id}
                excluindo={excluir.isPending && excluir.variables === p.question_id}
                onResponder={(id, texto) => responder.mutate({ id, texto })}
                onExcluir={confirmarExclusao}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
