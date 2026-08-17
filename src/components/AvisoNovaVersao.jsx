import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

// Quando um build novo sobe, a aba que já estava aberta continua rodando o
// JavaScript antigo — e o arquivo velho some do servidor. Sintoma real relatado:
// "atualizo e vem do jeito programado; troco de aba e some tudo". Não sumia
// nada: a outra aba nunca tinha recarregado.
//
// Aqui a página compara o bundle que ELA carregou com o que o servidor está
// anunciando agora, e avisa. Não recarrega sozinha de propósito: a usuária pode
// estar no meio de um lançamento, e perder o que ela digitou seria pior que a
// tela desatualizada.

function bundleAtual() {
  const s = document.querySelector('script[type="module"][src]') ||
            document.querySelector('script[src*="/assets/"]')
  return s ? s.getAttribute('src') : null
}

async function bundleDoServidor() {
  const html = await (await fetch('/index.html', { cache: 'no-store' })).text()
  const m = html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/)
  return m ? m[1] : null
}

export default function AvisoNovaVersao({ intervaloMs = 60000 }) {
  const [temNova, setTemNova] = useState(false)

  useEffect(() => {
    const meu = bundleAtual()
    if (!meu) return // dev server: sem hash, nada a comparar

    let vivo = true
    async function conferir() {
      if (!vivo || document.hidden) return
      try {
        const doServidor = await bundleDoServidor()
        if (vivo && doServidor && doServidor !== meu) setTemNova(true)
      } catch {
        // rede oscilou — tenta de novo no próximo ciclo, sem incomodar
      }
    }

    const timer = setInterval(conferir, intervaloMs)
    // Voltar pra aba é exatamente quando o desencontro aparece: confere na hora.
    document.addEventListener('visibilitychange', conferir)
    window.addEventListener('focus', conferir)
    conferir()

    return () => {
      vivo = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', conferir)
      window.removeEventListener('focus', conferir)
    }
  }, [intervaloMs])

  if (!temNova) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-white border border-stone-300 rounded-xl shadow-lg px-4 py-3 max-w-sm">
      <RefreshCw className="w-4 h-4 text-stone-500 shrink-0" />
      <p className="text-sm text-stone-700 flex-1">
        Existe uma versão nova do sistema. Esta aba ainda está com a anterior.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="text-sm rounded-lg px-3 py-1.5 shrink-0"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        Atualizar
      </button>
    </div>
  )
}
