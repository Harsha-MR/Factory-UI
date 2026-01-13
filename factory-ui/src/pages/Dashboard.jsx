import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getDepartmentsByPlant,
  getDepartmentLayout,
  getFactories,
  getPlantsByFactory,
  startLiveSimulation,
} from '../services/mockApi'

function statusColor(status) {
  switch (status) {
    case 'RUNNING':
      return 'bg-green-500'
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
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
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

function ZoneModal({ zone, zones, selectedZoneId, onSelectZone, onClose }) {
  const activeZoneButtonRef = useRef(null)

function ZoneModal({ zone, onClose }) {
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

    // Ensure the selected zone card is visible in the horizontal scroller.
    // Using rAF avoids occasional layout timing issues on first open.
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
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
                <div className="text-[11px] text-gray-400">Scroll to view more</div>
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
      <div className="relative mx-auto mt-6 h-[80vh] w-[calc(100%-1.5rem)]  overflow-hidden rounded-lg bg-white shadow-xl sm:mt-10 sm:w-[80vw] sm:max-w-none">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <div className="text-lg font-semibold">{zone.name}</div>
            <div className="text-xs text-gray-500">Machines: {zone.machines.length}</div>
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

        <div className="h-[calc(83vh-73px)] overflow-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {zone.machines.map((m) => {
              const updatedAtText = m.updatedAt
                ? new Date(m.updatedAt).toLocaleString()
                : '—'

              return (
                <div
                  key={m.id}
                  className={`rounded-lg border p-3 ${statusSoftBg(m.status)}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">
                        {m.name || m.id}
                      </div>
                      <div className="text-xs text-gray-600">ID: {m.id}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`h-3 w-3 rounded-full ${statusColor(m.status)}`}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-medium text-gray-800">
                        {m.status}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-gray-600">
                    Updated: {updatedAtText}
                  </div>
                </div>
              )
            })}
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

  const [factoryId, setFactoryId] = useState('')
  const [plantId, setPlantId] = useState('')
  const [departmentId, setDepartmentId] = useState('')

  const [loadingLists, setLoadingLists] = useState(false)
  const [loadingDept, setLoadingDept] = useState(false)
  const [error, setError] = useState('')

  const [deptResult, setDeptResult] = useState(null)
  const [selectedZoneId, setSelectedZoneId] = useState('')

  const activeDeptId = deptResult?.department?.id || ''

  const activeZone = useMemo(() => {
    if (!deptResult || !selectedZoneId) return null
    return deptResult.layout.zones.find((z) => z.id === selectedZoneId) || null
  }, [deptResult, selectedZoneId])

  // Auto-refresh the selected department every 2 seconds (after Get)
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
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [activeDeptId])

  useEffect(() => {
    startLiveSimulation({ tickMs: 2000 })
  }, [])

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
    setDepartmentId('')
    setPlants([])
    setDepartments([])
    setDeptResult(null)
    setSelectedZoneId('')

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

    setDepartmentId('')
    setDepartments([])
    setDeptResult(null)
    setSelectedZoneId('')

    if (!plantId) return

    ;(async () => {
      try {
        setError('')
        setLoadingLists(true)
        const data = await getDepartmentsByPlant(plantId)
        if (!cancelled) setDepartments(data)
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

  const selectedDeptName = useMemo(() => {
    return departments.find((d) => d.id === departmentId)?.name || ''
  }, [departments, departmentId])

  async function onGet() {
    if (!departmentId) return
    try {
      setError('')
      setLoadingDept(true)
      const result = await getDepartmentLayout(departmentId)
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
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-gray-600">
          Select Factory → Plant → Department, then click{' '}
          <span className="font-medium">Get</span>.
        </p>
      </div>

      <div className="rounded border bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
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
          <Select
            label="Department"
            value={departmentId}
            onChange={setDepartmentId}
            options={departments}
            disabled={!plantId || loadingLists}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={onGet}
            disabled={!departmentId || loadingDept}
          >
            {loadingDept ? 'Getting...' : 'Get'}
          </button>



          {error ? <div className="text-sm text-red-600">{error}</div> : null}
        </div>
      </div>

      {deptResult ? (
        <div className="space-y-3 rounded border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-lg font-semibold">
                {deptResult.department.name}
              </div>
              <div className="text-xs text-gray-500">
                simulated: {String(deptResult.meta.simulated)} | fetchedAt:{' '}
                {deptResult.meta.fetchedAt}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-gray-700">
              {['RUNNING', 'WARNING', 'DOWN', 'OFFLINE', 'MAINTENANCE'].map(
                (s) => (
                  <div
                    key={s}
                    className="flex items-center gap-2 whitespace-nowrap"
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${statusColor(s)}`}
                    />
                    <span>{s}</span>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
            {deptResult.layout.zones.map((z) => (
              <div
                key={z.id}
                className="cursor-pointer rounded border p-3 transition hover:bg-gray-50 sm:p-4"
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

                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {z.machines.map((m) => (
                    <MachineDot key={m.id} machine={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-gray-500">
            Auto-refresh is enabled (updates every 2 seconds).
          </div>
        </div>
      ) : null}

      {selectedZoneId ? (
        <ZoneModal
          zone={activeZone}
          zones={deptResult?.layout?.zones || []}
          selectedZoneId={selectedZoneId}
          onSelectZone={setSelectedZoneId}
          onClose={() => setSelectedZoneId('')}
        />
        <ZoneModal zone={activeZone} onClose={() => setSelectedZoneId('')} />
      ) : null}
    </div>
  )
}
