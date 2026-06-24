export default function KPICard({ label, value, variacao, prefix = '', suffix = '' }) {
  const varNum = typeof variacao === 'number' ? variacao : null
  const isPositive = varNum !== null && varNum >= 0
  const isNegative = varNum !== null && varNum < 0

  return (
    <div className="card-kpi p-5">
      <p className="text-xs font-medium uppercase tracking-widest mb-2.5" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
        {label}
      </p>
      <p className="text-2xl font-bold num" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        {prefix}{value}{suffix}
      </p>
      {varNum !== null && (
        <p className={`text-xs mt-2 flex items-center gap-1 font-medium ${
          isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-stone-500'
        }`}>
          <span className="text-[10px]">{isPositive ? '▲' : isNegative ? '▼' : '—'}</span>
          <span>{Math.abs(varNum).toFixed(1)}% vs período anterior</span>
        </p>
      )}
      {variacao === null && (
        <p className="text-xs mt-2 text-stone-600">sem dados anteriores</p>
      )}
    </div>
  )
}
