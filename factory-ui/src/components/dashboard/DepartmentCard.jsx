import { clampPct, formatTimestamp } from './utils'

export default function DepartmentCard({ name, id, summary, updatedAt, onClick, onBack }) {
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
          <span
            className={
              delta < 0
                ? 'ml-2 font-semibold text-red-600'
                : 'ml-2 font-semibold text-emerald-700'
            }
          >
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
