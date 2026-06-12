import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Search, Sparkles, Copy, Check, RefreshCw, Loader2,
  ExternalLink, Download, Package, SlidersHorizontal, Zap, Clock,
  TrendingUp, Trophy, CheckCircle2, ChevronRight, FileSearch,
  Wand2, X, Save,
} from 'lucide-react'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const TIPOS = [
  { id: 'persona',  label: '🧠 Persona Cazonato',   desc: 'Quem compra + oferta direcionada' },
  { id: 'mercado',  label: '🔍 Pesquisa de Mercado', desc: 'Concorrência, SEO e copy' },
  { id: 'imagem',   label: '🖼️ Prompts de Imagem',   desc: '6 prompts para IA (FLUX, Midjourney…)' },
  { id: 'video',    label: '🎬 Prompts de Vídeo',    desc: 'Kling AI + roteiro Reels/TikTok' },
]

// Ferramentas de IA — blocos da oferta direcionada (metodologia de persona).
// Cada bloco gera UMA coisa por vez; 'persona' é o bloco principal e guia os demais.
const BLOCOS_IA = [
  { id: 'persona',        icone: '🧑', nome: 'Persona (método Cazonato)', desc: 'Quem é o público majoritário que compra — com evidências, dores e quebras de objeção.', principal: true },
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

function splitResultado(texto) {
  if (!texto) return { persona: '', mercado: '', imagem: '', video: '' }

  const HEADERS = {
    persona: '# 🧠 PERSONA CAZONATO',
    mercado: '# 🔍 PESQUISA DE MERCADO',
    imagem:  '# 🖼️ PROMPTS DE IMAGEM',
    video:   '# 🎬 PROMPTS DE VÍDEO',
  }

  const cortes = Object.entries(HEADERS)
    .map(([chave, header]) => ({ chave, idx: texto.indexOf(header) }))
    .filter(c => c.idx !== -1)
    .sort((a, b) => a.idx - b.idx)

  if (cortes.length === 0) {
    return { persona: texto, mercado: '', imagem: '', video: '' }
  }

  const partes = {}
  cortes.forEach(({ chave, idx }, i) => {
    const fim = cortes[i + 1]?.idx ?? texto.length
    partes[chave] = texto.slice(idx, fim).trim()
  })

  return {
    persona: partes.persona || '',
    mercado: partes.mercado || '',
    imagem:  partes.imagem  || '',
    video:   partes.video   || '',
  }
}

function mdParaHtml(md) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = s =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,   '<em>$1</em>')
      .replace(/`(.+?)`/g,     '<code>$1</code>')

  const lines = md.split('\n')
  const out = []
  let inUl = false, inOl = false, inPre = false
  let paraBuffer = []

  const flushPara = () => {
    if (paraBuffer.length) { out.push(`<p>${paraBuffer.join('<br>')}</p>`); paraBuffer = [] }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.startsWith('```')) {
      flushPara()
      if (inUl) { out.push('</ul>'); inUl = false }
      if (inOl) { out.push('</ol>'); inOl = false }
      inPre ? (out.push('</code></pre>'), inPre = false) : (out.push('<pre><code>'), inPre = true)
      continue
    }
    if (inPre) { out.push(esc(line)); continue }
    if (/^#{1,6} /.test(line)) {
      flushPara()
      if (inUl) { out.push('</ul>'); inUl = false }
      if (inOl) { out.push('</ol>'); inOl = false }
      const lvl = Math.min(line.match(/^(#+)/)[1].length, 6)
      out.push(`<h${lvl}>${inline(line.replace(/^#+\s/, ''))}</h${lvl}>`)
      continue
    }
    if (/^[-*] /.test(line)) {
      flushPara()
      if (inOl) { out.push('</ol>'); inOl = false }
      if (!inUl) { out.push('<ul>'); inUl = true }
      out.push(`<li>${inline(line.slice(2))}</li>`)
      continue
    }
    if (/^\d+\. /.test(line)) {
      flushPara()
      if (inUl) { out.push('</ul>'); inUl = false }
      if (!inOl) { out.push('<ol>'); inOl = true }
      out.push(`<li>${inline(line.replace(/^\d+\.\s/, ''))}</li>`)
      continue
    }
    if (/^---+$/.test(line)) {
      flushPara()
      if (inUl) { out.push('</ul>'); inUl = false }
      if (inOl) { out.push('</ol>'); inOl = false }
      out.push('<hr>'); continue
    }
    if (line === '') {
      flushPara()
      if (inUl) { out.push('</ul>'); inUl = false }
      if (inOl) { out.push('</ol>'); inOl = false }
      continue
    }
    if (inUl) { out.push('</ul>'); inUl = false }
    if (inOl) { out.push('</ol>'); inOl = false }
    paraBuffer.push(inline(line))
  }
  flushPara()
  if (inUl) out.push('</ul>')
  if (inOl) out.push('</ol>')
  if (inPre) out.push('</code></pre>')
  return out.join('\n')
}

export default function EstudioIA() {
  const { getToken, activeAccount } = useAuth()

  // ── Modo de entrada ───────────────────────────────────────────────
  const [modoEntrada, setModoEntrada] = useState('pesquisa') // 'pesquisa' | 'meus-produtos'

  // ── Pesquisa ML ───────────────────────────────────────────────────
  const [termo, setTermo]         = useState('')
  const [buscando, setBuscando]   = useState(false)
  const [produtos, setProdutos]   = useState([])
  const [mercado, setMercado]     = useState(null)
  const [erroBusca, setErroBusca] = useState('')
  const [selecionados, setSelecionados] = useState(new Set())

  // ── Modo manual (colar links) ─────────────────────────────────────
  const [modoManual, setModoManual] = useState(false)
  const [linksTexto, setLinksTexto] = useState('')
  const [buscandoLinks, setBuscandoLinks] = useState(false)

  // ── Filtros ───────────────────────────────────────────────────────
  const [filtroAberto, setFiltroAberto] = useState(false)
  const [filtros, setFiltros] = useState({ minVendas: '', minPreco: '', maxPreco: '', minVelocidade: '', dataDe: '', dataAte: '' })

  const setFiltro = (key, val) => setFiltros(prev => ({ ...prev, [key]: val }))

  // ── Meus Produtos ─────────────────────────────────────────────────
  const [buscaMeus, setBuscaMeus] = useState('')
  const [meusSel, setMeusSel]     = useState(new Set())

  const { data: dadosCustos, isLoading: carregandoMeus } = useQuery({
    queryKey: ['custos', activeAccount],
    queryFn: () => api.custos.list({ conta_ml: activeAccount }),
    enabled: !!activeAccount && modoEntrada === 'meus-produtos',
  })
  const meusProdutos = (dadosCustos?.produtos ?? []).filter(p =>
    p.titulo?.toLowerCase().includes(buscaMeus.toLowerCase())
  )

  // ── Tipos de geração (multi-select) ──────────────────────────────
  const [tiposSel, setTiposSel] = useState(new Set(['persona']))

  // ── Resultado ─────────────────────────────────────────────────────
  const [gerando, setGerando]     = useState(false)
  const [resultado, setResultado] = useState('')
  const [erroGerar, setErroGerar] = useState('')
  const [tabAtiva, setTabAtiva]   = useState('persona')
  const [copiado, setCopiado]     = useState('')
  const [retryIn, setRetryIn]     = useState(0)
  const [estudoId, setEstudoId]   = useState(null)

  // ── Histórico de estudos ──────────────────────────────────────────
  const [historico, setHistorico]   = useState([])
  const [buscaHist, setBuscaHist]   = useState('')
  const [carregandoHist, setCarregandoHist] = useState(false)

  // ── Ferramentas de IA (blocos da oferta direcionada) ──────────────
  const [painelFerramentas, setPainelFerramentas] = useState(null)
  // painelFerramentas: { estudoId, termo, criadoEm, produtos, mercado, carregando, erro }
  const [blocos, setBlocos] = useState({})                 // { [blocoId]: conteudo }
  const [blocosOriginais, setBlocosOriginais] = useState({})
  const [blocosAbertos, setBlocosAbertos] = useState(new Set())
  const [gerandoBloco, setGerandoBloco] = useState(null)   // UM gerador por vez
  const [errosBloco, setErrosBloco] = useState({})
  const [salvandoBloco, setSalvandoBloco] = useState(null)
  const [salvoBloco, setSalvoBloco] = useState('')
  const painelFerramentasRef = useRef(null)

  const abortRef  = useRef(null)
  const retryTimer = useRef(null)

  // Cleanup ao desmontar: cancela fetch e timer de retry
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
      if (retryTimer.current) clearInterval(retryTimer.current)
    }
  }, [])

  // Seleciona todos ao carregar produtos
  useEffect(() => {
    if (produtos.length > 0) {
      setSelecionados(new Set(produtos.map(p => p.id)))
    }
  }, [produtos])

  // Carrega o histórico de estudos ao montar
  useEffect(() => {
    carregarHistorico()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function carregarHistorico() {
    setCarregandoHist(true)
    try {
      const res = await fetch(`${BASE}/api/estudio/historico?limit=100`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setHistorico(data.estudos || [])
    } catch {
      /* histórico é best-effort — silencioso */
    } finally {
      setCarregandoHist(false)
    }
  }

  async function abrirEstudo(id) {
    try {
      const res = await fetch(`${BASE}/api/estudio/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) return
      const { estudo } = await res.json()
      if (estudo?.conteudo_md) {
        setResultado(estudo.conteudo_md)
        setEstudoId(estudo.id)
        setErroGerar('')
        const primeiroTipo = TIPOS.find(t => (estudo.tipos || []).includes(t.id))
        if (primeiroTipo) setTabAtiva(primeiroTipo.id)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch {
      /* silencioso */
    }
  }

  // ── Ferramentas de IA: handlers ───────────────────────────────────
  function scrollParaFerramentas() {
    setTimeout(() => painelFerramentasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

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
    const abertos = new Set()
    for (const b of BLOCOS_IA) {
      if (conteudoGerado[b.id] && typeof conteudoGerado[b.id] === 'object') {
        novos[b.id] = normalizarBlocoLocal(b.id, conteudoGerado[b.id])
      }
    }
    setBlocos(novos)
    setBlocosOriginais(JSON.parse(JSON.stringify(novos)))
    setBlocosAbertos(abertos)
  }

  async function abrirFerramentasDoHistorico(h) {
    resetBlocos()
    setPainelFerramentas({
      estudoId: h.id,
      termo: h.termo || h.link || 'Estudo',
      criadoEm: h.created_at,
      produtos: [],
      mercado: null,
      carregando: true,
    })
    scrollParaFerramentas()
    try {
      const { estudo } = await api.estudio.get(h.id)
      setPainelFerramentas({
        estudoId: estudo.id,
        termo: estudo.termo || estudo.link || 'Estudo',
        criadoEm: estudo.created_at,
        produtos: Array.isArray(estudo.produtos_analisados) ? estudo.produtos_analisados : [],
        mercado: null,
        carregando: false,
      })
      carregarBlocosDoConteudo(estudo.conteudo_gerado)
    } catch (err) {
      setPainelFerramentas(p => (p ? { ...p, carregando: false, erro: err.message } : p))
    }
  }

  function abrirFerramentasDaBusca() {
    const prods = produtos.filter(p => selecionados.has(p.id))
    if (!prods.length) return
    resetBlocos()
    setPainelFerramentas({
      estudoId: null,
      termo: termo.trim() || 'Busca',
      criadoEm: new Date().toISOString(),
      produtos: prods,
      mercado,
      carregando: false,
    })
    scrollParaFerramentas()
  }

  async function gerarBloco(blocoId) {
    if (!painelFerramentas || painelFerramentas.carregando || gerandoBloco) return
    setGerandoBloco(blocoId)
    setErrosBloco(prev => ({ ...prev, [blocoId]: '' }))
    try {
      const payload = { bloco: blocoId }
      if (painelFerramentas.estudoId) payload.estudo_id = painelFerramentas.estudoId
      if (painelFerramentas.termo) payload.termo = painelFerramentas.termo
      if (painelFerramentas.produtos?.length) payload.produtos = painelFerramentas.produtos
      if (painelFerramentas.mercado) payload.mercado = painelFerramentas.mercado
      const data = await api.estudio.gerarConteudo(payload)
      const c = normalizarBlocoLocal(blocoId, data.conteudo)
      setBlocos(prev => ({ ...prev, [blocoId]: c }))
      setBlocosOriginais(prev => ({ ...prev, [blocoId]: JSON.parse(JSON.stringify(c)) }))
      setBlocosAbertos(prev => new Set(prev).add(blocoId))
      if (data.estudo_id) {
        setPainelFerramentas(p => (p ? { ...p, estudoId: data.estudo_id } : p))
      }
      carregarHistorico()
    } catch (err) {
      setErrosBloco(prev => ({ ...prev, [blocoId]: err.message }))
    } finally {
      setGerandoBloco(null)
    }
  }

  async function salvarBloco(blocoId) {
    if (!painelFerramentas?.estudoId || !blocos[blocoId] || salvandoBloco) return
    setSalvandoBloco(blocoId)
    setErrosBloco(prev => ({ ...prev, [blocoId]: '' }))
    try {
      const data = await api.estudio.salvarConteudo(painelFerramentas.estudoId, blocos[blocoId], blocoId)
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

  function fecharFerramentas() {
    setPainelFerramentas(null)
    resetBlocos()
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

  // ── Helpers ───────────────────────────────────────────────────────
  function toggleProduto(id) {
    setSelecionados(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function toggleTipo(id) {
    setTiposSel(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function marcarTodosTipos() {
    setTiposSel(prev =>
      prev.size === TIPOS.length ? new Set() : new Set(TIPOS.map(t => t.id))
    )
  }

  function toggleMeuProduto(id) {
    setMeusSel(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  // ── Busca produtos via backend ────────────────────────────────────
  async function buscarProdutos(e, opcoesExtras = {}) {
    e?.preventDefault()
    const t = termo.trim()
    if (!t) return

    const dataDe  = opcoesExtras.dataDe  ?? ''
    const dataAte = opcoesExtras.dataAte ?? ''
    const isRefiltro = opcoesExtras.refiltro ?? false

    setBuscando(true)
    setErroBusca('')
    setProdutos([])
    setMercado(null)
    setResultado('')
    setModoManual(false)
    if (!isRefiltro) {
      setFiltros({ minVendas: '', minPreco: '', maxPreco: '', minVelocidade: '', dataDe: '', dataAte: '' })
      setFiltroAberto(false)
    }

    const isLink = t.startsWith('http')
    let params = isLink ? `link=${encodeURIComponent(t)}` : `termo=${encodeURIComponent(t)}`
    if (dataDe)  params += `&data_de=${dataDe}`
    if (dataAte) params += `&data_ate=${dataAte}`

    try {
      const res = await fetch(`${BASE}/api/estudio/buscar?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.erro || `HTTP ${res.status}`)
      const lista = data.produtos || []
      setProdutos(lista)
      setMercado(data.mercado || null)
      // Se 0 resultados em busca por termo, ativa modo manual
      if (lista.length === 0 && !isLink) setModoManual(true)
    } catch (err) {
      setErroBusca(err.message)
    } finally {
      setBuscando(false)
    }
  }

  // ── Busca por links colados manualmente ──────────────────────────
  async function buscarPorLinks(e) {
    e?.preventDefault()
    const linhas = linksTexto.split(/[\n,]+/).map(l => l.trim()).filter(Boolean)
    if (!linhas.length) return

    setBuscandoLinks(true)
    setErroBusca('')
    setProdutos([])
    setResultado('')

    try {
      const params = `links=${encodeURIComponent(linhas.join(','))}`
      const res = await fetch(`${BASE}/api/estudio/buscar-itens?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.erro || `HTTP ${res.status}`)
      const lista = data.produtos || []
      if (lista.length === 0) {
        setErroBusca('Nenhum produto encontrado. Verifique se os links são de anúncios do Mercado Livre.')
      } else {
        setProdutos(lista)
        setModoManual(false)
      }
    } catch (err) {
      setErroBusca(err.message)
    } finally {
      setBuscandoLinks(false)
    }
  }

  function aplicarFiltroData() {
    if (!termo.trim()) return
    buscarProdutos(null, { dataDe: filtros.dataDe, dataAte: filtros.dataAte, refiltro: true })
  }

  // ── Gera via SSE ──────────────────────────────────────────────────
  async function gerarEstudio() {
    const produtosParaGerar = modoEntrada === 'meus-produtos'
      ? meusProdutos
          .filter(p => meusSel.has(p.item_id))
          .map(p => ({ id: p.item_id, title: p.titulo, price: p.preco_venda }))
      : produtos.filter(p => selecionados.has(p.id))

    if (!produtosParaGerar.length || !tiposSel.size) return

    setGerando(true)
    setErroGerar('')
    setResultado('')

    const primeiroTipo = TIPOS.find(t => tiposSel.has(t.id))
    if (primeiroTipo) setTabAtiva(primeiroTipo.id)

    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`${BASE}/api/estudio/gerar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          termo: modoEntrada === 'meus-produtos' ? 'meus produtos' : termo,
          produtos: produtosParaGerar,
          tipos: Array.from(tiposSel),
          mercado: modoEntrada === 'meus-produtos' ? null : mercado,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.erro || `HTTP ${res.status}`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let parsed
          try { parsed = JSON.parse(line.slice(6)) } catch { continue }
          if (parsed.done) {
            if (parsed.estudo_id) setEstudoId(parsed.estudo_id)
            setGerando(false)
            carregarHistorico()
            return
          }
          if (parsed.rate_limit) {
            setGerando(false)
            let secs = parsed.retry_after || 62
            setRetryIn(secs)
            if (retryTimer.current) clearInterval(retryTimer.current)
            retryTimer.current = setInterval(() => {
              secs -= 1
              setRetryIn(s => {
                if (s <= 1) {
                  clearInterval(retryTimer.current)
                  retryTimer.current = null
                  gerarEstudio()
                  return 0
                }
                return s - 1
              })
            }, 1000)
            return
          }
          if (parsed.erro) throw new Error(parsed.erro)
          if (parsed.chunk) setResultado(prev => prev + parsed.chunk)
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') setErroGerar(err.message)
    } finally {
      setGerando(false)
    }
  }

  function copiar(chave, texto) {
    if (!texto) return
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(chave)
      setTimeout(() => setCopiado(''), 2000)
    })
  }

  function baixarArquivo() {
    if (!resultado) return
    const date = new Date().toISOString().slice(0, 10)
    const nomeBase = modoEntrada === 'meus-produtos'
      ? 'meus-produtos'
      : termo.replace(/\s+/g, '-').toLowerCase()
    const nomeArquivo = `estudio-${nomeBase}-${date}.html`
    const corpo = mdParaHtml(resultado)
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Estúdio IA — ${termo || 'Meus Produtos'}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0c0c0e;color:#d4d4d8;line-height:1.75;padding:40px 20px 80px}
.wrapper{max-width:820px;margin:0 auto}
.topo{margin-bottom:36px;padding-bottom:20px;border-bottom:1px solid #27272a}
.topo h1{font-size:1.3rem;color:#38bdf8;font-weight:700;margin-bottom:4px}
.topo p{font-size:0.78rem;color:#52525b}
h1{font-size:1.45rem;color:#38bdf8;margin:40px 0 12px;font-weight:700}
h2{font-size:1.1rem;color:#7dd3fc;margin:28px 0 10px;font-weight:600}
h3{font-size:1rem;color:#93c5fd;margin:20px 0 8px;font-weight:600}
h4,h5,h6{font-size:.95rem;color:#bae6fd;margin:16px 0 6px;font-weight:600}
p{margin:8px 0;color:#a1a1aa}
ul,ol{margin:8px 0 8px 24px;color:#a1a1aa}
li{margin:4px 0}
strong{color:#e4e4e7;font-weight:600}
em{color:#c4c4c8;font-style:italic}
code{background:#1e1e2e;color:#7dd3fc;padding:2px 6px;border-radius:4px;font-size:.85em;font-family:monospace}
pre{background:#1e1e2e;border:1px solid #27272a;border-radius:8px;padding:16px;overflow-x:auto;margin:16px 0}
pre code{background:none;padding:0;color:#a8ff78}
hr{border:none;border-top:1px solid #27272a;margin:32px 0}
</style>
</head>
<body>
<div class="wrapper">
<div class="topo">
<h1>Estúdio IA — ${termo || 'Meus Produtos'}</h1>
<p>Gerado em ${date} · Seller ML</p>
</div>
${corpo}
</div>
</body>
</html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = nomeArquivo; a.click()
    URL.revokeObjectURL(url)
  }

  // Produtos filtrados (client-side)
  const produtosFiltrados = produtos.filter(p => {
    // sold_quantity null significa dado indisponível — não filtrar (benefício da dúvida)
    if (filtros.minVendas && p.sold_quantity !== null && p.sold_quantity !== undefined
        && p.sold_quantity < Number(filtros.minVendas)) return false
    if (filtros.minPreco  && (p.price ?? 0) < Number(filtros.minPreco))  return false
    if (filtros.maxPreco  && (p.price ?? 0) > Number(filtros.maxPreco))  return false
    if (filtros.minVelocidade) {
      const vpd = vendasPorDia(p)
      // só filtra se tiver dado suficiente para calcular velocidade
      if (vpd !== null && vpd < Number(filtros.minVelocidade)) return false
    }
    return true
  })

  const filtrosAtivos = Object.values(filtros).some(v => v !== '')

  const secoes = splitResultado(resultado)
  const temResultado = !!(resultado || gerando || erroGerar)

  // Tabs dinâmicas — só os tipos selecionados
  const tabs = TIPOS
    .filter(t => tiposSel.has(t.id))
    .map(t => ({
      id: t.id,
      label: t.label,
      conteudo: secoes[t.id],
    }))

  const tabConteudo = tabs.find(t => t.id === tabAtiva)?.conteudo || ''

  const podeGerar = tiposSel.size > 0 && (
    modoEntrada === 'pesquisa'
      ? selecionados.size > 0
      : meusSel.size > 0
  )

  // ── Dados derivados do hub (histórico + resumo) ───────────────────
  const historicoFiltrado = historico.filter(h => {
    const q = buscaHist.trim().toLowerCase()
    if (!q) return true
    return (h.termo || '').toLowerCase().includes(q)
      || (h.link || '').toLowerCase().includes(q)
      || (h.persona || '').toLowerCase().includes(q)
      || (Array.isArray(h.tipos) ? h.tipos.join(' ') : '').toLowerCase().includes(q)
  })

  const agora = new Date()
  const analisesMes = historico.filter(h => {
    if (!h.created_at) return false
    const d = new Date(h.created_at)
    return !isNaN(d) && d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear()
  }).length
  const ultimaAnalise = historico[0]?.created_at ? fmtDataHist(historico[0].created_at) : null

  // ── Dados derivados das Ferramentas de IA ─────────────────────────
  const produtosPainel = painelFerramentas?.produtos || []
  const temPersona = !!blocos.persona

  // ── Ferramentas de IA: render helpers ─────────────────────────────
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
        disabled={!painelFerramentas?.estudoId || !blocoAlterado(blocoId) || !!salvandoBloco}
        title={!painelFerramentas?.estudoId ? 'Gere o conteúdo primeiro para poder salvar' : undefined}
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
            disabled={!!gerandoBloco || painelFerramentas?.carregando}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all shrink-0"
            style={{ background: gerandoEste ? 'var(--surface-3)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
          >
            {gerandoEste
              ? <><Loader2 size={12} className="animate-spin" /> Gerando...</>
              : <><Sparkles size={12} /> {c ? 'Regenerar' : 'Gerar'}</>}
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
          <p className="text-stone-600 text-xs">Nada gerado ainda — clique em Gerar.</p>
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
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-8">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-stone-100 flex items-center gap-2.5">
              <Sparkles size={26} className="text-sky-400 shrink-0" />
              Estúdio IA
            </h1>
            <p className="text-stone-400 text-sm mt-2 max-w-2xl leading-relaxed">
              Analise produtos com IA: persona, pesquisa de mercado, prompts de imagem e vídeo —
              tudo a partir de dados reais do Mercado Livre.
            </p>
          </div>
          <p className="text-stone-500 text-sm shrink-0 sm:text-right sm:pb-1">{fmtHoje()}</p>
        </div>

        {/* ── Layout: 1 col sem resultado / 2 cols com resultado ── */}
        <div className={temResultado ? 'grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-5 items-start' : 'space-y-4'}>

        {/* ── Coluna esquerda: configuração ── */}
        <div className="space-y-4">

        {/* ── Step 1: Pesquisar Produtos (modo de entrada + produtos) ── */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 md:p-6 space-y-4">

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0">
              <Search size={16} className="text-sky-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-stone-100 text-base font-semibold leading-tight">Pesquisar Produtos</h2>
              <p className="text-stone-500 text-xs mt-0.5">
                Encontre concorrentes no ML ou analise os produtos da sua loja
              </p>
            </div>
          </div>

          {/* Tabs de modo */}
          <div className="flex gap-2">
            <button
              onClick={() => setModoEntrada('pesquisa')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                modoEntrada === 'pesquisa'
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  : 'bg-stone-800 text-stone-500 border border-stone-700 hover:text-stone-300'
              }`}
            >
              <Search size={14} /> Pesquisar no ML
            </button>
            <button
              onClick={() => setModoEntrada('meus-produtos')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                modoEntrada === 'meus-produtos'
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  : 'bg-stone-800 text-stone-500 border border-stone-700 hover:text-stone-300'
              }`}
            >
              <Package size={14} /> Meus Produtos
            </button>
          </div>

          {/* ── Pesquisar no ML ── */}
          {modoEntrada === 'pesquisa' && (
            <div className="space-y-3">
              <form onSubmit={buscarProdutos} className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" />
                  <input
                    type="text"
                    value={termo}
                    onChange={e => setTermo(e.target.value)}
                    placeholder='Digite um termo de busca ou cole um link de anúncio do ML...'
                    className="w-full bg-stone-800 border border-stone-700 rounded-xl pl-11 pr-4 py-3 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={buscando || !termo.trim()}
                  className="px-6 py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shrink-0"
                >
                  {buscando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                  Buscar
                </button>
              </form>

              {erroBusca && <p className="text-red-400 text-xs">{erroBusca}</p>}

              {/* ── Modo manual: cole os links ── */}
              {modoManual && !buscando && produtos.length === 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400 text-lg">⚠️</span>
                    <div>
                      <p className="text-amber-300 text-sm font-medium">Busca automática indisponível</p>
                      <p className="text-stone-400 text-xs mt-1">
                        O ML bloqueia buscas automáticas para este tipo de app. Cole os links dos concorrentes abaixo — funciona perfeitamente!
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <a
                      href={`https://lista.mercadolivre.com.br/${encodeURIComponent(termo.trim().replace(/\s+/g, '-'))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      <ExternalLink size={12} /> Pesquisar "{termo}" no ML
                    </a>
                  </div>

                  <div className="space-y-2">
                    <p className="text-stone-400 text-xs">Cole os links dos produtos (um por linha):</p>
                    <textarea
                      value={linksTexto}
                      onChange={e => setLinksTexto(e.target.value)}
                      placeholder={`https://www.mercadolivre.com.br/produto-1/p/MLB123\nhttps://www.mercadolivre.com.br/produto-2/p/MLB456\nhttps://www.mercadolivre.com.br/produto-3/p/MLB789`}
                      rows={4}
                      className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-300 placeholder-stone-600 focus:outline-none focus:border-sky-500 font-mono resize-none"
                    />
                    <button
                      onClick={buscarPorLinks}
                      disabled={buscandoLinks || !linksTexto.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {buscandoLinks ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                      Buscar produtos colados
                    </button>
                  </div>
                </div>
              )}

              {/* Grid de produtos */}
              {produtos.length > 0 && (
                <div className="space-y-3">
                  {/* Cabeçalho + filtro toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-stone-300 text-sm font-medium">
                        Top {produtos.length} mais vendidos
                      </span>
                      {produtos[0]?.category_name && (
                        <span className="text-xs text-stone-500 bg-stone-800 px-2 py-0.5 rounded-full">
                          {produtos[0].category_name}
                        </span>
                      )}
                      {filtrosAtivos && (
                        <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                          {produtosFiltrados.length} de {produtos.length}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setFiltroAberto(v => !v)}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                          filtroAberto || filtrosAtivos
                            ? 'bg-sky-500/15 border-sky-500/30 text-sky-400'
                            : 'bg-stone-800 border-stone-700 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        <SlidersHorizontal size={12} />
                        Filtros{filtrosAtivos ? ` (${Object.values(filtros).filter(Boolean).length})` : ''}
                      </button>
                      <button
                        onClick={() => setSelecionados(
                          selecionados.size === produtosFiltrados.length
                            ? new Set()
                            : new Set(produtosFiltrados.map(p => p.id))
                        )}
                        className="text-xs text-sky-500 hover:text-sky-400 transition-colors"
                      >
                        {selecionados.size === produtosFiltrados.length ? 'Limpar' : 'Marcar todos'}
                      </button>
                    </div>
                  </div>

                  {/* Painel de filtros */}
                  {filtroAberto && (
                    <div className="bg-stone-800/60 border border-stone-700 rounded-xl p-4 space-y-3">
                      {/* ── Filtros de data (requerem re-busca) ── */}
                      <div className="space-y-2">
                        <p className="text-stone-500 text-xs uppercase tracking-widest">📅 Anúncios criados no período</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-stone-400 text-xs">De</label>
                            <input
                              type="date"
                              value={filtros.dataDe}
                              onChange={e => setFiltro('dataDe', e.target.value)}
                              className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-200 focus:outline-none focus:border-sky-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-stone-400 text-xs">Até</label>
                            <input
                              type="date"
                              value={filtros.dataAte}
                              onChange={e => setFiltro('dataAte', e.target.value)}
                              className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-200 focus:outline-none focus:border-sky-500"
                            />
                          </div>
                        </div>
                        {(filtros.dataDe || filtros.dataAte) && (
                          <button
                            onClick={aplicarFiltroData}
                            disabled={buscando}
                            className="w-full flex items-center justify-center gap-2 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            {buscando ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                            Buscar anúncios desse período
                          </button>
                        )}
                      </div>

                      <div className="border-t border-stone-700/50 pt-3 space-y-2">
                        <p className="text-stone-500 text-xs uppercase tracking-widest">⚡ Filtros instantâneos</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-stone-400 text-xs flex items-center gap-1">
                              <Zap size={10} className="text-amber-400" /> Velocidade mín (vendas/dia)
                            </label>
                            <input
                              type="number" min="0" placeholder="ex: 5"
                              value={filtros.minVelocidade}
                              onChange={e => setFiltro('minVelocidade', e.target.value)}
                              className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-sky-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-stone-400 text-xs">📊 Vendas mínimas (total)</label>
                            <input
                              type="number" min="0" placeholder="ex: 100"
                              value={filtros.minVendas}
                              onChange={e => setFiltro('minVendas', e.target.value)}
                              className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-sky-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-stone-400 text-xs">💰 Preço mínimo (R$)</label>
                            <input
                              type="number" min="0" placeholder="ex: 50"
                              value={filtros.minPreco}
                              onChange={e => setFiltro('minPreco', e.target.value)}
                              className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-sky-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-stone-400 text-xs">💰 Preço máximo (R$)</label>
                            <input
                              type="number" min="0" placeholder="ex: 500"
                              value={filtros.maxPreco}
                              onChange={e => setFiltro('maxPreco', e.target.value)}
                              className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-sky-500"
                            />
                          </div>
                        </div>
                      </div>

                      {filtrosAtivos && (
                        <button
                          onClick={() => setFiltros({ minVendas: '', minPreco: '', maxPreco: '', minVelocidade: '', dataDe: '', dataAte: '' })}
                          className="text-xs text-stone-500 hover:text-stone-300 transition-colors"
                        >
                          ✕ Limpar todos os filtros
                        </button>
                      )}
                    </div>
                  )}


                  <div className={temResultado
                    ? 'space-y-2'
                    : 'grid grid-cols-1 sm:grid-cols-2 gap-3'
                  }>
                  {produtosFiltrados.map((p, i) => {
                    const sel = selecionados.has(p.id)
                    const vpd = vendasPorDia(p)
                    const vpdLabel = fmtVpd(vpd)
                    return (
                      <div
                        key={p.id}
                        onClick={() => toggleProduto(p.id)}
                        className={`relative flex gap-3 rounded-xl p-4 cursor-pointer transition-all border ${
                          sel
                            ? 'bg-stone-800 border-stone-600 shadow-sm'
                            : 'bg-stone-800/50 border-stone-700/50 opacity-45 hover:opacity-65'
                        }`}
                      >
                        {/* Checkbox + rank */}
                        <div className="flex flex-col items-center gap-2 shrink-0">
                          <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                            sel ? 'bg-sky-500 border-sky-500' : 'bg-stone-700 border-stone-600'
                          }`}>
                            {sel && <Check size={10} className="text-white" strokeWidth={3} />}
                          </div>
                          <span className={`text-xs font-bold tabular-nums ${
                            i === 0 ? 'text-amber-400' : i === 1 ? 'text-stone-400' : i === 2 ? 'text-amber-700' : 'text-stone-600'
                          }`}>#{i + 1}</span>
                        </div>

                        {/* Thumbnail */}
                        {p.thumbnail && (
                          <img src={p.thumbnail} alt={p.title}
                            className={`object-cover rounded-lg bg-stone-700 shrink-0 ${temResultado ? 'w-12 h-12' : 'w-16 h-16'}`} />
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className={`text-stone-200 font-medium leading-snug ${temResultado ? 'text-xs line-clamp-2' : 'text-sm line-clamp-2'}`}>
                            {p.title}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sky-400 font-semibold text-sm">{fmtBRL(p.price)}</span>
                            {p.sold_quantity > 0 && (
                              <span className="text-xs text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                {fmtNum(p.sold_quantity)} vendas
                              </span>
                            )}
                            {vpdLabel && (
                              <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                                <Zap size={9} className="shrink-0" />{vpdLabel}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Link externo */}
                        {p.permalink && (
                          <a href={p.permalink} target="_blank" rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="absolute top-3 right-3 text-stone-600 hover:text-sky-400 transition-colors">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    )
                  })}
                  </div>

                  <p className="text-stone-600 text-xs">
                    {selecionados.size} de {produtosFiltrados.length} selecionado{selecionados.size !== 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Meus Produtos ── */}
          {modoEntrada === 'meus-produtos' && (
            <div className="space-y-3">
              <input
                type="text"
                value={buscaMeus}
                onChange={e => setBuscaMeus(e.target.value)}
                placeholder="Buscar nos meus produtos..."
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2.5 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-sky-500"
              />

              {carregandoMeus && (
                <p className="text-stone-500 text-xs text-center py-4">Carregando produtos...</p>
              )}
              {!carregandoMeus && meusProdutos.length === 0 && (
                <p className="text-stone-500 text-xs text-center py-4">Nenhum produto ativo encontrado.</p>
              )}

              {meusProdutos.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-stone-500 text-xs">
                      {meusProdutos.length} produto{meusProdutos.length !== 1 ? 's' : ''} ativo{meusProdutos.length !== 1 ? 's' : ''}
                    </p>
                    <button
                      onClick={() => setMeusSel(
                        meusSel.size === meusProdutos.length
                          ? new Set()
                          : new Set(meusProdutos.map(p => p.item_id))
                      )}
                      className="text-xs text-sky-500 hover:text-sky-400 transition-colors"
                    >
                      {meusSel.size === meusProdutos.length ? 'Limpar todos' : 'Marcar todos'}
                    </button>
                  </div>

                  {meusProdutos.map(p => {
                    const sel = meusSel.has(p.item_id)
                    return (
                      <div
                        key={p.item_id}
                        onClick={() => toggleMeuProduto(p.item_id)}
                        className={`flex items-center gap-3 rounded-lg p-3 cursor-pointer transition-colors border ${
                          sel
                            ? 'bg-sky-500/[0.07] border-sky-500/25'
                            : 'bg-stone-800 border-stone-700 opacity-50 hover:opacity-70'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                          sel ? 'bg-sky-500 border-sky-500' : 'bg-stone-700 border-stone-600'
                        }`}>
                          {sel && <Check size={10} className="text-white" strokeWidth={3} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-stone-200 text-xs font-medium truncate">{p.titulo}</p>
                          <p className="text-stone-500 text-xs mt-0.5">
                            {p.item_id}
                            {p.preco_venda && ` · ${fmtBRL(p.preco_venda)}`}
                          </p>
                        </div>
                      </div>
                    )
                  })}

                  <p className="text-stone-600 text-xs">
                    {meusSel.size} selecionado{meusSel.size !== 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Step 2: O que gerar ── */}
        {(produtos.length > 0 || (modoEntrada === 'meus-produtos' && meusProdutos.length > 0)) && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-3">

            <div className="flex items-center justify-between">
              <p className="text-stone-400 text-xs uppercase tracking-widest">O que gerar?</p>
              <button
                onClick={marcarTodosTipos}
                className="text-xs text-sky-500 hover:text-sky-400 transition-colors"
              >
                {tiposSel.size === TIPOS.length ? 'Limpar todos' : 'Marcar todos'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TIPOS.map(t => {
                const sel = tiposSel.has(t.id)
                return (
                  <div
                    key={t.id}
                    onClick={() => toggleTipo(t.id)}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${
                      sel
                        ? 'bg-sky-500/[0.07] border-sky-500/25'
                        : 'bg-stone-800 border-stone-700 hover:border-stone-600'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border mt-0.5 transition-colors ${
                      sel ? 'bg-sky-500 border-sky-500' : 'bg-stone-700 border-stone-600'
                    }`}>
                      {sel && <Check size={10} className="text-white" strokeWidth={3} />}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${sel ? 'text-stone-100' : 'text-stone-400'}`}>
                        {t.label}
                      </p>
                      <p className="text-stone-600 text-xs mt-0.5">{t.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              onClick={gerarEstudio}
              disabled={gerando || !podeGerar}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: gerando ? 'var(--surface-3)' : 'linear-gradient(135deg, #0ea5e9, #6366f1)',
              }}
            >
              {gerando
                ? <><Loader2 size={15} className="animate-spin" /> Gerando com Gemini...</>
                : <><Sparkles size={15} /> Gerar</>
              }
            </button>

            {modoEntrada === 'pesquisa' && selecionados.size > 0 && (
              <button
                onClick={abrirFerramentasDaBusca}
                className="w-full py-2.5 rounded-xl text-sm font-medium border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors flex items-center justify-center gap-2"
              >
                <Wand2 size={14} />
                Ferramentas de IA ({selecionados.size} produto{selecionados.size !== 1 ? 's' : ''})
              </button>
            )}
          </div>
        )}

        {/* ── Banner rate limit ── */}
        {retryIn > 0 && (
          <div className="bg-amber-950/60 border border-amber-800/50 rounded-xl p-4 flex items-center gap-3">
            <Loader2 size={16} className="text-amber-400 animate-spin shrink-0" />
            <div>
              <p className="text-amber-300 text-sm font-medium">Limite de requisições atingido</p>
              <p className="text-amber-500 text-xs mt-0.5">
                Tentando novamente em <span className="font-bold text-amber-300">{retryIn}s</span> automaticamente...
              </p>
            </div>
          </div>
        )}

        </div>{/* ── fim coluna esquerda ── */}

        {/* ── Coluna direita: resultado ── */}
        {temResultado && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-3 lg:sticky lg:top-4">
            <p className="text-stone-400 text-xs uppercase tracking-widest">Resultado</p>

            {erroGerar && <p className="text-red-400 text-sm">{erroGerar}</p>}

            {/* Tabs dinâmicas */}
            <div className="flex gap-0 border-b border-stone-800 overflow-x-auto">
              {tabs.map(t => (
                <button key={t.id}
                  onClick={() => setTabAtiva(t.id)}
                  className={`text-xs px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 ${
                    tabAtiva === t.id
                      ? 'text-stone-100 border-sky-500 font-medium'
                      : 'text-stone-500 border-transparent hover:text-stone-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                {gerando && !secoes[tabAtiva] ? (
                  <span className="text-emerald-400 text-xs flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    Gerando...
                  </span>
                ) : <span />}
                <div className="flex items-center gap-2">
                  <button
                    onClick={baixarArquivo}
                    disabled={!resultado}
                    className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 disabled:opacity-40 bg-stone-800 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Download size={12} /> Baixar HTML
                  </button>
                  <button
                    onClick={() => copiar(tabAtiva, tabConteudo)}
                    disabled={!tabConteudo}
                    className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 disabled:opacity-40 bg-stone-800 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {copiado === tabAtiva
                      ? <><Check size={12} className="text-emerald-400" /> Copiado!</>
                      : <><Copy size={12} /> Copiar</>
                    }
                  </button>
                </div>
              </div>

              <div className="bg-stone-800 rounded-xl p-5 min-h-32 max-h-[75vh] overflow-y-auto">
                {tabConteudo ? (
                  <div className="prose prose-invert max-w-none
                    prose-headings:text-sky-400 prose-headings:font-semibold
                    prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                    prose-p:text-stone-300 prose-p:leading-relaxed
                    prose-li:text-stone-300
                    prose-strong:text-stone-100
                    prose-code:text-sky-300 prose-code:bg-stone-700 prose-code:px-1 prose-code:rounded
                    prose-hr:border-stone-700">
                    <ReactMarkdown>{tabConteudo}</ReactMarkdown>
                    {gerando && <span className="inline-block w-2 h-4 bg-sky-400 animate-pulse ml-0.5 align-middle" />}
                  </div>
                ) : (
                  <p className="text-stone-600 text-sm text-center py-8">
                    {gerando ? 'Aguardando conteúdo...' : 'Nenhum conteúdo gerado nesta tab.'}
                  </p>
                )}
              </div>
            </div>

            {!gerando && resultado && (
              <button
                onClick={gerarEstudio}
                className="flex items-center gap-2 text-xs text-stone-400 hover:text-stone-200 transition-colors"
              >
                <RefreshCw size={12} /> Regenerar
              </button>
            )}
          </div>
        )}

        </div>{/* ── fim grid ── */}

        {/* ══ Hub: histórico + cards informativos ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">

          {/* ── Histórico de Análises ── */}
          <div className="lg:col-span-2 bg-stone-900 border border-stone-800 rounded-2xl p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0">
                  <Clock size={16} className="text-sky-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-stone-100 text-base font-semibold leading-tight">Histórico de Análises</h2>
                  <p className="text-stone-500 text-xs mt-0.5">Clique em uma análise para reabri-la</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium bg-sky-500/15 text-sky-400 rounded-full px-2.5 py-1 shrink-0">
                Recentes · {historico.length}
              </span>
            </div>

            {historico.length > 0 && (
              <div className="relative mt-4">
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

            <div className="mt-4">
              {carregandoHist && historico.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Loader2 size={20} className="animate-spin text-stone-600" />
                  <p className="text-stone-500 text-xs">Carregando histórico...</p>
                </div>
              ) : historico.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-10 gap-2">
                  <FileSearch size={28} className="text-stone-600" />
                  <p className="text-stone-400 text-sm font-medium">Nenhuma análise ainda</p>
                  <p className="text-stone-500 text-xs">Busque um produto acima para começar.</p>
                </div>
              ) : historicoFiltrado.length === 0 ? (
                <p className="text-stone-500 text-xs text-center py-8">
                  Nada encontrado para "{buscaHist}".
                </p>
              ) : (
                <div className="space-y-1 max-h-[26rem] overflow-y-auto pr-1 -mx-2">
                  {historicoFiltrado.map(h => (
                    <div
                      key={h.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => abrirEstudo(h.id)}
                      onKeyDown={e => { if (e.key === 'Enter') abrirEstudo(h.id) }}
                      className="group w-full text-left flex items-center gap-3 rounded-xl px-3 py-3 border border-transparent hover:bg-stone-800/60 hover:border-stone-700/60 transition-colors cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-stone-200 text-sm font-medium truncate">
                            {h.termo || h.link || 'Estudo'}
                          </span>
                          <span className="text-stone-500 text-xs shrink-0">{fmtDataHist(h.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-2.5 mt-1 min-w-0">
                          <span className="text-emerald-400 text-xs flex items-center gap-1 shrink-0">
                            <CheckCircle2 size={11} />
                            Concluída
                            {Array.isArray(h.tipos) && h.tipos.length > 0 &&
                              ` · ${h.tipos.length} ${h.tipos.length === 1 ? 'seção' : 'seções'}`}
                          </span>
                          {h.persona && (
                            <span className="text-stone-500 text-xs truncate">{h.persona}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); abrirFerramentasDoHistorico(h) }}
                        title="Abrir as Ferramentas de IA com esta análise"
                        className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-violet-500/25 bg-violet-500/10 text-violet-300 hover:bg-violet-500/25 transition-colors"
                      >
                        Ferramentas →
                      </button>
                      <ChevronRight size={14} className="text-stone-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Coluna lateral: resumo + mercado ── */}
          <div className="space-y-5">

            {/* Resumo */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={15} className="text-sky-400" />
                <h3 className="text-stone-100 text-sm font-semibold">Resumo</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-stone-800/60 border border-stone-700/50 rounded-xl p-3.5">
                  <p className="text-stone-100 text-2xl font-bold tabular-nums">{historico.length}</p>
                  <p className="text-stone-500 text-xs mt-1">
                    {historico.length === 1 ? 'análise feita' : 'análises feitas'}
                  </p>
                </div>
                <div className="bg-stone-800/60 border border-stone-700/50 rounded-xl p-3.5">
                  <p className="text-stone-100 text-2xl font-bold tabular-nums">{analisesMes}</p>
                  <p className="text-stone-500 text-xs mt-1">neste mês</p>
                </div>
              </div>
              {ultimaAnalise && (
                <p className="text-stone-500 text-xs mt-3 flex items-center gap-1.5">
                  <Clock size={11} className="shrink-0" />
                  Última análise em {ultimaAnalise}
                </p>
              )}
            </div>

            {/* Tendências (dados reais do ML — vêm junto da busca) */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingUp size={15} className="text-sky-400 shrink-0" />
                  <h3 className="text-stone-100 text-sm font-semibold">Tendências do ML</h3>
                </div>
                {mercado?.categoria && (
                  <span className="text-[10px] text-stone-500 bg-stone-800 px-2 py-0.5 rounded-full truncate">
                    {mercado.categoria}
                  </span>
                )}
              </div>
              {mercado?.tendencias?.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {mercado.tendencias.slice(0, 12).map((t, i) => (
                    <button
                      key={i}
                      onClick={() => { setTermo(t); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                      title={`Usar "${t}" como termo de busca`}
                      className="text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/25 rounded-full px-2.5 py-1 transition-colors"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-stone-500 text-xs leading-relaxed">
                  Pesquise um produto acima para ver os termos mais buscados da categoria, direto do Mercado Livre.
                </p>
              )}
            </div>

            {/* Mais vendidos (dados reais do ML — vêm junto da busca) */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Trophy size={15} className="text-amber-400" />
                <h3 className="text-stone-100 text-sm font-semibold">Mais vendidos da categoria</h3>
              </div>
              {mercado?.mais_vendidos?.length > 0 ? (
                <ul className="space-y-2.5">
                  {mercado.mais_vendidos.slice(0, 5).map((m, i) => (
                    <li key={m.id || i} className="flex items-center gap-2.5 min-w-0">
                      <span className={`text-xs font-bold tabular-nums w-5 shrink-0 ${
                        i === 0 ? 'text-amber-400' : i === 1 ? 'text-stone-400' : i === 2 ? 'text-amber-700' : 'text-stone-600'
                      }`}>#{i + 1}</span>
                      {m.thumbnail && (
                        <img src={m.thumbnail} alt="" className="w-8 h-8 rounded-lg object-cover bg-stone-700 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-stone-300 text-xs truncate">{m.title}</p>
                        {m.price != null && (
                          <p className="text-stone-500 text-xs mt-0.5">{fmtBRL(m.price)}</p>
                        )}
                      </div>
                      {m.permalink && (
                        <a
                          href={m.permalink} target="_blank" rel="noreferrer"
                          className="text-stone-600 hover:text-sky-400 transition-colors shrink-0"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-stone-500 text-xs leading-relaxed">
                  Pesquise um produto acima para ver o ranking real de mais vendidos da categoria.
                </p>
              )}
            </div>

          </div>
        </div>

        {/* ══ Ferramentas de IA (full-width) ══ */}
        <div ref={painelFerramentasRef} className="mt-6 scroll-mt-4">
          {!painelFerramentas ? (
            <div className="bg-stone-900 border border-dashed border-stone-800 rounded-2xl p-5 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
                <Wand2 size={16} className="text-violet-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-stone-100 text-base font-semibold leading-tight">Ferramentas de IA</h2>
                <p className="text-stone-500 text-xs mt-0.5 leading-relaxed">
                  Persona, palavras-chave, títulos, descrição, fotos e kits — uma ferramenta por vez,
                  tudo direcionado ao público majoritário que mais compra. Use o botão{' '}
                  <span className="text-violet-300">Ferramentas →</span> em uma análise do histórico,
                  ou selecione produtos de uma busca acima.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 md:p-6 space-y-4">

              {/* ── Header do painel ── */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
                    <Wand2 size={16} className="text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-stone-100 text-base font-semibold leading-tight truncate">
                      Ferramentas de IA — {painelFerramentas.termo}
                    </h2>
                    <p className="text-stone-500 text-xs mt-0.5">
                      {painelFerramentas.criadoEm ? fmtDataHist(painelFerramentas.criadoEm) : ''}
                      {produtosPainel.length > 0 && ` · ${produtosPainel.length} produto${produtosPainel.length !== 1 ? 's' : ''} analisado${produtosPainel.length !== 1 ? 's' : ''}`}
                      {painelFerramentas.estudoId ? ' · salvo no histórico' : ' · nova análise (será salva ao gerar)'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={fecharFerramentas}
                  title="Fechar painel"
                  className="p-2.5 rounded-xl bg-stone-800 border border-stone-700 text-stone-400 hover:text-stone-200 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>

              {painelFerramentas.erro && (
                <p className="text-red-400 text-xs">Erro ao carregar a análise: {painelFerramentas.erro}</p>
              )}

              {painelFerramentas.carregando ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Loader2 size={22} className="animate-spin text-stone-600" />
                  <p className="text-stone-500 text-xs">Carregando análise...</p>
                </div>
              ) : (
                <>
                  {/* Bloco principal: Persona (método Cazonato) */}
                  {renderBlocoCard(BLOCOS_IA[0])}

                  {/* Demais ferramentas — habilitadas sempre; persona direciona */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    {BLOCOS_IA.slice(1).map(b => renderBlocoCard(b))}
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
