import { useState, useRef } from 'react'
import { api } from '../api'

export default function ImportarCustos() {
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    if (!f.name.endsWith('.xlsx')) {
      setError('Apenas arquivos .xlsx são aceitos')
      return
    }
    setFile(f)
    setError('')
    setResult(null)
  }

  async function handleUpload() {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await api.importarCustos(file)
      setResult(res)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col flex-1">
      <div className="h-14 bg-gray-900 border-b border-gray-800 flex items-center px-6">
        <h1 className="text-gray-100 font-semibold text-base">Importar Custos</h1>
      </div>
      <main className="flex-1 p-6 max-w-xl space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-sm font-medium text-gray-300 mb-1">Importar planilha de custos</h2>
            <p className="text-xs text-gray-500">
              O arquivo deve conter as colunas: <code className="text-amber-400">ml_item_id</code>,{' '}
              <code className="text-amber-400">titulo</code> e{' '}
              <code className="text-amber-400">custo</code>.
            </p>
          </div>

          <div
            className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-amber-500/50 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFile}
              className="hidden"
            />
            <p className="text-gray-400 text-sm">
              {file ? (
                <span className="text-amber-400 font-medium">📄 {file.name}</span>
              ) : (
                'Clique para selecionar arquivo .xlsx'
              )}
            </p>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-gray-950 font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Importando...' : 'Importar'}
          </button>
        </div>

        {result && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-2">
            <p className="text-emerald-400 font-medium text-sm">
              ✓ {result.importados} produto(s) importado(s) com sucesso
            </p>
            {result.erros?.length > 0 && (
              <div className="mt-2">
                <p className="text-amber-400 text-xs font-medium mb-1">Linhas com erro:</p>
                {result.erros.map((e, i) => (
                  <p key={i} className="text-gray-400 text-xs">Linha {e.linha}: {e.erro}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
