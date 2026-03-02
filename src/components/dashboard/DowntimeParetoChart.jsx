import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

function formatMinutes(value) {
  const mins = Number(value || 0)
  if (!Number.isFinite(mins) || mins <= 0) return '0m'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h <= 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function ParetoTooltip({ active, payload, label }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null
  const minutes = Number(payload.find((p) => p?.dataKey === 'minutes')?.value || 0)
  const cumulativePct = Number(payload.find((p) => p?.dataKey === 'cumulativePct')?.value || 0)

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-3 shadow-lg">
      <div className="text-xs font-semibold text-slate-900">{label}</div>
      <div className="mt-1 text-xs text-slate-700">Downtime: {formatMinutes(minutes)}</div>
      <div className="text-xs text-slate-700">Cumulative: {cumulativePct.toFixed(1)}%</div>
    </div>
  )
}

export default function DowntimeParetoChart({ data }) {
  const normalized = Array.isArray(data) ? data : []

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-semibold text-slate-700">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h18" />
          <path d="M7 15h2v3H7zM11 11h2v7h-2zM15 7h2v11h-2z" />
        </svg>
        <span>Downtime Pareto (Reasons)</span>
      </div>
      <div className="p-3" style={{ height: 260 }}>
        {normalized.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No downtime reason data available from API.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={normalized} margin={{ top: 10, right: 20, left: 0, bottom: 36 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="reason"
                angle={-20}
                textAnchor="end"
                interval={0}
                height={56}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v) => `${Math.round(Number(v || 0))}`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(v) => `${Math.round(Number(v || 0))}%`}
              />
              <Tooltip content={<ParetoTooltip />} />
              <Bar yAxisId="left" dataKey="minutes" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulativePct"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 2.5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
