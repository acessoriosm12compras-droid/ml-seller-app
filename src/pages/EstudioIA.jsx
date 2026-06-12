import { useState, useRef, useEffect } from 'react'
import {
  Search, Sparkles, Copy, Check, Loader2, ExternalLink, Zap, Clock,
  TrendingUp, Trophy, CheckCircle2, ChevronRight, ArrowLeft, FileSearch,
  Wand2, X, Save, Package,
} from 'lucide-react'
import Header from '../components/Header'
import { api } from '../api'

// Ferramentas de IA — blocos da oferta direcionada (metodologia de persona).
// Cada bloco gera UMA coisa por vez; 'persona' é o bloco principal e guia os demais.
const BLOCOS_IA = [
  { id: 'persona',        icone: '🧑', nome: 'Persona do Produto', desc: 'Descubra quem é o público que mais compra este produto — com evidências, dores e quebras de objeção.', principal: true },
  { id: 'palavras_chave', icone: '🔑', nome: 'Palavras-chave',            desc: 'Termos de busca e título na linguagem real do público, do genérico ao nichado.' },
  { id: 'titulos',        icone: '✍️', nome: 'Títulos que filtram',       desc: '3 opções de até 60 caracteres + 1 título completo de até 120.', editavel: true },
  { id: 'descricao',      icone: '💬', nome: 'Descrição que conversa',    desc: '2 versões: dor → solução no mundo da persona → quebra de objeção.', editavel: true },
  { id: 'fotos',          icone: '🖼️', nome: 'Fotos que espelham',        desc: 'Briefing de capa ambientada + 3 prompts de imagem prontos.' },
  { id: 'kits',           icone: '📦', nome: 'Kits direcionados',         desc: 'Kits que resolvem o problema completo da persona.' },
]

const LIMITE_TITULO_CURTO = 60
const LIMITE_TITULO_COMPLETO = 120

function normalizarBlocoLocal(id, c) {
  const o = c && typeof c === 'object' ? c : {}
  switch (id) {
    case 'persona': return {
      resumo: o.resumo || '',
      justificativa: o.justificativa || '',
      secundarias: Array.isArray(o.secundarias) ? o.secundarias.map(String) : [],
      dores_objecoes: Array.isArray(o.dores_objecoes)
        ? o.dores_objecoes.filter(d => d && typeof d === 'object') : [],
    }
    case 'palavras_chave': return { termos: Array.isArray(o.termos) ? o.termos.map(String) : [] }
    case 'titulos': return {
      opcoes: Array.isArray(o.opcoes) ? o.opcoes.map(String) : [],
      completo: o.completo || '',
    }
    case 'descricao': return { versoes: Array.isArray(o.versoes) ? o.versoes.map(String) : [] }
    case 'fotos': return {
      briefing_capa: o.briefing_capa || '',
      variacoes_cenario: Array.isArray(o.variacoes_cenario) ? o.variacoes_cenario.map(String) : [],
      prompts: Array.isArray(o.prompts) ? o.prompts.map(String) : [],
    }
    case 'kits': return {
      kits: Array.isArray(o.kits) ? o.kits.filter(k => k && typeof k === 'object') : [],
    }
    default: return o
  }
}

// Texto plano de um bloco (para o botão Copiar)
function blocoParaTexto(id, c) {
  if (!c) return ''
  switch (id) {
    case 'persona': {
      const linhas = []
      if (c.resumo) linhas.push(`Persona majoritária: ${c.resumo}`)
      if (c.justificativa) linhas.push(`Justificativa: ${c.justificativa}`)
      if (c.secundarias?.length) linhas.push(`Personas secundárias:\n${c.secundarias.map(s => `- ${s}`).join('\n')}`)
      if (c.dores_objecoes?.length) linhas.push(`Dores e quebras de objeção:\n${c.dores_objecoes.map(d => `- ${d.dor} → ${d.quebra || ''}`).join('\n')}`)
      return linhas.join('\n\n')
    }
    case 'palavras_chave': return (c.termos || []).join(', ')
    case 'titulos': return [...(c.opcoes || []), c.completo].filter(Boolean).join('\n')
    case 'descricao': return (c.versoes || []).join('\n\n---\n\n')
    case 'fotos': {
      const linhas = []
      if (c.briefing_capa) linhas.push(`Briefing da capa: ${c.briefing_capa}`)
      if (c.variacoes_cenario?.length) linhas.push(`Variações de cenário:\n${c.variacoes_cenario.map(v => `- ${v}`).join('\n')}`)
      if (c.prompts?.length) linhas.push(c.prompts.map((p, i) => `Prompt ${i + 1}:\n${p}`).join('\n\n'))
      return linhas.join('\n\n')
    }
    case 'kits': return (c.kits || []).map(k =>
      `${k.nome}\n- Produtos: ${(k.produtos || []).join(', ')}${k.porque ? `\n- Por quê: ${k.porque}` : ''}`
    ).join('\n\n')
    default: return JSON.stringify(c, null, 2)
  }
}

function vendasPorDia(p) {
  if (!p.sold_quantity || !p.date_created) return null
  const dias = Math.max(1, (Date.now() - new Date(p.date_created)) / 86_400_000)
  return Math.round((p.sold_quantity / dias) * 10) / 10
}

function fmtVpd(v) {
  if (v === null || v === undefined) return null
  if (v < 1) return `<1/dia`
  return `~${v % 1 === 0 ? v : v.toFixed(1)}/dia`
}

function fmtBRL(v) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function fmtNum(v) {
  if (!v && v !== 0) return '—'
  return Number(v).toLocaleString('pt-BR')
}

function fmtDataHist(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '')
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${data} · ${hora}`
}

function fmtHoje() {
  const s = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Chave estável de um produto no grid (id do anúncio; índice como fallback)
function chaveProduto(p, i) {
  return String(p?.id ?? `idx_${i}`)
}

// Estatísticas de preço dos produtos de uma análise
function statsPreco(produtos) {
  const precos = (produtos || []).map(p => p.price).filter(v => v !== null && v !== undefined)
  if (!precos.length) return null
  const min = Math.min(...precos)
  const max = Math.max(...precos)
  const media = precos.reduce((a, b) => a + b, 0) / precos.length
  return { min, max, media }
}

export default function EstudioIA() {
  // ── Busca (termo OU link de anúncio, mesmo input) ─────────────────
  const [termo, setTermo]         = useState('')
  const [buscando, setBuscando]   = useState(false)
  const [erroBusca, setErroBusca] = useState('')
  const [feedback, setFeedback]   = useState(null)   // { termo, n, estudoId }
  const [mercadoAtual, setMercadoAtual] = useState(null)

  // ── Histórico (lista principal da página) ─────────────────────────
  const [historico, setHistorico]   = useState([])
  const [buscaHist, setBuscaHist]   = useState('')
  const [carregandoHist, setCarregandoHist] = useState(false)

  // ── Workspace da análise (substitui a lista quando aberto) ────────
  const [workspace, setWorkspace] = useState(null)
  // workspace: { estudoId, termo, criadoEm, produtos, mercado, carregando, erro }
  const [selecionados, setSelecionados] = useState(new Set())  // chaves dos anúncios de referência
  const [blocos, setBlocos] = useState({})                 // { [blocoId]: conteudo }
  const [blocosOriginais, setBlocosOriginais] = useState({})
  const [blocosAbertos, setBlocosAbertos] = useState(new Set())
  const [gerandoBloco, setGerandoBloco] = useState(null)   // UM gerador por vez
  const [errosBloco, setErrosBloco] = useState({})
  const [salvandoBloco, setSalvandoBloco] = useState(null)
  const [salvoBloco, setSalvoBloco] = useState('')
  const [copiado, setCopiado] = useState('')
  const workspaceRef = useRef(null)

  // Carrega o histórico de estudos ao montar
  useEffect(() => {
    carregarHistorico()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function carregarHistorico() {
    setCarregandoHist(true)
    try {
      const data = await api.estudio.historico(100)
      setHistorico(data.estudos || [])
    } catch {
      /* histórico é best-effort — silencioso */
    } finally {
      setCarregandoHist(false)
    }
  }

  // ── Buscar: o backend retorna os produtos e JÁ SALVA a análise ────
  async function buscar(e) {
    e?.preventDefault()
    const t = termo.trim()
    if (!t || buscando) return

    setBuscando(true)
    setErroBusca('')
    setFeedback(null)

    const isLink = t.startsWith('http')
    try {
      const data = await api.estudio.buscar(isLink ? { link: t } : { termo: t })
      const lista = data.produtos || []
      if (!lista.length) {
        setErroBusca('Nenhum anúncio encontrado para essa busca. Tente outro termo ou cole o link de um anúncio do ML.')
        return
      }
      if (data.mercado) setMercadoAtual(data.mercado)
      setFeedback({ termo: data.termo || t, n: lista.length, estudoId: data.estudo_id })
      await carregarHistorico()   // a análise aparece no topo do histórico
    } catch (err) {
      setErroBusca(err.message)
    } finally {
      setBuscando(false)
    }
  }

  // ── Workspace: abrir/fechar ───────────────────────────────────────
  function resetBlocos() {
    setBlocos({})
    setBlocosOriginais({})
    setBlocosAbertos(new Set())
    setGerandoBloco(null)
    setErrosBloco({})
    setSalvandoBloco(null)
    setSalvoBloco('')
  }

  function carregarBlocosDoConteudo(conteudoGerado) {
    if (!conteudoGerado || typeof conteudoGerado !== 'object') return
    const novos = {}
    for (const b of BLOCOS_IA) {
      if (conteudoGerado[b.id] && typeof conteudoGerado[b.id] === 'object') {
        novos[b.id] = normalizarBlocoLocal(b.id, conteudoGerado[b.id])
      }
    }
    setBlocos(novos)
    setBlocosOriginais(JSON.parse(JSON.stringify(novos)))
    setBlocosAbertos(new Set(Object.keys(novos)))   // blocos já gerados abrem preenchidos
  }

  async function abrirEstudo(id, infoFallback = {}) {
    if (!id) return
    resetBlocos()
    setSelecionados(new Set())
    setWorkspace({
      estudoId: id,
      termo: infoFallback.termo || 'Análise',
      criadoEm: infoFallback.criadoEm || null,
      produtos: [],
      mercado: null,
      carregando: true,
    })
    setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    try {
      const { estudo } = await api.estudio.get(id)
      const produtos = Array.isArray(estudo.produtos_analisados) ? estudo.produtos_analisados : []
      setWorkspace({
        estudoId: estudo.id,
        termo: estudo.termo || estudo.link || 'Análise',
        criadoEm: estudo.created_at,
        produtos,
        mercado: estudo.mercado || null,
        carregando: false,
      })
      // Todos os anúncios começam selecionados como referência
      setSelecionados(new Set(produtos.map((p, i) => chaveProduto(p, i))))
      if (estudo.mercado) setMercadoAtual(estudo.mercado)
      carregarBlocosDoConteudo(estudo.conteudo_gerado)
    } catch (err) {
      setWorkspace(w => (w ? { ...w, carregando: false, erro: err.message } : w))
    }
  }

  function fecharWorkspace() {
    setWorkspace(null)
    setSelecionados(new Set())
    resetBlocos()
  }

  // ── Seleção de anúncios de referência (mínimo 1 marcado) ──────────
  function toggleSelecionado(chave) {
    setSelecionados(prev => {
      const n = new Set(prev)
      if (n.has(chave)) {
        if (n.size <= 1) return prev   // mínimo 1 selecionado
        n.delete(chave)
      } else {
        n.add(chave)
      }
      return n
    })
  }

  function selecionarTodos() {
    setSelecionados(new Set((workspace?.produtos || []).map((p, i) => chaveProduto(p, i))))
  }

  function limparSelecao() {
    // "Limpar" mantém o 1º anúncio — a seleção nunca fica vazia (mínimo 1)
    const prods = workspace?.produtos || []
    if (!prods.length) return
    setSelecionados(new Set([chaveProduto(prods[0], 0)]))
  }

  // ── Ferramentas de IA: gerar/salvar bloco ─────────────────────────
  async function gerarBloco(blocoId) {
    if (!workspace || workspace.carregando || gerandoBloco) return
    if (!produtosSelecionadosWs.length && produtosWs.length) return  // mínimo 1 anúncio de referência
    setGerandoBloco(blocoId)
    setErrosBloco(prev => ({ ...prev, [blocoId]: '' }))
    try {
      const payload = { bloco: blocoId }
      if (workspace.estudoId) payload.estudo_id = workspace.estudoId
      if (workspace.termo) payload.termo = workspace.termo
      // Gera usando APENAS os anúncios selecionados como referência
      const refs = produtosSelecionadosWs.length ? produtosSelecionadosWs : workspace.produtos
      if (refs?.length) payload.produtos = refs
      if (workspace.estudoId && refs?.length && refs.every(p => p?.id != null)) {
        payload.produtos_ids = refs.map(p => String(p.id))
      }
      if (workspace.mercado) payload.mercado = workspace.mercado
      const data = await api.estudio.gerarConteudo(payload)
      const c = normalizarBlocoLocal(blocoId, data.conteudo)
      setBlocos(prev => ({ ...prev, [blocoId]: c }))
      setBlocosOriginais(prev => ({ ...prev, [blocoId]: JSON.parse(JSON.stringify(c)) }))
      setBlocosAbertos(prev => new Set(prev).add(blocoId))
      if (data.estudo_id) {
        setWorkspace(w => (w ? { ...w, estudoId: data.estudo_id } : w))
      }
      carregarHistorico()
    } catch (err) {
      setErrosBloco(prev => ({ ...prev, [blocoId]: err.message }))
    } finally {
      setGerandoBloco(null)
    }
  }

  async function salvarBloco(blocoId) {
    if (!workspace?.estudoId || !blocos[blocoId] || salvandoBloco) return
    setSalvandoBloco(blocoId)
    setErrosBloco(prev => ({ ...prev, [blocoId]: '' }))
    try {
      const data = await api.estudio.salvarConteudo(workspace.estudoId, blocos[blocoId], blocoId)
      const c = normalizarBlocoLocal(blocoId, data.conteudo)
      setBlocos(prev => ({ ...prev, [blocoId]: c }))
      setBlocosOriginais(prev => ({ ...prev, [blocoId]: JSON.parse(JSON.stringify(c)) }))
      setSalvoBloco(blocoId)
      setTimeout(() => setSalvoBloco(''), 2500)
    } catch (err) {
      setErrosBloco(prev => ({ ...prev, [blocoId]: `Erro ao salvar: ${err.message}` }))
    } finally {
      setSalvandoBloco(null)
    }
  }

  function toggleBlocoAberto(blocoId) {
    setBlocosAbertos(prev => {
      const n = new Set(prev)
      n.has(blocoId) ? n.delete(blocoId) : n.add(blocoId)
      return n
    })
  }

  function setCampoBloco(blocoId, campo, valor) {
    setBlocos(prev => ({ ...prev, [blocoId]: { ...(prev[blocoId] || {}), [campo]: valor } }))
  }

  function setItemListaBloco(blocoId, campo, i, valor) {
    setBlocos(prev => {
      const c = prev[blocoId] || {}
      const arr = [...(c[campo] || [])]
      while (arr.length <= i) arr.push('')
      arr[i] = valor
      return { ...prev, [blocoId]: { ...c, [campo]: arr } }
    })
  }

  function blocoAlterado(blocoId) {
    return !!blocos[blocoId]
      && JSON.stringify(blocos[blocoId]) !== JSON.stringify(blocosOriginais[blocoId])
  }

  function copiar(chave, texto) {
    if (!texto) return
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(chave)
      setTimeout(() => setCopiado(''), 2000)
    })
  }

  // ── Dados derivados ───────────────────────────────────────────────
  const historicoFiltrado = historico.filter(h => {
    const q = buscaHist.trim().toLowerCase()
    if (!q) return true
    return (h.termo || '').toLowerCase().includes(q)
      || (h.link || '').toLowerCase().includes(q)
      || (h.persona || '').toLowerCase().includes(q)
  })

  const agora = new Date()
  const analisesMes = historico.filter(h => {
    if (!h.created_at) return false
    const d = new Date(h.created_at)
    return !isNaN(d) && d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear()
  }).length

  const produtosWs = workspace?.produtos || []
  const produtosSelecionadosWs = produtosWs.filter((p, i) => selecionados.has(chaveProduto(p, i)))
  // Faixa de preço recalculada apenas pelos anúncios selecionados
  const precosWs = statsPreco(produtosSelecionadosWs.length ? produtosSelecionadosWs : produtosWs)
  const temPersona = !!blocos.persona

  // ── Render helpers (Ferramentas de IA) ────────────────────────────
  function botaoCopiar(chave, texto, rotulo = 'Copiar') {
    return (
      <button
        onClick={() => copiar(chave, texto)}
        disabled={!texto}
        title="Copiar"
        className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 disabled:opacity-40 bg-stone-800 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
      >
        {copiado === chave
          ? <><Check size={12} className="text-emerald-400" /> {rotulo ? 'Copiado!' : ''}</>
          : <><Copy size={12} /> {rotulo}</>}
      </button>
    )
  }

  function botaoSalvarBloco(blocoId) {
    const salvando = salvandoBloco === blocoId
    const salvo = salvoBloco === blocoId
    return (
      <button
        onClick={() => salvarBloco(blocoId)}
        disabled={!workspace?.estudoId || !blocoAlterado(blocoId) || !!salvandoBloco}
        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${
          salvo
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
            : 'bg-stone-800 border-stone-700 text-stone-300 hover:text-stone-100 hover:border-stone-600'
        }`}
      >
        {salvando
          ? <><Loader2 size={12} className="animate-spin" /> Salvando...</>
          : salvo
            ? <><Check size={12} /> Salvo!</>
            : <><Save size={12} /> Salvar</>}
      </button>
    )
  }

  function renderResultadoBloco(b) {
    const c = blocos[b.id]
    if (!c) return null
    switch (b.id) {
      case 'persona': return (
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            {botaoCopiar('bloco_persona', blocoParaTexto('persona', c))}
          </div>
          {c.resumo && (
            <div className="bg-violet-500/10 border border-violet-500/25 rounded-xl p-3.5">
              <p className="text-stone-500 text-xs uppercase tracking-widest mb-1">Persona majoritária (~70%)</p>
              <p className="text-stone-100 text-sm font-medium leading-relaxed">{c.resumo}</p>
            </div>
          )}
          {c.justificativa && (
            <div>
              <p className="text-stone-500 text-xs uppercase tracking-widest mb-1">Evidências</p>
              <p className="text-stone-300 text-xs leading-relaxed">{c.justificativa}</p>
            </div>
          )}
          {c.secundarias?.length > 0 && (
            <div>
              <p className="text-stone-500 text-xs uppercase tracking-widest mb-1">Personas secundárias</p>
              <ul className="space-y-1">
                {c.secundarias.map((s, i) => (
                  <li key={i} className="text-stone-400 text-xs leading-relaxed">• {s}</li>
                ))}
              </ul>
            </div>
          )}
          {c.dores_objecoes?.length > 0 && (
            <div>
              <p className="text-stone-500 text-xs uppercase tracking-widest mb-1.5">Dores e quebras de objeção</p>
              <div className="space-y-2">
                {c.dores_objecoes.map((d, i) => (
                  <div key={i} className="bg-stone-900 border border-stone-700/60 rounded-lg p-2.5">
                    <p className="text-stone-200 text-xs font-medium">{d.dor}</p>
                    {d.quebra && <p className="text-emerald-400/90 text-xs mt-1">↳ {d.quebra}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )

      case 'palavras_chave': return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-stone-500 text-xs">
              {c.termos?.length || 0} termos · do genérico ao nichado
            </span>
            {botaoCopiar('bloco_palavras', blocoParaTexto('palavras_chave', c), 'Copiar todas')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(c.termos || []).map((t, i) => (
              <button
                key={i}
                onClick={() => copiar(`termo_${i}`, t)}
                title="Copiar termo"
                className="text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/25 rounded-full px-2.5 py-1 transition-colors"
              >
                {copiado === `termo_${i}` ? '✓ copiado' : t}
              </button>
            ))}
          </div>
        </div>
      )

      case 'titulos': {
        const opcoes = [...(c.opcoes || [])]
        while (opcoes.length < 3) opcoes.push('')
        const completo = c.completo || ''
        const estourouCompleto = completo.length > LIMITE_TITULO_COMPLETO
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-end gap-2">
              {botaoCopiar('bloco_titulos', blocoParaTexto('titulos', c), 'Copiar todos')}
              {botaoSalvarBloco('titulos')}
            </div>
            {opcoes.map((t, i) => {
              const estourou = t.length > LIMITE_TITULO_CURTO
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 text-xs font-medium">Opção {i + 1}</span>
                    <span className={`text-xs tabular-nums ${estourou ? 'text-red-400 font-semibold' : 'text-stone-500'}`}>
                      {t.length}/{LIMITE_TITULO_CURTO}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={t}
                      onChange={e => setItemListaBloco('titulos', 'opcoes', i, e.target.value)}
                      className={`flex-1 min-w-0 bg-stone-900 border rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none transition-colors ${
                        estourou ? 'border-red-500/60 focus:border-red-500' : 'border-stone-700 focus:border-violet-500'
                      }`}
                    />
                    {botaoCopiar(`titulo_op_${i}`, t, '')}
                  </div>
                </div>
              )
            })}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-stone-500 text-xs font-medium">Título completo</span>
                <span className={`text-xs tabular-nums ${estourouCompleto ? 'text-red-400 font-semibold' : 'text-stone-500'}`}>
                  {completo.length}/{LIMITE_TITULO_COMPLETO}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <textarea
                  value={completo}
                  onChange={e => setCampoBloco('titulos', 'completo', e.target.value)}
                  rows={2}
                  className={`flex-1 min-w-0 bg-stone-900 border rounded-lg px-3 py-2 text-sm text-stone-200 leading-relaxed resize-y focus:outline-none transition-colors ${
                    estourouCompleto ? 'border-red-500/60 focus:border-red-500' : 'border-stone-700 focus:border-violet-500'
                  }`}
                />
                {botaoCopiar('titulo_completo', completo, '')}
              </div>
            </div>
            {(opcoes.some(t => t.length > LIMITE_TITULO_CURTO) || estourouCompleto) && (
              <p className="text-red-400 text-xs">
                Acima do limite — o Mercado Livre corta títulos maiores que o permitido.
              </p>
            )}
          </div>
        )
      }

      case 'descricao': return (
        <div className="space-y-3">
          <div className="flex items-center justify-end">{botaoSalvarBloco('descricao')}</div>
          {(c.versoes?.length ? c.versoes : ['', '']).map((v, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-stone-500 text-xs font-medium">Versão {i + 1}</span>
                {botaoCopiar(`descricao_v_${i}`, v)}
              </div>
              <textarea
                value={v}
                onChange={e => setItemListaBloco('descricao', 'versoes', i, e.target.value)}
                rows={10}
                className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3.5 py-3 text-sm text-stone-200 leading-relaxed resize-y focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
          ))}
        </div>
      )

      case 'fotos': return (
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            {botaoCopiar('bloco_fotos', blocoParaTexto('fotos', c), 'Copiar tudo')}
          </div>
          {c.briefing_capa && (
            <div>
              <p className="text-stone-500 text-xs uppercase tracking-widest mb-1">Briefing da capa (ambientada)</p>
              <p className="text-stone-300 text-xs leading-relaxed bg-stone-900 border border-stone-700/60 rounded-lg p-3">
                {c.briefing_capa}
              </p>
            </div>
          )}
          {c.variacoes_cenario?.length > 0 && (
            <div>
              <p className="text-stone-500 text-xs uppercase tracking-widest mb-1">Variações de cenário</p>
              <ul className="space-y-1">
                {c.variacoes_cenario.map((v, i) => (
                  <li key={i} className="text-stone-400 text-xs leading-relaxed">• {v}</li>
                ))}
              </ul>
            </div>
          )}
          {(c.prompts || []).map((p, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-stone-500 text-xs font-medium">Prompt de imagem {i + 1}</span>
                {botaoCopiar(`foto_prompt_${i}`, p)}
              </div>
              <p className="text-stone-300 text-xs leading-relaxed bg-stone-900 border border-stone-700/60 rounded-lg p-3">
                {p}
              </p>
            </div>
          ))}
        </div>
      )

      case 'kits': return (
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            {botaoCopiar('bloco_kits', blocoParaTexto('kits', c), 'Copiar tudo')}
          </div>
          {(c.kits || []).map((k, i) => (
            <div key={i} className="bg-stone-900 border border-stone-700/60 rounded-lg p-3 space-y-1.5">
              <p className="text-stone-100 text-sm font-medium">{k.nome}</p>
              {k.produtos?.length > 0 && (
                <p className="text-stone-400 text-xs">Composição: {k.produtos.join(' + ')}</p>
              )}
              {k.porque && <p className="text-stone-500 text-xs leading-relaxed">{k.porque}</p>}
            </div>
          ))}
        </div>
      )

      default: return null
    }
  }

  function renderBlocoCard(b) {
    const c = blocos[b.id]
    const gerandoEste = gerandoBloco === b.id
    const aberto = blocosAbertos.has(b.id)
    const erro = errosBloco[b.id]
    return (
      <div
        key={b.id}
        className={`rounded-2xl border p-4 md:p-5 space-y-3 ${
          b.principal
            ? 'bg-violet-500/[0.06] border-violet-500/30'
            : 'bg-stone-800/60 border-stone-700/50'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="text-xl leading-none mt-0.5 shrink-0">{b.icone}</span>
            <div className="min-w-0">
              <h3 className="text-stone-100 text-sm font-semibold leading-tight flex items-center gap-2 flex-wrap">
                {b.nome}
                {b.principal && (
                  <span className="text-[10px] uppercase tracking-widest bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-2 py-0.5">
                    Comece aqui
                  </span>
                )}
              </h3>
              <p className="text-stone-500 text-xs mt-0.5 leading-relaxed">{b.desc}</p>
            </div>
          </div>
          <button
            onClick={() => gerarBloco(b.id)}
            disabled={!!gerandoBloco || workspace?.carregando}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all shrink-0"
            style={{ background: gerandoEste ? 'var(--surface-3)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
          >
            {gerandoEste
              ? <><Loader2 size={12} className="animate-spin" /> {b.principal ? 'Analisando...' : 'Gerando...'}</>
              : <><Sparkles size={12} /> {b.principal ? (c ? 'Analisar novamente' : 'Analisar') : (c ? 'Regenerar' : 'Gerar')}</>}
          </button>
        </div>

        {!b.principal && !temPersona && (
          <p className="text-amber-400/90 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            💡 Gere a Persona primeiro para resultados direcionados
          </p>
        )}

        {erro && (
          <div className="bg-red-950/40 border border-red-900/50 rounded-lg p-3 flex items-start gap-2">
            <X size={13} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-red-300 text-xs">{erro}</p>
              <button
                onClick={() => gerarBloco(b.id)}
                disabled={!!gerandoBloco}
                className="text-xs text-red-300 underline mt-1 hover:text-red-200 transition-colors disabled:opacity-50"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {gerandoEste && (
          <div className="flex items-center gap-2 py-2">
            <Loader2 size={14} className="animate-spin text-violet-400" />
            <p className="text-stone-400 text-xs">Gerando com Gemini...</p>
          </div>
        )}

        {!gerandoEste && !c && !erro && (
          <p className="text-stone-600 text-xs">
            {b.principal ? 'Nada analisado ainda — clique em Analisar.' : 'Nada gerado ainda — clique em Gerar.'}
          </p>
        )}

        {!gerandoEste && c && (
          <div className="space-y-3">
            <button
              onClick={() => toggleBlocoAberto(b.id)}
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 transition-colors"
            >
              <ChevronRight size={13} className={`transition-transform ${aberto ? 'rotate-90' : ''}`} />
              {aberto ? 'Ocultar resultado' : 'Ver resultado'}
            </button>
            {aberto && renderResultadoBloco(b)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-stone-950">
      <Header title="Estúdio IA" />

      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">

        {/* ── Cabeçalho da página ── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-stone-100 flex items-center gap-2.5">
              <Sparkles size={26} className="text-sky-400 shrink-0" />
              Estúdio IA
            </h1>
            <p className="text-stone-400 text-sm mt-2 max-w-2xl leading-relaxed">
              Pesquise um produto e a análise é salva automaticamente — abra-a no histórico
              para gerar persona, palavras-chave, títulos, descrição, fotos e kits.
            </p>
          </div>
          <p className="text-stone-500 text-sm shrink-0 sm:text-right sm:pb-1">{fmtHoje()}</p>
        </div>

        {/* ── Barra de pesquisa (única etapa) ── */}
        <form onSubmit={buscar} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="text"
              value={termo}
              onChange={e => setTermo(e.target.value)}
              placeholder="Digite um produto (ex: fone bluetooth) ou cole o link de um anúncio do ML..."
              className="w-full bg-stone-900 border border-stone-800 rounded-xl pl-11 pr-4 py-3.5 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={buscando || !termo.trim()}
            className="px-7 py-3.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shrink-0"
          >
            {buscando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {buscando ? 'Analisando...' : 'Analisar'}
          </button>
        </form>

        {erroBusca && <p className="text-red-400 text-xs mt-2">{erroBusca}</p>}

        {/* ── Feedback da análise recém-criada ── */}
        {feedback && !buscando && (
          <div className="mt-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <p className="text-sm min-w-0">
                <span className="text-emerald-300 font-medium">Análise concluída</span>
                <span className="text-stone-400"> · {feedback.n} anúncio{feedback.n !== 1 ? 's' : ''} · </span>
                <span className="text-stone-300 truncate">"{feedback.termo}"</span>
              </p>
            </div>
            {feedback.estudoId && (
              <button
                onClick={() => abrirEstudo(feedback.estudoId, { termo: feedback.termo })}
                className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                <Wand2 size={13} /> Abrir análise
              </button>
            )}
          </div>
        )}

        {/* ── Faixa compacta: resumo + tendências + mais vendidos ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          {/* Resumo */}
          <div className="bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">
              <Sparkles size={14} className="text-sky-400" />
            </div>
            <div className="flex items-baseline gap-4">
              <div>
                <p className="text-stone-100 text-lg font-bold tabular-nums leading-none">{historico.length}</p>
                <p className="text-stone-500 text-[11px] mt-1">análises</p>
              </div>
              <div>
                <p className="text-stone-100 text-lg font-bold tabular-nums leading-none">{analisesMes}</p>
                <p className="text-stone-500 text-[11px] mt-1">neste mês</p>
              </div>
            </div>
          </div>

          {/* Tendências da última análise */}
          <div className="bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp size={13} className="text-sky-400 shrink-0" />
              <p className="text-stone-300 text-xs font-semibold truncate">
                Tendências{mercadoAtual?.categoria ? ` · ${mercadoAtual.categoria}` : ' do ML'}
              </p>
            </div>
            {mercadoAtual?.tendencias?.length > 0 ? (
              <div className="flex flex-wrap gap-1 overflow-hidden max-h-12">
                {mercadoAtual.tendencias.slice(0, 6).map((t, i) => (
                  <button
                    key={i}
                    onClick={() => { setTermo(t); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    title={`Usar "${t}" como termo de busca`}
                    className="text-[11px] bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/25 rounded-full px-2 py-0.5 transition-colors truncate max-w-full"
                  >
                    {t}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-stone-600 text-[11px]">Pesquise um produto para ver os termos mais buscados.</p>
            )}
          </div>

          {/* Mais vendidos da última análise */}
          <div className="bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Trophy size={13} className="text-amber-400 shrink-0" />
              <p className="text-stone-300 text-xs font-semibold">Mais vendidos da categoria</p>
            </div>
            {mercadoAtual?.mais_vendidos?.length > 0 ? (
              <ul className="space-y-1">
                {mercadoAtual.mais_vendidos.slice(0, 3).map((m, i) => (
                  <li key={m.id || i} className="flex items-center gap-2 min-w-0">
                    <span className={`text-[11px] font-bold tabular-nums w-4 shrink-0 ${
                      i === 0 ? 'text-amber-400' : i === 1 ? 'text-stone-400' : 'text-amber-700'
                    }`}>#{i + 1}</span>
                    <p className="text-stone-400 text-[11px] truncate flex-1">{m.title}</p>
                    {m.price != null && <span className="text-stone-500 text-[11px] shrink-0">{fmtBRL(m.price)}</span>}
                    {m.permalink && (
                      <a href={m.permalink} target="_blank" rel="noreferrer"
                        className="text-stone-600 hover:text-sky-400 transition-colors shrink-0">
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-stone-600 text-[11px]">Pesquise um produto para ver o ranking da categoria.</p>
            )}
          </div>
        </div>

        {/* ══ Área principal: histórico OU workspace da análise ══ */}
        <div ref={workspaceRef} className="mt-5 scroll-mt-4">

        {!workspace ? (
          /* ── Histórico de Análises (lista principal, full-width) ── */
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0">
                  <Clock size={16} className="text-sky-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-stone-100 text-base font-semibold leading-tight">Histórico de Análises</h2>
                  <p className="text-stone-500 text-xs mt-0.5">Clique em uma análise para abrir o workspace com as Ferramentas de IA</p>
                </div>
              </div>
              {historico.length > 0 && (
                <div className="relative sm:w-64 shrink-0">
                  <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
                  <input
                    type="text"
                    value={buscaHist}
                    onChange={e => setBuscaHist(e.target.value)}
                    placeholder="Pesquisar no histórico..."
                    className="w-full bg-stone-800 border border-stone-700 rounded-lg pl-9 pr-3 py-2 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                </div>
              )}
            </div>

            <div className="mt-4">
              {carregandoHist && historico.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Loader2 size={20} className="animate-spin text-stone-600" />
                  <p className="text-stone-500 text-xs">Carregando histórico...</p>
                </div>
              ) : historico.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
                  <FileSearch size={28} className="text-stone-600" />
                  <p className="text-stone-400 text-sm font-medium">Nenhuma análise ainda</p>
                  <p className="text-stone-500 text-xs">Pesquise um produto acima — a análise é criada e salva automaticamente.</p>
                </div>
              ) : historicoFiltrado.length === 0 ? (
                <p className="text-stone-500 text-xs text-center py-8">
                  Nada encontrado para "{buscaHist}".
                </p>
              ) : (
                <div className="space-y-1 -mx-2">
                  {historicoFiltrado.map(h => {
                    const n = h.num_produtos || 0
                    return (
                      <div
                        key={h.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => abrirEstudo(h.id, { termo: h.termo || h.link, criadoEm: h.created_at })}
                        onKeyDown={e => { if (e.key === 'Enter') abrirEstudo(h.id, { termo: h.termo || h.link, criadoEm: h.created_at }) }}
                        className="group w-full text-left flex items-center gap-3 rounded-xl px-3 py-3 border border-transparent hover:bg-stone-800/60 hover:border-stone-700/60 transition-colors cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-stone-200 text-sm font-medium truncate">
                              {h.termo || h.link || 'Análise'}
                            </span>
                            <span className="text-stone-500 text-xs shrink-0">{fmtDataHist(h.created_at)}</span>
                          </div>
                          <div className="flex items-center gap-2.5 mt-1 min-w-0">
                            <span className="text-emerald-400 text-xs flex items-center gap-1 shrink-0">
                              <CheckCircle2 size={11} />
                              Concluída{n > 0 && ` · ${n} anúncio${n !== 1 ? 's' : ''}`}
                            </span>
                            {h.persona && (
                              <span className="text-stone-500 text-xs truncate">{h.persona}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-stone-600 group-hover:text-stone-400 transition-colors shrink-0" />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Workspace da análise ── */
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 md:p-6 space-y-5">

            {/* Header do workspace */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <button
                  onClick={fecharWorkspace}
                  className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 transition-colors mb-2.5"
                >
                  <ArrowLeft size={13} /> Voltar ao histórico
                </button>
                <h2 className="text-stone-100 text-lg font-semibold leading-tight truncate flex items-center gap-2">
                  <Wand2 size={17} className="text-violet-400 shrink-0" />
                  {workspace.termo}
                </h2>
                <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                  {workspace.criadoEm && (
                    <span className="text-stone-500 text-xs">{fmtDataHist(workspace.criadoEm)}</span>
                  )}
                  {!workspace.carregando && (
                    <span className="text-emerald-400 text-xs flex items-center gap-1">
                      <CheckCircle2 size={11} /> Concluída · {produtosWs.length} anúncio{produtosWs.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={fecharWorkspace}
                title="Fechar workspace"
                className="p-2.5 rounded-xl bg-stone-800 border border-stone-700 text-stone-400 hover:text-stone-200 transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {workspace.erro && (
              <p className="text-red-400 text-xs">Erro ao carregar a análise: {workspace.erro}</p>
            )}

            {workspace.carregando ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 size={22} className="animate-spin text-stone-600" />
                <p className="text-stone-500 text-xs">Carregando análise...</p>
              </div>
            ) : (
              <>
                {/* Infos da análise: preços */}
                {precosWs && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-stone-800/60 border border-stone-700/50 rounded-xl px-4 py-3">
                      <p className="text-stone-500 text-[11px] uppercase tracking-widest">Menor preço</p>
                      <p className="text-stone-100 text-base font-bold mt-0.5">{fmtBRL(precosWs.min)}</p>
                    </div>
                    <div className="bg-stone-800/60 border border-stone-700/50 rounded-xl px-4 py-3">
                      <p className="text-stone-500 text-[11px] uppercase tracking-widest">Preço médio</p>
                      <p className="text-sky-400 text-base font-bold mt-0.5">{fmtBRL(precosWs.media)}</p>
                    </div>
                    <div className="bg-stone-800/60 border border-stone-700/50 rounded-xl px-4 py-3">
                      <p className="text-stone-500 text-[11px] uppercase tracking-widest">Maior preço</p>
                      <p className="text-stone-100 text-base font-bold mt-0.5">{fmtBRL(precosWs.max)}</p>
                    </div>
                  </div>
                )}

                {/* Produtos analisados — seleção de anúncios de referência */}
                {produtosWs.length > 0 && (
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                      <p className="text-stone-400 text-xs uppercase tracking-widest flex items-center gap-1.5 min-w-0">
                        <Package size={12} className="shrink-0" />
                        <span className="truncate">
                          Anúncios analisados · {produtosSelecionadosWs.length} de {produtosWs.length} selecionado{produtosWs.length !== 1 ? 's' : ''}
                        </span>
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={selecionarTodos}
                          disabled={produtosSelecionadosWs.length === produtosWs.length}
                          className="text-[11px] text-stone-400 hover:text-stone-200 bg-stone-800 border border-stone-700 hover:border-stone-600 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Selecionar todos
                        </button>
                        <button
                          onClick={limparSelecao}
                          disabled={produtosSelecionadosWs.length <= 1}
                          title="Mantém o 1º anúncio — mínimo 1 selecionado"
                          className="text-[11px] text-stone-400 hover:text-stone-200 bg-stone-800 border border-stone-700 hover:border-stone-600 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                    <p className="text-stone-600 text-[11px] mb-2.5 -mt-1">
                      Os blocos de IA e a faixa de preço usam apenas os anúncios selecionados como referência.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                      {produtosWs.map((p, i) => {
                        const vpdLabel = fmtVpd(vendasPorDia(p))
                        const chave = chaveProduto(p, i)
                        const marcado = selecionados.has(chave)
                        return (
                          <div
                            key={chave}
                            role="checkbox"
                            aria-checked={marcado}
                            tabIndex={0}
                            onClick={() => toggleSelecionado(chave)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelecionado(chave) } }}
                            title={marcado ? 'Desmarcar como referência' : 'Usar como referência'}
                            className={`relative rounded-xl p-2.5 min-w-0 cursor-pointer border transition-all ${
                              marcado
                                ? 'bg-stone-800/60 border-violet-500/40 hover:border-violet-400/60'
                                : 'bg-stone-800/30 border-stone-700/50 hover:border-stone-600 opacity-55'
                            }`}
                          >
                            {/* Checkbox (canto superior direito) */}
                            <span
                              aria-hidden="true"
                              className={`absolute top-2 right-2 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                marcado
                                  ? 'bg-violet-500 border-violet-400 text-white'
                                  : 'bg-stone-900 border-stone-600'
                              }`}
                            >
                              {marcado && <Check size={11} strokeWidth={3} />}
                            </span>
                            <div className="flex items-center gap-2 mb-1.5 pr-5">
                              {p.thumbnail
                                ? <img src={p.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover bg-stone-700 shrink-0" />
                                : <div className="w-10 h-10 rounded-lg bg-stone-700 shrink-0" />}
                              <span className={`text-[11px] font-bold tabular-nums ${
                                i === 0 ? 'text-amber-400' : i === 1 ? 'text-stone-400' : i === 2 ? 'text-amber-700' : 'text-stone-600'
                              }`}>#{i + 1}</span>
                              {p.meu && (
                                <span className="text-[9px] uppercase tracking-wider bg-sky-500/15 text-sky-400 border border-sky-500/25 rounded-full px-1.5 py-0.5">minha loja</span>
                              )}
                            </div>
                            <p className="text-stone-300 text-[11px] leading-snug line-clamp-2">{p.title}</p>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className="text-sky-400 text-xs font-semibold">{fmtBRL(p.price)}</span>
                              {p.sold_quantity > 0 && (
                                <span className="text-[10px] text-emerald-500">{fmtNum(p.sold_quantity)} vendas</span>
                              )}
                              {vpdLabel && (
                                <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                                  <Zap size={8} className="shrink-0" />{vpdLabel}
                                </span>
                              )}
                              {p.permalink && (
                                <a
                                  href={p.permalink}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Abrir anúncio no Mercado Livre"
                                  onClick={e => e.stopPropagation()}
                                  className="ml-auto text-stone-600 hover:text-sky-400 transition-colors shrink-0"
                                >
                                  <ExternalLink size={11} />
                                </a>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Ferramentas de IA */}
                <div className="space-y-4 pt-1">
                  <p className="text-stone-400 text-xs uppercase tracking-widest flex items-center gap-1.5">
                    <Wand2 size={12} className="text-violet-400" /> Ferramentas de IA
                  </p>

                  {/* Bloco principal: Persona do Produto */}
                  {renderBlocoCard(BLOCOS_IA[0])}

                  {/* Demais ferramentas — habilitadas sempre; persona direciona */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    {BLOCOS_IA.slice(1).map(b => renderBlocoCard(b))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
