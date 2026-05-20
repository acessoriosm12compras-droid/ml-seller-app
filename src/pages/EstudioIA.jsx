import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Search, Sparkles, Copy, Check, RefreshCw, Loader2,
  ExternalLink, Download, Package,
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

function fmtBRL(v) {
  if (!v) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function fmtNum(v) {
  if (!v && v !== 0) return '—'
  return Number(v).toLocaleString('pt-BR')
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
  const [erroBusca, setErroBusca] = useState('')
  const [selecionados, setSelecionados] = useState(new Set())

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

  const abortRef  = useRef(null)
  const retryTimer = useRef(null)

  // Seleciona todos ao carregar produtos
  useEffect(() => {
    if (produtos.length > 0) {
      setSelecionados(new Set(produtos.map(p => p.id)))
    }
  }, [produtos])

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

  // ── Busca produtos no ML ──────────────────────────────────────────
  async function buscarProdutos(e) {
    e?.preventDefault()
    const t = termo.trim()
    if (!t) return

    setBuscando(true)
    setErroBusca('')
    setProdutos([])
    setResultado('')

    const isLink = t.startsWith('http')
    const params = isLink ? `link=${encodeURIComponent(t)}` : `termo=${encodeURIComponent(t)}`

    try {
      const res = await fetch(`${BASE}/api/estudio/buscar?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.erro || `HTTP ${res.status}`)
      setProdutos(data.produtos || [])
    } catch (err) {
      setErroBusca(err.message)
    } finally {
      setBuscando(false)
    }
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
          if (parsed.done) { setGerando(false); return }
          if (parsed.rate_limit) {
            setGerando(false)
            let secs = parsed.retry_after || 62
            setRetryIn(secs)
            if (retryTimer.current) clearInterval(retryTimer.current)
            retryTimer.current = setInterval(() => {
              secs -= 1
              setRetryIn(secs)
              if (secs <= 0) {
                clearInterval(retryTimer.current)
                retryTimer.current = null
                setRetryIn(0)
                gerarEstudio()
              }
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
<p>Gerado em ${date} · ML Seller Dashboard</p>
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

  return (
    <div className="flex flex-col min-h-screen bg-stone-950">
      <Header title="Estúdio IA" />

      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">

        {/* ── Cabeçalho ── */}
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-sky-400" />
          <p className="text-stone-400 text-sm">
            Selecione produtos e deixe a IA gerar persona, pesquisa de mercado, prompts de imagem e vídeo.
          </p>
        </div>

        {/* ── Layout: 1 col sem resultado / 2 cols com resultado ── */}
        <div className={temResultado ? 'grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 items-start' : 'space-y-4'}>

        {/* ── Coluna esquerda: configuração ── */}
        <div className="space-y-4">

        {/* ── Step 1: Modo de entrada + produtos ── */}
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-4">

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
              <p className="text-stone-500 text-xs">Digite um termo de busca ou cole um link de anúncio do ML</p>
              <form onSubmit={buscarProdutos} className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                  <input
                    type="text"
                    value={termo}
                    onChange={e => setTermo(e.target.value)}
                    placeholder='Termo de busca ou https://www.mercadolivre.com.br/...'
                    className="w-full bg-stone-800 border border-stone-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={buscando || !termo.trim()}
                  className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors"
                >
                  {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Buscar
                </button>
              </form>

              {erroBusca && <p className="text-red-400 text-xs">{erroBusca}</p>}

              {/* Lista top 10 com checkboxes */}
              {produtos.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-stone-500 text-xs">
                      Top {produtos.length} mais vendidos
                      {produtos[0]?.category_name && (
                        <> · <span className="text-stone-400">{produtos[0].category_name}</span></>
                      )}
                    </p>
                    <button
                      onClick={() => setSelecionados(
                        selecionados.size === produtos.length
                          ? new Set()
                          : new Set(produtos.map(p => p.id))
                      )}
                      className="text-xs text-sky-500 hover:text-sky-400 transition-colors"
                    >
                      {selecionados.size === produtos.length ? 'Limpar todos' : 'Marcar todos'}
                    </button>
                  </div>

                  {produtos.map((p, i) => {
                    const sel = selecionados.has(p.id)
                    return (
                      <div
                        key={p.id}
                        onClick={() => toggleProduto(p.id)}
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
                        <span className="text-stone-600 text-xs w-5 shrink-0 text-right">#{i + 1}</span>
                        {p.thumbnail && (
                          <img src={p.thumbnail} alt={p.title}
                            className="w-9 h-9 object-cover rounded bg-stone-700 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-stone-200 text-xs font-medium truncate">{p.title}</p>
                          <p className="text-stone-500 text-xs mt-0.5">
                            {fmtBRL(p.price)}
                            {p.sold_quantity > 0 && ` · ${fmtNum(p.sold_quantity)} vendas`}
                          </p>
                        </div>
                        {p.permalink && (
                          <a href={p.permalink} target="_blank" rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-stone-500 hover:text-sky-400 shrink-0">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    )
                  })}

                  <p className="text-stone-600 text-xs">
                    {selecionados.size} de {produtos.length} selecionado{selecionados.size !== 1 ? 's' : ''}
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
                background: gerando ? '#44403c' : 'linear-gradient(135deg, #0ea5e9, #6366f1)',
              }}
            >
              {gerando
                ? <><Loader2 size={15} className="animate-spin" /> Gerando com Claude...</>
                : <><Sparkles size={15} /> Gerar</>
              }
            </button>
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

              <div className="bg-stone-800 rounded-xl p-4 min-h-32 max-h-[75vh] overflow-y-auto">
                {tabConteudo ? (
                  <div className="prose prose-invert prose-sm max-w-none
                    prose-headings:text-sky-400 prose-headings:font-semibold
                    prose-h2:text-base prose-h3:text-sm
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
      </div>
    </div>
  )
}
