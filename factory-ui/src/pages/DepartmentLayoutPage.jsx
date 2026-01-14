import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getDepartmentLayout } from '../services/mockApi'

import { DepartmentZonesCard, MachineCard } from '../components/dashboard'

function machineFilterBtnClass(isActive) {
  return (
    'rounded-full border px-3 py-1 text-xs font-semibold transition ' +
    (isActive
      ? 'border-black bg-black text-white'
      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50')
  )
}

export default function DepartmentLayoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { departmentId } = useParams()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deptResult, setDeptResult] = useState(null)
  const [machineStatusFilter, setMachineStatusFilter] = useState('ALL')

  const plantName = location.state?.plantName || ''

  const allMachines = useMemo(() => {
    const zones = deptResult?.department?.zones
    if (!Array.isArray(zones)) return []
    const list = []
    for (const z of zones) {
      for (const m of z?.machines || []) list.push(m)
    }
    return list
  }, [deptResult])

  const allMachinesCounts = useMemo(() => {
    const counts = { RUNNING: 0, IDLE: 0, DOWN: 0 }
    for (const m of allMachines) {
      if (m?.status === 'RUNNING') counts.RUNNING++
      else if (m?.status === 'IDLE') counts.IDLE++
      else if (m?.status === 'DOWN') counts.DOWN++
    }
    return counts
  }, [allMachines])

  const filteredMachines = useMemo(() => {
    if (machineStatusFilter === 'ALL') return allMachines
    return allMachines.filter((m) => m?.status === machineStatusFilter)
  }, [allMachines, machineStatusFilter])

  const machinesHeading =
    machineStatusFilter === 'RUNNING'
      ? 'Running Machines'
      : machineStatusFilter === 'IDLE'
        ? 'Idle Machines'
        : machineStatusFilter === 'DOWN'
          ? 'Down Machines'
          : 'All Machines'

  useEffect(() => {
    setMachineStatusFilter('ALL')
  }, [departmentId])

  useEffect(() => {
    if (!departmentId) return
    let cancelled = false

    ;(async () => {
      try {
        setError('')
        setLoading(true)
        const result = await getDepartmentLayout(departmentId)
        if (!cancelled) setDeptResult(result)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load department layout')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [departmentId])

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!departmentId) return
    let cancelled = false

    const intervalId = setInterval(async () => {
      try {
        const result = await getDepartmentLayout(departmentId)
        if (!cancelled) setDeptResult(result)
      } catch {
        // keep last known data
      }
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [departmentId])

  const onBack = () => {
    if (location.state?.fromDashboard) {
      navigate(-1)
      return
    }
    navigate('/dashboard?factoryId=f1&plantId=p1&show=1')
  }

  const onOpenMachine = (m) => {
    if (!m?.id) return
    navigate(`/departments/${departmentId}/machines/${m.id}`,
      {
        state: {
          backgroundLocation: location,
          machine: m,
          context: { department: deptResult?.department?.name || `Department ${departmentId}`, plant: plantName },
          fetchedAt: deptResult?.meta?.fetchedAt || location.state?.departmentsFetchedAt || '',
        },
      },
    )
  }

  if (loading && !deptResult) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Department</h1>
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onBack}
          >
            Back
          </button>
        </div>
        <div className="rounded border bg-white p-4 text-sm text-slate-600">Loading...</div>
      </div>
    )
  }

  if (error && !deptResult) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Department</h1>
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onBack}
          >
            Back
          </button>
        </div>
        <div className="rounded border bg-white p-4">
          <div className="text-sm text-red-600">{error}</div>
        </div>
      </div>
    )
  }

  if (!deptResult) return null

  return (
    <div className="space-y-3">
      <DepartmentZonesCard
        id={deptResult.department.id}
        name={deptResult.department.name}
        summary={deptResult.summary}
        machines={allMachines}
        onBack={onBack}
        onMachineClick={onOpenMachine}
        bodyMaxHeightClass="max-h-[62vh]"
      />

      <div className="rounded border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{machinesHeading}</div>
            <div className="text-xs text-gray-500">
              Total: {allMachines.length} | Running: {allMachinesCounts.RUNNING} | Idle: {allMachinesCounts.IDLE} | Down: {allMachinesCounts.DOWN}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={machineFilterBtnClass(machineStatusFilter === 'ALL')}
              onClick={() => setMachineStatusFilter('ALL')}
            >
              ALL
            </button>
            <button
              type="button"
              className={machineFilterBtnClass(machineStatusFilter === 'RUNNING')}
              onClick={() => setMachineStatusFilter('RUNNING')}
            >
              RUNNING
            </button>
            <button
              type="button"
              className={machineFilterBtnClass(machineStatusFilter === 'IDLE')}
              onClick={() => setMachineStatusFilter('IDLE')}
            >
              IDLE
            </button>
            <button
              type="button"
              className={machineFilterBtnClass(machineStatusFilter === 'DOWN')}
              onClick={() => setMachineStatusFilter('DOWN')}
            >
              DOWN
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filteredMachines.map((m) => (
            <MachineCard
              key={m.id}
              machine={m}
              context={{
                department: deptResult.department.name,
                plant: plantName,
              }}
              fetchedAt={deptResult.meta?.fetchedAt}
              variant="compact"
              onClick={() => onOpenMachine(m)}
            />
          ))}
        </div>

        {filteredMachines.length === 0 ? (
          <div className="mt-3 rounded border bg-gray-50 p-3 text-sm text-gray-600">
            No machines found for this filter.
          </div>
        ) : null}
      </div>

      <div className="text-xs text-gray-500">Auto-refresh is enabled (updates every 5 seconds).</div>
    </div>
  )
}
