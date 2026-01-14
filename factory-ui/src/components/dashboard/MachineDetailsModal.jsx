import { useEffect, useMemo } from 'react'
import { clampPct, formatRelativeTime, formatTimestamp } from './utils'

function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

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
  const oee = clamp01(availability) * clamp01(performance) * clamp01(quality)

  return {
    availabilityPct: clampPct(availability * 100),
    performancePct: clampPct(performance * 100),
    qualityPct: clampPct(quality * 100),
    oeePct: clampPct(oee * 100),
    totalParts,
    goodParts,
  }
}

function formatDuration(seconds) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s < 0) return '—'
  const totalMin = Math.floor(s / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60

  if (h <= 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function statusBadge(status) {
  if (status === 'DOWN') return { cls: 'bg-red-600 text-white', label: 'DOWN' }
  if (status === 'IDLE') return { cls: 'bg-yellow-500 text-white', label: 'IDLE' }
  if (status === 'RUNNING') return { cls: 'bg-emerald-600 text-white', label: 'RUNNING' }
  return { cls: 'bg-slate-600 text-white', label: status || 'UNKNOWN' }
}

function DonutGauge({ valuePct }) {
  const size = 96
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = clampPct(valuePct)
  const dash = (v / 100) * c

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id="mdm_oee" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="60%" stopColor="#fb923c" />
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
        stroke="url(#mdm_oee)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

export default function MachineDetailsModal({ machine, context, fetchedAt, onClose }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const name = machine?.name || machine?.id || 'Machine'
  const machineId = machine?.id || '—'
  const status = machine?.status || 'UNKNOWN'
  const { cls: statusCls, label: statusLabel } = statusBadge(status)

  const time = machine?.timeMetrics || {}
  const prod = machine?.productionMetrics || {}
  const shift = machine?.shiftInfo || {}

  const updatedAtIso = fetchedAt || machine?.updatedAt
  const updatedAtText = formatRelativeTime(updatedAtIso)
  const updatedAtFull = formatTimestamp(updatedAtIso)

  const kpis = useMemo(() => computeMachineKpis(machine), [machine])

  const plannedSec = Number(time.plannedProductionTime ?? NaN)
  const runSec = Number(time.runTime ?? 0)
  const idleSec = Number(time.idleTime ?? 0)
  const breakdownSec = Number(time.breakdownTime ?? 0)
  const offSec = Number(time.offTime ?? 0)

  const plannedSafe = Number.isFinite(plannedSec) && plannedSec > 0 ? plannedSec : null
  const denom = plannedSafe || Math.max(1, runSec + idleSec + breakdownSec + offSec)

  const seg = {
    run: clampPct((runSec / denom) * 100),
    idle: clampPct((idleSec / denom) * 100),
    breakdown: clampPct((breakdownSec / denom) * 100),
    off: clampPct((offSec / denom) * 100),
  }

  const totalParts = Number(prod.totalPartsProduced ?? 0)
  const goodParts = Number(prod.goodParts ?? 0)
  const rejectedParts = Number(prod.rejectedParts ?? Math.max(0, totalParts - goodParts))
  const rejectedPct = totalParts > 0 ? (rejectedParts / totalParts) * 100 : 0

  if (!machine) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative mx-auto flex h-[calc(100vh-2rem)] w-[calc(100%-1.5rem)] max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl lg:h-[90vh]"
      >
        <div className="flex items-start justify-between gap-4 border-b p-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">
              {name} <span className="text-slate-400">|</span>{' '}
              <span className="text-sm font-medium text-slate-500">ID: {machineId}</span>
              {context?.department ? (
                <>
                  <span className="text-slate-400">|</span>{' '}
                  <span className="text-sm font-medium text-slate-600">{context.department}</span>
                </>
              ) : null}
              {context?.plant ? (
                <>
                  <span className="text-slate-400">&nbsp;&nbsp;</span>
                  <span className="text-sm font-medium text-slate-600">{context.plant}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border bg-white p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Notifications"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
            <button
              type="button"
              className="rounded-md border bg-white p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Mute"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 9v6" />
                <path d="M21 9v6" />
                <path d="M4 9h4l5-4v14l-5-4H4z" />
              </svg>
            </button>
            <button
              type="button"
              className="rounded-md border bg-white p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Close"
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 lg:overflow-hidden lg:p-4">
          <div className="grid grid-cols-1 gap-3 lg:h-full lg:grid-cols-2 lg:gap-4">
            {/* LEFT COLUMN */}
            <div className="flex flex-col gap-3 lg:gap-4 lg:overflow-hidden">
              {/* Current Status */}
              <div className="rounded-xl border bg-white">
                <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-semibold text-slate-700">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
                    <path d="M19.4 15a7.96 7.96 0 0 0 .1-1 7.96 7.96 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1l-.4-2.6H9.1L8.7 7a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8 8 0 0 0-.1 1c0 .34.03.67.1 1l-2 1.5 2 3.5 2.4-1c.52.4 1.09.74 1.7 1l.4 2.6h5.8l.4-2.6c.61-.26 1.18-.6 1.7-1l2.4 1 2-3.5-2-1.5Z" />
                  </svg>
                  <span>Current Status</span>

                  <div className="ml-auto flex items-center gap-2">
                    <div className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-xs font-semibold ${statusCls}`}>
                      <span className="inline-block h-2 w-2 rounded-full bg-white/80" />
                      <span>{statusLabel}</span>
                    </div>
                    {status === 'DOWN' ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white"
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 9v4" />
                          <path d="M12 17h.01" />
                          <path d="M10.3 4.3 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
                        </svg>
                        HERE
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="p-3">
                  <div className="rounded-lg border bg-slate-50 px-3 py-3 text-sm text-slate-700">
                    <div>
                      <div className="text-xs text-slate-500">Status Since</div>
                      <div className="mt-0.5">{updatedAtText}</div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 text-slate-500">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <path d="M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">{shift?.shiftId ? 'Shift' : '—'}</div>
                            <div className="font-semibold text-slate-900">{shift?.shiftId || '—'}</div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 text-slate-500">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <path d="M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Operator</div>
                            <div className="font-semibold text-slate-900">{shift?.operatorName || '—'}</div>
                          </div>
                        </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Time Breakdown */}
              <div className="rounded-xl border bg-white">
                <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-semibold text-slate-700">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 8v4l3 3" />
                    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <span>Time Breakdown</span>
                </div>

                <div className="p-3">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="flex h-full w-full">
                      <div className="h-full bg-sky-500" style={{ width: `${seg.run}%` }} />
                      <div className="h-full bg-amber-400" style={{ width: `${seg.idle}%` }} />
                      <div className="h-full bg-indigo-600" style={{ width: `${seg.breakdown}%` }} />
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                      <span className="text-slate-600">Run Time:</span>
                      <span className="ml-auto font-semibold text-slate-900">{formatDuration(runSec)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      <span className="text-slate-600">Idle Time:</span>
                      <span className="ml-auto font-semibold text-red-600">{formatDuration(idleSec)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                      <span className="text-slate-600">Breakdown Time:</span>
                      <span className="ml-auto font-semibold text-slate-900">{formatDuration(breakdownSec)}</span>
                    </div>
                  </div>

                  {plannedSafe ? (
                    <div className="mt-2 text-xs text-slate-500">Planned: {formatDuration(plannedSafe)}</div>
                  ) : null}
                </div>
              </div>

            {/* Production (Summary) */}
            <div className="rounded-xl border bg-white">
              <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-semibold text-slate-700">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 6h11" />
                  <path d="M9 12h11" />
                  <path d="M9 18h11" />
                  <path d="M4 6h1" />
                  <path d="M4 12h1" />
                  <path d="M4 18h1" />
                </svg>
                <span>Production</span>
              </div>

              <div className="p-3 text-sm">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />
                    <span className="text-slate-600">Planned:</span>
                    <span className="ml-auto font-semibold text-slate-900">{prod?.plannedParts ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-slate-600">Produced:</span>
                    <span className="ml-auto font-semibold text-slate-900">{totalParts}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />
                    <span className="text-slate-600">Good:</span>
                    <span className="ml-auto font-semibold text-slate-900">{goodParts}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    <span className="text-slate-600">Rejected:</span>
                    <span className="ml-auto font-semibold text-red-600">
                      {rejectedParts} ({rejectedPct.toFixed(1)}%)
                    </span>
                  </div>
                </div>

                {/* <div className="mt-3 rounded-lg border bg-yellow-50 px-3 py-2 text-sm text-slate-700">
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f59e0b" strokeWidth="2">
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                      <path d="M10.3 4.3 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
                    </svg>
                    <span className="font-medium">
                      {machine?.alert?.title || (status === 'DOWN' ? 'Machine Down' : 'No active alerts')}
                    </span>
                    {machine?.alert?.severity || status === 'DOWN' ? (
                      <span className="text-slate-500">— {machine?.alert?.severity || 'High Severity'}</span>
                    ) : null}
                  </div>
                </div> */}

                <div className="mt-2 text-xs text-slate-500">Updated: {updatedAtFull}</div>
              </div>
            </div>

            </div>

            {/* RIGHT COLUMN */}
            <div className="flex flex-col gap-3 lg:gap-4 lg:overflow-hidden">
              {/* OEE */}
              <div className="rounded-xl border bg-white">
                <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold text-slate-700">
                  <span>OEE</span>
                </div>

                <div className="grid grid-cols-2 gap-4 p-4">
                  <div>
                    <div className="text-4xl font-semibold text-orange-700">{kpis.oeePct.toFixed(1)}%</div>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                        <span className="text-slate-600">Availability</span>
                        <span className="ml-auto font-semibold text-slate-900">{kpis.availabilityPct.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                        <span className="text-slate-600">Performance</span>
                        <span className="ml-auto font-semibold text-slate-900">{kpis.performancePct.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        <span className="text-slate-600">Quality</span>
                        <span className="ml-auto font-semibold text-slate-900">{kpis.qualityPct.toFixed(0)}%</span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 6v6l4 2" />
                        <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      <span>{formatDuration(time?.breakdownTime ?? null)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center">
                    <div className="relative">
                      <DonutGauge valuePct={kpis.oeePct} />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="text-lg font-semibold text-slate-900">{kpis.oeePct.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              <div className="rounded-xl border bg-white">
                <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span>Breakdown</span>
                  <span className="ml-2 font-medium text-slate-500">{machine?.breakdown?.code || machine?.breakdownCode || '—'}</span>
                </div>

                <div className="space-y-2 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Reason Code:</span>
                    <span className="text-slate-700">{machine?.breakdown?.reason || machine?.breakdownReason || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Duration:</span>
                    <span className="font-semibold text-red-600">{formatDuration(breakdownSec)}</span>
                  </div>
                </div>
              </div>

              {/* Upcoming Maintenance */}
              <div className="rounded-xl border bg-white">
                <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold text-slate-700">
                  <span>Upcoming Maintenance</span>
                </div>

                <div className="p-4 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Last Maintenance:</span>
                    <span>{machine?.maintenance?.lastAt ? formatTimestamp(machine.maintenance.lastAt) : '—'}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-slate-500">Next Maintenance:</span>
                    <span>{machine?.maintenance?.nextAt ? formatTimestamp(machine.maintenance.nextAt) : '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
