export default function KpiCard({ label, value, color = 'text-stone-100' }) {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
      <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value ?? '—'}</p>
    </div>
  )
}
