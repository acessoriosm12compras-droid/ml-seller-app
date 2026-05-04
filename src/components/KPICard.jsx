export default function KPICard({ label, value, variacao, prefix = '', suffix = '' }) {
  const varNum = typeof variacao === 'number' ? variacao : null
  const isPositive = varNum !== null && varNum >= 0
  const isNegative = varNum !== null && varNum < 0

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
      <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl font-bold text-stone-100">
        {prefix}{value}{suffix}
      </p>
      {varNum !== null && (
        <p className={`text-xs mt-1.5 flex items-center gap-1 ${
          isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-stone-500'
        }`}>
          <span>{isPositive ? '▲' : isNegative ? '▼' : '—'}</span>
          <span>{Math.abs(varNum).toFixed(1)}% vs período anterior</span>
        </p>
      )}
      {variacao === null && (
        <p className="text-xs mt-1.5 text-stone-600">sem dados anteriores</p>
      )}
    </div>
  )
}
