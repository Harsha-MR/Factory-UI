import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getDepartmentsByPlant,
  getDepartmentLayout,
  getFactories,
  getPlantsByFactory,
} from '../services/mockApi'

function statusColor(status) {
  switch (status) {
    case 'RUNNING':
      return 'bg-green-500'
    case 'IDLE':
      return 'bg-yellow-400'
    case 'WARNING':
      return 'bg-yellow-500'
    case 'DOWN':
      return 'bg-red-500'
    case 'OFFLINE':
      return 'bg-gray-400'
    case 'MAINTENANCE':
      return 'bg-blue-500'
    default:
      return 'bg-slate-400'
  }
}

function statusSoftBg(status) {
  switch (status) {
    case 'RUNNING':
      return 'bg-green-500/10'
    case 'IDLE':
      return 'bg-yellow-400/10'
    case 'WARNING':
      return 'bg-yellow-500/10'
    case 'DOWN':
      return 'bg-red-500/10'
    case 'OFFLINE':
      return 'bg-gray-500/10'
    case 'MAINTENANCE':
      return 'bg-blue-500/10'
    default:
      return 'bg-slate-500/10'
  }
}

function Select({ label, value, onChange, options, disabled }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-gray-700">{label}</div>
      <select
        className="w-full rounded border bg-white px-3 py-2 text-sm disabled:bg-gray-100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option key="__placeholder" value="">Select...</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function clampPct(n) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function formatRelativeTime(isoString) {
  if (!isoString) return '—'
  const t = new Date(isoString).getTime()
  if (!Number.isFinite(t)) return '—'

  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (diffSec < 10) return 'just now'
  if (diffSec < 60) return `${diffSec} seconds ago`

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`

  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
}

function formatTimestamp(isoString) {
  if (!isoString) return '—'
  const d = new Date(isoString)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleString()
}

function DepartmentCard({ name, id, summary, updatedAt, onClick, onBack }) {
  const severity = summary?.severity || 'OK'
  const oee = clampPct(summary?.oeePct)
  const availability = clampPct(summary?.availabilityPct)
  const performance = clampPct(summary?.performancePct)
  const quality = clampPct(summary?.qualityPct)

  const machines = summary?.machines || {}
  const totalMachines = machines.total ?? 0
  const running = machines.running ?? 0
  const down = machines.down ?? 0
  const idle = machines.idle ?? 0
  const critical = machines.critical ?? 0

  const prod = summary?.production || {}
  const goodParts = prod.goodParts ?? 0
  const totalParts = prod.totalParts ?? 0
  const delta = prod.delta ?? goodParts - totalParts

  const badgeClass =
    severity === 'CRITICAL'
      ? 'bg-red-600 text-white'
      : severity === 'ACTION_REQUIRED'
        ? 'bg-yellow-500 text-white'
        : 'bg-emerald-600 text-white'

  const badgeText =
    severity === 'CRITICAL'
      ? 'CRITICAL'
      : severity === 'ACTION_REQUIRED'
        ? 'ACTION REQUIRED'
        : 'OK'

  const oeeBg =
    severity === 'CRITICAL'
      ? 'bg-red-50'
      : severity === 'ACTION_REQUIRED'
        ? 'bg-yellow-50'
        : 'bg-emerald-50'
  const oeeText =
    severity === 'CRITICAL'
      ? 'text-red-700'
      : severity === 'ACTION_REQUIRED'
        ? 'text-yellow-700'
        : 'text-emerald-700'

  const isClickable = typeof onClick === 'function'

  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
        isClickable ? 'cursor-pointer hover:shadow-md' : ''
      }`}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold text-slate-900">{name}</div>
          <div className="mt-1 text-sm text-slate-500">ID: {id}</div>
        </div>

        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              type="button"
              className="rounded-lg border px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
              onClick={(e) => {
                e.stopPropagation()
                onBack()
              }}
            >
              Back
            </button>
          ) : null}

          <div
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${badgeClass}`}
          >
            <span className="inline-block h-2 w-2 rounded-full bg-white/80" />
            <span>{badgeText}</span>
          </div>
        </div>
      </div>

      <div className={`mt-4 rounded-xl ${oeeBg} p-4`}>
        <div className="text-sm font-semibold text-slate-500">OEE</div>
        <div className={`mt-1 text-4xl font-semibold ${oeeText}`}>
          {oee.toFixed(1)}
          <span className="text-xl font-medium">%</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl border bg-white p-3">
        <div className="text-center">
          <div className="text-sm text-slate-600">Availability</div>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="text-2xl font-semibold text-slate-800">
              {availability.toFixed(0)}
              <span className="text-base font-medium text-slate-500">%</span>
            </span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm text-slate-600">Performance</div>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="text-2xl font-semibold text-slate-800">
              {performance.toFixed(0)}
              <span className="text-base font-medium text-slate-500">%</span>
            </span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm text-slate-600">Quality</div>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-2xl font-semibold text-slate-800">
              {quality.toFixed(0)}
              <span className="text-base font-medium text-slate-500">%</span>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 border-t pt-4">
        <div className="flex items-center justify-between gap-3 text-lg font-semibold text-slate-900">
          <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
            <path d="M19.4 15a7.96 7.96 0 0 0 .1-1 7.96 7.96 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1l-.4-2.6H9.1L8.7 7a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8 8 0 0 0-.1 1c0 .34.03.67.1 1l-2 1.5 2 3.5 2.4-1c.52.4 1.09.74 1.7 1l.4 2.6h5.8l.4-2.6c.61-.26 1.18-.6 1.7-1l2.4 1 2-3.5-2-1.5Z" />
          </svg>
          <span>Machines</span>
          </div>

          <div className="text-sm font-semibold text-slate-700">
            <span className="text-slate-500">Active:</span> {running}/{totalMachines}
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-5 text-slate-600">
          <div className="text-base">
            Total: <span className="font-semibold text-slate-900">{totalMachines}</span>
          </div>
          <div className="flex items-center gap-2 text-base">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>
              Running: <span className="font-semibold text-slate-900">{running}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-base">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span>
              Down: <span className="font-semibold text-slate-900">{down}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 text-base">
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span>
              Idle: <span className="font-semibold text-slate-900">{idle}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 border-t pt-4">
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 6h11" />
            <path d="M9 12h11" />
            <path d="M9 18h11" />
            <path d="M4 6h1" />
            <path d="M4 12h1" />
            <path d="M4 18h1" />
          </svg>
          <span>Production</span>
        </div>

        <div className="mt-1 text-lg text-slate-700">
          <span className="font-semibold text-slate-900">{goodParts}</span>
          <span className="text-slate-500"> / </span>
          <span className="font-semibold text-slate-900">{totalParts}</span>
          <span className={delta < 0 ? 'ml-2 font-semibold text-red-600' : 'ml-2 font-semibold text-emerald-700'}>
            ({delta})
          </span>
        </div>

        {critical > 0 ? (
          <div className="mt-3 rounded-xl border bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                  >
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                    <path d="M10.3 4.3 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
                  </svg>
                </div>
                <div>
                  <div className="text-base font-semibold text-slate-900">
                    Critical Machines
                  </div>
                  <div className="text-sm text-red-700">
                    {critical} machine{critical === 1 ? '' : 's'} require immediate attention
                  </div>
                </div>
              </div>

              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-slate-400"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 text-sm text-slate-500">
        Updated: {formatTimestamp(updatedAt || summary?.updatedAt)}
      </div>
    </div>
  )
}

function MachineDot({ machine }) {
  const buttonRef = useRef(null)
  const [align, setAlign] = useState('center') // 'left' | 'center' | 'right'

  const updatedAtText = machine.updatedAt
    ? new Date(machine.updatedAt).toLocaleString()
    : '—'

  function updateAlign() {
    const el = buttonRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth || 0
    const edgeThreshold = 220

    if (rect.left < edgeThreshold) setAlign('left')
    else if (vw - rect.right < edgeThreshold) setAlign('right')
    else setAlign('center')
  }

  const tooltipAlignClass =
    align === 'left'
      ? 'left-0 translate-x-0'
      : align === 'right'
        ? 'right-0 translate-x-0'
        : 'left-1/2 -translate-x-1/2'

  return (
    <div className="group relative">
      <button
        type="button"
        ref={buttonRef}
        className={`h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 rounded-full ${statusColor(machine.status)} ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-black/20`}
        aria-label={`Machine ${machine.name || machine.id} status ${machine.status}`}
        onMouseEnter={updateAlign}
        onFocus={updateAlign}
      />

      <div
        className={`pointer-events-none absolute top-full z-20 mt-2 w-max rounded-md bg-gray-900 px-2.5 py-2 text-[11px] leading-4 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${tooltipAlignClass}`}
        style={{ maxWidth: 'min(18rem, calc(100vw - 1.5rem))' }}
      >
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${statusColor(machine.status)}`} />
          <div className="font-semibold">{machine.name || machine.id}</div>
        </div>
        <div className="mt-1 text-white/90">Status: {machine.status}</div>
        <div className="text-white/70">Updated: {updatedAtText}</div>
      </div>
    </div>
  )
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

function MachineCard({ machine, context, variant = 'full', fetchedAt }) {
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
    <div className={`rounded-2xl border bg-white shadow-sm ${isCompact ? 'p-3' : 'p-5'}`}>
      <div className={`grid gap-4 ${isCompact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
        <div className={`${!isCompact ? 'pr-0 lg:pr-4 lg:border-r' : ''}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <div className={`${isCompact ? 'text-lg' : 'text-2xl'} font-semibold text-slate-900`}>
                  {name}
                </div>
                {machine?.id ? (
                  <div className="text-sm text-slate-500">ID: {machine.id}</div>
                ) : null}
                {context?.department || context?.plant ? (
                  <div className="text-sm text-slate-500">
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

              <div className="text-sm text-slate-500">
                Updated: {apiUpdatedAtText}
              </div>
            </div>
          )}
        </div>

        <div className={`${isCompact ? '' : 'flex items-center justify-between gap-4'}`}>
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
                    <span className="ml-auto font-semibold text-slate-900">
                      {availabilityPct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <span className="h-3 w-3 rounded-full bg-yellow-400" />
                    <span>Performance</span>
                    <span className="ml-auto font-semibold text-slate-900">
                      {performancePct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <span className="h-3 w-3 rounded-full bg-emerald-500" />
                    <span>Quality</span>
                    <span className="ml-auto font-semibold text-slate-900">
                      {qualityPct.toFixed(0)}%
                    </span>
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

function ZoneModal({ zone, zones, selectedZoneId, onSelectZone, onClose, fetchedAt }) {
  const activeZoneButtonRef = useRef(null)

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (!zone) return null

  const safeZones = Array.isArray(zones) ? zones : []

  useEffect(() => {
    const el = activeZoneButtonRef.current
    if (!el) return

    requestAnimationFrame(() => {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    })
  }, [selectedZoneId, safeZones.length])

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />

      <div className="relative mx-auto mt-6 flex h-[90vh] w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg bg-white shadow-xl sm:mt-10 sm:w-[90vw] sm:max-w-none">
        <div className="border-b p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">{zone.name}</div>
              <div className="text-xs text-gray-500">
                Machines: {zone.machines.length}
              </div>
            </div>

            <button
              type="button"
              className="rounded p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close"
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          {safeZones.length > 1 ? (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-gray-600">Zones</div>
                <div className="text-[11px] text-gray-400">
                  Scroll to view more
                </div>
              </div>

              <div className="mt-2 -mx-1 overflow-x-auto px-1">
                <div className="flex min-w-max gap-2">
                  {safeZones.map((z) => {
                    const isActive = z.id === selectedZoneId
                    return (
                      <button
                        key={z.id}
                        type="button"
                        ref={isActive ? activeZoneButtonRef : undefined}
                        onClick={() => onSelectZone?.(z.id)}
                        className={
                          `rounded-md border px-3 py-2 text-left text-sm transition ` +
                          (isActive
                            ? 'border-black bg-black text-white'
                            : 'border-gray-200 bg-white hover:bg-gray-50')
                        }
                        aria-current={isActive ? 'true' : undefined}
                        aria-label={`Select zone ${z.name}`}
                      >
                        <div className="max-w-[12rem] truncate font-medium">
                          {z.name}
                        </div>
                        <div
                          className={
                            `text-[11px] ` +
                            (isActive ? 'text-white/80' : 'text-gray-500')
                          }
                        >
                          Machines: {z.machines?.length ?? 0}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {zone.machines.map((m) => (
              <MachineCard
                key={m.id}
                machine={m}
                context={{ zone: zone.name }}
                fetchedAt={fetchedAt}
                variant="full"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [factories, setFactories] = useState([])
  const [plants, setPlants] = useState([])
  const [departments, setDepartments] = useState([])
  const [departmentsFetchedAt, setDepartmentsFetchedAt] = useState('')

  const [factoryId, setFactoryId] = useState('')
  const [plantId, setPlantId] = useState('')
  const [showDepartments, setShowDepartments] = useState(false)

  const [loadingLists, setLoadingLists] = useState(false)
  const [loadingDept, setLoadingDept] = useState(false)
  const [error, setError] = useState('')

  const [deptResult, setDeptResult] = useState(null)
  const [selectedZoneId, setSelectedZoneId] = useState('')

  const activeDeptId = deptResult?.department?.id || ''

  const selectedPlantName = useMemo(() => {
    const p = plants.find((x) => x.id === plantId)
    return p?.name || ''
  }, [plants, plantId])

  const activeZone = useMemo(() => {
    if (!deptResult || !selectedZoneId) return null
    return (
      deptResult.department.zones.find((z) => z.id === selectedZoneId) || null
    )
  }, [deptResult, selectedZoneId])

  // Auto-refresh the selected department every 5 seconds (after Get)
  useEffect(() => {
    if (!activeDeptId) return

    let cancelled = false

    const intervalId = setInterval(async () => {
      try {
        const result = await getDepartmentLayout(activeDeptId)
        if (!cancelled) setDeptResult(result)
      } catch {
        // Keep last known data if refresh fails
      }
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [activeDeptId])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setError('')
        setLoadingLists(true)
        const data = await getFactories()
        if (!cancelled) setFactories(data)
      } catch (e) {
        if (!cancelled)
          setError(e?.message || 'Failed to load factories')
      } finally {
        if (!cancelled) setLoadingLists(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    setPlantId('')
    setPlants([])
    setDepartments([])
    setDepartmentsFetchedAt('')
    setDeptResult(null)
    setSelectedZoneId('')
    setShowDepartments(false)

    if (!factoryId) return

    ;(async () => {
      try {
        setError('')
        setLoadingLists(true)
        const data = await getPlantsByFactory(factoryId)
        if (!cancelled) setPlants(data)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load plants')
      } finally {
        if (!cancelled) setLoadingLists(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [factoryId])

  useEffect(() => {
    let cancelled = false

    setDepartments([])
    setDepartmentsFetchedAt('')
    setDeptResult(null)
    setSelectedZoneId('')
    setShowDepartments(false)

    if (!plantId) return

    ;(async () => {
      try {
        setError('')
        setLoadingLists(true)
        const data = await getDepartmentsByPlant(plantId)
        if (!cancelled) {
          setDepartments(data)
          setDepartmentsFetchedAt(new Date().toISOString())
        }
      } catch (e) {
        if (!cancelled)
          setError(e?.message || 'Failed to load departments')
      } finally {
        if (!cancelled) setLoadingLists(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [plantId])

  async function onGet() {
    if (!factoryId || !plantId) return
    setError('')
    setDeptResult(null)
    setSelectedZoneId('')
    setShowDepartments(true)
  }

  async function onSelectDepartment(dept) {
    try {
      setError('')
      setLoadingDept(true)
      const result = await getDepartmentLayout(dept.id)
      setDeptResult(result)
      setSelectedZoneId('')
    } catch (e) {
      setError(e?.message || 'Failed to load department layout')
      setDeptResult(null)
      setSelectedZoneId('')
    } finally {
      setLoadingDept(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
      </div>

      <div className="rounded border bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
          <Select
            label="Factory"
            value={factoryId}
            onChange={setFactoryId}
            options={factories}
            disabled={loadingLists}
          />
          <Select
            label="Plant"
            value={plantId}
            onChange={setPlantId}
            options={plants}
            disabled={!factoryId || loadingLists}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={onGet}
            disabled={!plantId || loadingLists}
          >
            Get
          </button>



          {error ? <div className="text-sm text-red-600">{error}</div> : null}
        </div>
      </div>

      {showDepartments && !deptResult ? (
        <div className="space-y-3 rounded border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-lg font-semibold">Departments</div>
              <div className="text-xs text-gray-500">
                Select a department to view zones.
              </div>
            </div>

            {loadingDept ? (
              <div className="text-xs text-gray-600">Loading...</div>
            ) : null}
          </div>

          {departments.length === 0 ? (
            <div className="rounded border bg-gray-50 p-3 text-sm text-gray-600">
              No departments found for the selected plant.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {departments.map((d) => (
                <DepartmentCard
                  key={d.id}
                  id={d.id}
                  name={d.name}
                  summary={d.summary}
                  updatedAt={departmentsFetchedAt}
                  onClick={() => onSelectDepartment(d)}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {deptResult ? (
        <div className="space-y-3">
          <DepartmentCard
            id={deptResult.department.id}
            name={deptResult.department.name}
            summary={deptResult.summary}
            updatedAt={deptResult.meta?.fetchedAt}
            onBack={() => {
              setDeptResult(null)
              setSelectedZoneId('')
              setShowDepartments(true)
            }}
          />

          <div className="rounded border bg-white p-4">
            <div className="text-xs text-gray-500">
              simulated: {String(deptResult.meta.simulated)} | fetchedAt:{' '}
              {deptResult.meta.fetchedAt}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {deptResult.department.zones.map((z) => {
              const zoneCount = deptResult.department.zones.length
              const spanClass =
                zoneCount === 1 ? 'sm:col-span-2 lg:col-span-3' : ''

              return (
              <div
                key={z.id}
                className={`cursor-pointer rounded border p-3 transition hover:bg-gray-50 sm:p-4 ${spanClass}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedZoneId(z.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedZoneId(z.id)
                  }
                }}
              >
                <div className="mb-2 text-sm font-semibold sm:text-base">
                  {z.name}
                </div>

                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {z.machines.map((m) => (
                    <div
                      key={m.id}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      role="presentation"
                    >
                      <MachineCard
                        machine={m}
                        context={{
                          department: deptResult.department.name,
                          plant: selectedPlantName,
                        }}
                        fetchedAt={deptResult.meta?.fetchedAt}
                        variant="compact"
                      />
                    </div>
                  ))}
                </div>
              </div>
              )
            })}
          </div>

          <div className="text-xs text-gray-500">
            Auto-refresh is enabled (updates every 5 seconds).
          </div>
        </div>
      ) : null}

      {selectedZoneId ? (
        <ZoneModal
          zone={activeZone}
          zones={deptResult?.department?.zones || []}
          selectedZoneId={selectedZoneId}
          onSelectZone={setSelectedZoneId}
          fetchedAt={deptResult?.meta?.fetchedAt}
          onClose={() => setSelectedZoneId('')}
        />
      ) : null}
    </div>
  )
}
