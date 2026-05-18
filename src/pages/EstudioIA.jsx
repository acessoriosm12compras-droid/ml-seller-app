import { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Search, Sparkles, Copy, Check, RefreshCw, Loader2, ExternalLink, Download } from 'lucide-react'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

const TIPOS = [
  { id: 'estudo',  label: '📋 Estudo Completo' },
  { id: 'imagem',  label: '🖼️ Prompts Imagem' },
  { id: 'video',   label: '🎬 Prompts Vídeo' },
  { id: 'tudo',    label: '⚡ Tudo de uma vez' },
]

function fmtBRL(v) {
  if (!v) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function fmtNum(v) {
  if (!v && v !== 0) return '—'
  return Number(v).toLocaleString('pt-BR')
}

// Divide o texto gerado em seções por tab
function splitResultado(texto) {
  if (!texto) return { estudo: '', imagem: '', video: '' }

  const idxImagem = texto.indexOf('# 🖼️ PROMPTS DE IMAGEM')
  const idxVideo  = texto.indexOf('# 🎬 PROMPTS DE VÍDEO')

  if (idxImagem === -1 && idxVideo === -1) {
    return { estudo: texto, imagem: '', video: '' }
  }

  const cortes = []
  if (idxImagem !== -1) cortes.push({ idx: idxImagem, chave: 'imagem' })
  if (idxVideo  !== -1) cortes.push({ idx: idxVideo,  chave: 'video' })
  cortes.sort((a, b) => a.idx - b.idx)

  const partes = {}
  let ultimoIdx = 0
  let ultimaChave = 'estudo'

  cortes.forEach(({ idx, chave }) => {
    partes[ultimaChave] = texto.slice(ultimoIdx, idx).trim()
    ultimoIdx = idx
    ultimaChave = chave
  })
  partes[ultimaChave] = texto.slice(ultimoIdx).trim()

  return {
    estudo: partes.estudo || '',
    imagem: partes.imagem || '',
    video:  partes.video  || '',
  }
}

export default function EstudioIA() {
  const { getToken } = useAuth()

  // Step 1 — busca
  const [termo, setTermo]             = useState('')
  const [buscando, setBuscando]       = useState(false)
  const [produtos, setProdutos]       = useState([])
  const [erroBusca, setErroBusca]     = useState('')

  // Step 2 — o que gerar
  const [tipoSelecionado, setTipoSelecionado] = useState('tudo')

  // Step 3 — resultado
  const [gerando, setGerando]         = useState(false)
  const [resultado, setResultado]     = useState('')
  const [erroGerar, setErroGerar]     = useState('')
  const [tabAtiva, setTabAtiva]       = useState('estudo')
  const [copiado, setCopiado]         = useState('')

  const abortRef = useRef(null)

  // ── Busca produtos no ML ──────────────────────────────────────────────────
  async function buscarProdutos(e) {
    e?.preventDefault()
    const t = termo.trim()
    if (!t) return

    setBuscando(true)
    setErroBusca('')
    setProdutos([])
    setResultado('')

    try {
      const res = await fetch(`${BASE}/api/estudio/buscar?termo=${encodeURIComponent(t)}`, {
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

  // ── Gera estudo via SSE ───────────────────────────────────────────────────
  async function gerarEstudio() {
    if (!produtos.length) return

    setGerando(true)
    setErroGerar('')
    setResultado('')
    setTabAtiva('estudo')

    // cancela geração anterior se existir
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
          termo,
          produtos,
          tipos: [tipoSelecionado],
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.erro || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // guarda linha incompleta

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6)
          let parsed
          try {
            parsed = JSON.parse(json)
          } catch {
            continue // ignora linhas malformadas
          }
          if (parsed.done) { setGerando(false); return }
          if (parsed.erro) throw new Error(parsed.erro)
          if (parsed.chunk) {
            setResultado(prev => prev + parsed.chunk)
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setErroGerar(err.message)
      }
    } finally {
      setGerando(false)
    }
  }

  // ── Copia conteúdo da tab ─────────────────────────────────────────────────
  function copiar(chave, texto) {
    if (!texto) return
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(chave)
      setTimeout(() => setCopiado(''), 2000)
    })
  }

  // ── Converte Markdown básico para HTML ───────────────────────────────────
  function mdParaHtml(md) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const inline = (s) =>
      esc(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')

    const lines = md.split('\n')
    const out = []
    let inUl = false
    let inOl = false
    let inPre = false
    let paraBuffer = []

    const flushPara = () => {
      if (paraBuffer.length) {
        out.push(`<p>${paraBuffer.join('<br>')}</p>`)
        paraBuffer = []
      }
    }

    for (const raw of lines) {
      const line = raw.trimEnd()

      if (line.startsWith('```')) {
        flushPara()
        if (inUl) { out.push('</ul>'); inUl = false }
        if (inOl) { out.push('</ol>'); inOl = false }
        if (inPre) { out.push('</code></pre>'); inPre = false }
        else { out.push('<pre><code>'); inPre = true }
        continue
      }
      if (inPre) { out.push(esc(line)); continue }

      if (/^#{1,6} /.test(line)) {
        flushPara()
        if (inUl) { out.push('</ul>'); inUl = false }
        if (inOl) { out.push('</ol>'); inOl = false }
        const lvl = line.match(/^(#+)/)[1].length
        const tag = `h${Math.min(lvl, 6)}`
        out.push(`<${tag}>${inline(line.replace(/^#+\s/, ''))}</${tag}>`)
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
        out.push('<hr>')
        continue
      }

      if (line === '') {
        flushPara()
        if (inUl) { out.push('</ul>'); inUl = false }
        if (inOl) { out.push('</ol>'); inOl = false }
        continue
      }

      if (inUl || inOl) {
        // linha solta dentro de lista — fecha e abre parágrafo
        if (inUl) { out.push('</ul>'); inUl = false }
        if (inOl) { out.push('</ol>'); inOl = false }
      }
      paraBuffer.push(inline(line))
    }

    flushPara()
    if (inUl) out.push('</ul>')
    if (inOl) out.push('</ol>')
    if (inPre) out.push('</code></pre>')

    return out.join('\n')
  }

  // ── Download do resultado como .html ─────────────────────────────────────
  function baixarArquivo() {
    if (!resultado) return
    const date = new Date().toISOString().slice(0, 10)
    const nomeArquivo = `estudio-${termo.replace(/\s+/g, '-').toLowerCase()}-${date}.html`
    const corpo = mdParaHtml(resultado)
    const html = [
      '<!DOCTYPE html>',
      '<html lang="pt-BR">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      `<title>Estúdio IA — ${termo}</title>`,
      '<style>',
      '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0c0c0e;color:#d4d4d8;line-height:1.75;padding:40px 20px 80px}',
      '.wrapper{max-width:820px;margin:0 auto}',
      '.topo{margin-bottom:36px;padding-bottom:20px;border-bottom:1px solid #27272a}',
      '.topo h1{font-size:1.3rem;color:#38bdf8;font-weight:700;margin-bottom:4px}',
      '.topo p{font-size:0.78rem;color:#52525b}',
      'h1{font-size:1.45rem;color:#38bdf8;margin:40px 0 12px;font-weight:700}',
      'h2{font-size:1.1rem;color:#7dd3fc;margin:28px 0 10px;font-weight:600}',
      'h3{font-size:1rem;color:#93c5fd;margin:20px 0 8px;font-weight:600}',
      'h4,h5,h6{font-size:0.95rem;color:#bae6fd;margin:16px 0 6px;font-weight:600}',
      'p{margin:8px 0;color:#a1a1aa}',
      'ul,ol{margin:8px 0 8px 24px;color:#a1a1aa}',
      'li{margin:4px 0}',
      'strong{color:#e4e4e7;font-weight:600}',
      'em{color:#c4c4c8;font-style:italic}',
      'code{background:#1e1e2e;color:#7dd3fc;padding:2px 6px;border-radius:4px;font-size:0.85em;font-family:monospace}',
      'pre{background:#1e1e2e;border:1px solid #27272a;border-radius:8px;padding:16px;overflow-x:auto;margin:16px 0}',
      'pre code{background:none;padding:0;color:#a8ff78}',
      'hr{border:none;border-top:1px solid #27272a;margin:32px 0}',
      'a{color:#38bdf8;text-decoration:none}',
      '</style>',
      '</head>',
      '<body>',
      '<div class="wrapper">',
      '<div class="topo">',
      `<h1>Estúdio IA — ${termo}</h1>`,
      `<p>Gerado em ${date} · ML Seller Dashboard</p>`,
      '</div>',
      corpo,
      '</div>',
      '</body>',
      '</html>',
    ].join('\n')
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    a.click()
    URL.revokeObjectURL(url)
  }

  const secoes = splitResultado(resultado)

  const tabs = [
    { id: 'estudo', label: '📋 Estudo',  conteudo: secoes.estudo },
    { id: 'imagem', label: '🖼️ Imagem',  conteudo: secoes.imagem },
    { id: 'video',  label: '🎬 Vídeo',   conteudo: secoes.video  },
  ]

  const tabConteudo = tabs.find(t => t.id === tabAtiva)?.conteudo || ''

  return (
    <div className="flex flex-col min-h-screen bg-stone-950">
      <Header title="Estúdio IA" />

      <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full space-y-4">

        {/* ── Cabeçalho ── */}
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-sky-400" />
          <p className="text-stone-400 text-sm">
            Busque um produto no Mercado Livre e deixe o Claude gerar o estudo completo.
          </p>
        </div>

        {/* ── Step 1: Busca ── */}
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-3">
          <p className="text-stone-400 text-xs uppercase tracking-widest">1. Buscar no Mercado Livre</p>

          <form onSubmit={buscarProdutos} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type="text"
                value={termo}
                onChange={e => setTermo(e.target.value)}
                placeholder='Ex: "suporte para notebook", "cabo hdmi 2.1"...'
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

          {erroBusca && (
            <p className="text-red-400 text-xs">{erroBusca}</p>
          )}

          {/* Lista de produtos */}
          {produtos.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-stone-500 text-xs">
                Top {produtos.length} destaques do ML
                {produtos[0]?.category_name && <> · categoria <span className="text-stone-400">{produtos[0].category_name}</span></>}
              </p>
              {produtos.map((p, i) => (
                <div key={p.id}
                  className="flex items-center gap-3 bg-stone-800 border border-stone-700 rounded-lg p-3"
                >
                  <span className="text-stone-500 text-xs w-4 shrink-0">{i + 1}</span>
                  {p.thumbnail && (
                    <img src={p.thumbnail} alt={p.title}
                      className="w-10 h-10 object-cover rounded bg-stone-700 shrink-0" />
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
                      className="text-stone-500 hover:text-sky-400 shrink-0">
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Step 2: O que gerar ── */}
        {produtos.length > 0 && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-3">
            <p className="text-stone-400 text-xs uppercase tracking-widest">2. O que gerar?</p>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map(t => (
                <button key={t.id}
                  onClick={() => setTipoSelecionado(t.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    tipoSelecionado === t.id
                      ? 'bg-sky-600 text-white'
                      : 'bg-stone-800 border border-stone-700 text-stone-400 hover:border-stone-500'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              onClick={gerarEstudio}
              disabled={gerando}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: gerando
                  ? '#44403c'
                  : 'linear-gradient(135deg, #0ea5e9, #6366f1)',
              }}
            >
              {gerando
                ? <><Loader2 size={15} className="animate-spin" /> Gerando com Claude...</>
                : <><Sparkles size={15} /> Gerar Estudo</>
              }
            </button>
          </div>
        )}

        {/* ── Step 3: Resultado ── */}
        {(resultado || gerando || erroGerar) && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-3">
            <p className="text-stone-400 text-xs uppercase tracking-widest">3. Resultado</p>

            {erroGerar && (
              <p className="text-red-400 text-sm">{erroGerar}</p>
            )}

            {/* Tabs */}
            <div className="flex gap-0 border-b border-stone-800">
              {tabs.map(t => (
                <button key={t.id}
                  onClick={() => setTabAtiva(t.id)}
                  className={`text-xs px-4 py-2.5 transition-colors border-b-2 ${
                    tabAtiva === t.id
                      ? 'text-stone-100 border-sky-500 font-medium'
                      : 'text-stone-500 border-transparent hover:text-stone-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Conteúdo da tab */}
            <div className="relative">
              {/* Barra superior: status + copiar */}
              <div className="flex items-center justify-between mb-2">
                {gerando && tabAtiva === 'estudo' && !secoes.imagem && !secoes.video ? (
                  <span className="text-emerald-400 text-xs flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    Gerando com Claude Sonnet...
                  </span>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={baixarArquivo}
                    disabled={!resultado}
                    title="Baixar estudo completo como .md"
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
                      : <><Copy size={12} /> Copiar tudo</>
                    }
                  </button>
                </div>
              </div>

              {/* Texto em markdown */}
              <div className="bg-stone-800 rounded-xl p-4 min-h-32 max-h-[60vh] overflow-y-auto">
                {tabConteudo ? (
                  <div className="prose prose-invert prose-sm max-w-none
                    prose-headings:text-sky-400 prose-headings:font-semibold
                    prose-h2:text-base prose-h3:text-sm
                    prose-p:text-stone-300 prose-p:leading-relaxed
                    prose-li:text-stone-300
                    prose-strong:text-stone-100
                    prose-code:text-sky-300 prose-code:bg-stone-700 prose-code:px-1 prose-code:rounded
                    prose-table:text-xs prose-th:text-stone-400 prose-td:text-stone-300
                    prose-hr:border-stone-700
                  ">
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

            {/* Botão regenerar */}
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

      </div>
    </div>
  )
}
