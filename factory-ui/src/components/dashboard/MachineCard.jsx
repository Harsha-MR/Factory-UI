import { clampPct, formatTimestamp } from './utils'

function computeMachineKpis(machine) {
  const time = machine?.timeMetrics || {}
  const prod = machine?.productionMetrics || {}

  const planned = Number(time.plannedProductionTime ?? 0)
  const runtime = Number(time.runTime ?? 0)
  const idealCycleTime = Number(prod.idealCycleTime ?? 0)
  const totalParts = Number(prod.totalPartsProduced ?? 0)
  const goodParts = Number(prod.goodParts ?? 0)

  const availability = planned > 0 ? runtime / planned : 0
  const performance = runtime > 0 ? (idealCycleTime * totalParts) / runtime : 0
  const quality = totalParts > 0 ? goodParts / totalParts : 0
  const oee = availability * performance * quality

  const availabilityPct = clampPct(availability * 100)
  const performancePct = clampPct(performance * 100)
  const qualityPct = clampPct(quality * 100)
  const oeePct = clampPct(oee * 100)

  const breakdownTimeSec = Number(time.breakdownTime ?? NaN)
  const mttrMinutes = Number.isFinite(breakdownTimeSec)
    ? Math.max(0, Math.round(breakdownTimeSec / 60))
    : null

  return {
    availabilityPct,
    performancePct,
    qualityPct,
    oeePct,
    totalParts,
    goodParts,
    mttrMinutes,
  }
}

function statusPill(status) {
  if (status === 'DOWN') return 'bg-red-600 text-white'
  if (status === 'IDLE') return 'bg-yellow-500 text-white'
  return 'bg-emerald-600 text-white'
}

function OeeGauge({ value, size = 148, stroke = 12, color = '#f97316' }) {
  const v = clampPct(value)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (v / 100) * c

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id="oeeGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="60%" stopColor={color} />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>

      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#oeeGradient)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

export default function MachineCard({ machine, context, variant = 'full', fetchedAt }) {
  const name = machine?.name || machine?.id
  const status = machine?.status || 'UNKNOWN'
  const updatedAt = machine?.updatedAt
  const operatorName = machine?.shiftInfo?.operatorName || '—'
  const ownerName = machine?.shiftInfo?.supervisorName || '—'

  const {
    oeePct,
    availabilityPct,
    performancePct,
    qualityPct,
    goodParts,
    totalParts,
    mttrMinutes,
  } = computeMachineKpis(machine)

  const statusText = status === 'DOWN' ? 'DOWN' : status === 'IDLE' ? 'IDLE' : 'RUNNING'
  const apiUpdatedAt = fetchedAt || updatedAt
  const apiUpdatedAtText = formatTimestamp(apiUpdatedAt)
  const subText =
    status === 'DOWN'
      ? `Down • Updated ${apiUpdatedAtText}`
      : status === 'IDLE'
        ? `Idle • Updated ${apiUpdatedAtText}`
        : `Running • Updated ${apiUpdatedAtText}`

  const isCompact = variant === 'compact'

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${isCompact ? 'p-3' : 'p-5'}`}>
      <div className={`grid gap-4 ${isCompact ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
        <div className={`${!isCompact ? 'pr-0 xl:pr-4 xl:border-r' : ''}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <div className={`${isCompact ? 'text-lg' : 'text-2xl'} truncate font-semibold text-slate-900`}>
                  {name}
                </div>
                {machine?.id ? (
                  <div className="truncate text-sm text-slate-500">ID: {machine.id}</div>
                ) : null}
                {context?.department || context?.plant ? (
                  <div className="truncate text-sm text-slate-500">
                    {context?.department ? context.department : ''}
                    {context?.department && context?.plant ? '  ' : ''}
                    {context?.plant ? context.plant : ''}
                  </div>
                ) : null}
              </div>

              <div className={`mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${statusPill(status)}`}>
                <span className="inline-block h-2 w-2 rounded-full bg-white/80" />
                <span>{statusText}</span>
              </div>

              <div className="mt-2 text-sm text-slate-500">{subText}</div>
            </div>
          </div>

          {isCompact ? null : (
            <div className="mt-4 space-y-3 border-t pt-4">
              <div className="flex items-center gap-3 text-slate-700">
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <div className="text-base">Availability</div>
              </div>

              <div className="flex items-center gap-3 text-slate-700">
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <div className="text-base">Performance</div>
              </div>

              <div className="flex items-center gap-3 text-slate-700">
                <span className="h-3 w-3 rounded-full bg-emerald-500" />
                <div className="text-base">Quality</div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3">
                <div className="text-slate-700">
                  <span className="text-slate-500">Produced:</span>{' '}
                  <span className="font-semibold text-slate-900">{goodParts}</span>
                  <span className="text-slate-500"> / </span>
                  <span className="font-semibold text-slate-900">{totalParts}</span>
                </div>

                <div className="flex items-center gap-2 rounded-full border bg-white px-3 py-1">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-slate-500"
                  >
                    <path d="M12 6v6l4 2" />
                    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <div className="text-slate-600">
                    <span className="text-xs">MTTR</span>
                    <span className="ml-2 text-sm font-semibold text-slate-900">
                      {mttrMinutes == null ? '—' : `${mttrMinutes}m`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-slate-400"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <path d="M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" />
                  </svg>
                  <span className="font-semibold text-slate-900">{operatorName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-slate-400"
                  >
                    <path d="M12 12a4 4 0 1 0-4-4" />
                    <path d="M16 20v-2a4 4 0 0 0-4-4H8" />
                    <path d="M19 8v6" />
                    <path d="M22 11h-6" />
                  </svg>
                  <span className="text-slate-600">Owner</span>
                  <span className="font-semibold text-slate-900">{ownerName}</span>
                </div>
              </div>

              <div className="text-sm text-slate-500">Updated: {apiUpdatedAtText}</div>
            </div>
          )}
        </div>

        <div className={`${isCompact ? '' : 'xl:flex xl:items-center xl:justify-between xl:gap-4'}`}>
          <div className="flex-1">
            <div className="text-lg font-semibold text-slate-900">OEE</div>
            <div className="mt-3 flex items-center gap-4">
              <div className="relative">
                <OeeGauge value={oeePct} size={isCompact ? 110 : 160} stroke={isCompact ? 10 : 12} />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className={`${isCompact ? 'text-2xl' : 'text-4xl'} font-semibold text-orange-700`}>
                    {oeePct.toFixed(1)}
                    <span className={`${isCompact ? 'text-base' : 'text-xl'} font-medium`}>%</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-slate-400"
                    >
                      <path d="M12 6v6l4 2" />
                      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <span>OEE</span>
                  </div>
                </div>
              </div>

              {isCompact ? (
                <div className="flex-1 space-y-2">
                  <div className="text-sm text-slate-600">
                    A: <span className="font-semibold text-slate-900">{availabilityPct.toFixed(0)}%</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    P: <span className="font-semibold text-slate-900">{performancePct.toFixed(0)}%</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    Q: <span className="font-semibold text-slate-900">{qualityPct.toFixed(0)}%</span>
                  </div>
                </div>
              ) : (
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 text-slate-700">
                    <span className="h-3 w-3 rounded-full bg-yellow-400" />
                    <span>Availability</span>
                    <span className="ml-auto font-semibold text-slate-900">{availabilityPct.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <span className="h-3 w-3 rounded-full bg-yellow-400" />
                    <span>Performance</span>
                    <span className="ml-auto font-semibold text-slate-900">{performancePct.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <span className="h-3 w-3 rounded-full bg-emerald-500" />
                    <span>Quality</span>
                    <span className="ml-auto font-semibold text-slate-900">{qualityPct.toFixed(0)}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
