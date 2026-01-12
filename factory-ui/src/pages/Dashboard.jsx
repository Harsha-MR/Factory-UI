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
        <ZoneModal zone={activeZone} onClose={() => setSelectedZoneId('')} />
      ) : null}
    </div>
  )
}
