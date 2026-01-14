import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getDepartmentsByPlant,
  getDepartmentLayout,
  getFactories,
  getPlantsByFactory,
} from '../services/mockApi'

import {
  DepartmentZonesCard,
  DepartmentZoneTickerCard,
  MachineCard,
  MachineDetailsModal,
  Select,
} from '../components/dashboard'


export default function Dashboard() {
  const didAutoSelectFactoryRef = useRef(false)
  const didAutoSelectPlantRef = useRef(false)
  const didAutoShowDepartmentsRef = useRef(false)

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
  const [machineStatusFilter, setMachineStatusFilter] = useState('ALL') // ALL | RUNNING | IDLE | DOWN

  const [selectedMachine, setSelectedMachine] = useState(null)

  const activeDeptId = deptResult?.department?.id || ''

  const selectedPlantName = useMemo(() => {
    const p = plants.find((x) => x.id === plantId)
    return p?.name || ''
  }, [plants, plantId])

  useEffect(() => {
    setMachineStatusFilter('ALL')
  }, [activeDeptId])

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

  function machineFilterBtnClass(isActive) {
    return (
      'rounded-full border px-3 py-1 text-xs font-semibold transition ' +
      (isActive
        ? 'border-black bg-black text-white'
        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50')
    )
  }

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
        if (!cancelled) {
          setFactories(data)

          // Default drill-down: Factory 1
          if (!didAutoSelectFactoryRef.current) {
            const preferred =
              data.find((f) => /factory\s*1/i.test(f?.name || '')) ||
              data.find((f) => String(f?.id || '').toLowerCase() === 'f1') ||
              data.find((f) => String(f?.id || '').endsWith('1')) ||
              data[0]

            if (preferred?.id) {
              didAutoSelectFactoryRef.current = true
              setFactoryId((prev) => prev || preferred.id)
            }
          }
        }
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
    setMachineStatusFilter('ALL')
    setShowDepartments(false)

    if (!factoryId) return

    ;(async () => {
      try {
        setError('')
        setLoadingLists(true)
        const data = await getPlantsByFactory(factoryId)
        if (!cancelled) {
          setPlants(data)

          // Default drill-down: Plant 1 (only for the initial auto-selected factory)
          if (!didAutoSelectPlantRef.current) {
            const preferred =
              data.find((p) => /plant\s*1/i.test(p?.name || '')) ||
              data.find((p) => String(p?.id || '').toLowerCase() === 'p1') ||
              data.find((p) => String(p?.id || '').endsWith('1')) ||
              data[0]

            if (preferred?.id) {
              didAutoSelectPlantRef.current = true
              setPlantId(preferred.id)
            }
          }
        }
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
    setMachineStatusFilter('ALL')
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

          // Auto-open the departments view only for the initial auto-selection.
          if (!didAutoShowDepartmentsRef.current && didAutoSelectPlantRef.current) {
            didAutoShowDepartmentsRef.current = true
            setShowDepartments(true)
          }
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
    setMachineStatusFilter('ALL')
    setShowDepartments(true)
  }

  async function onSelectDepartment(dept) {
    try {
      setError('')
      setLoadingDept(true)
      const result = await getDepartmentLayout(dept.id)
      setDeptResult(result)
      setMachineStatusFilter('ALL')
    } catch (e) {
      setError(e?.message || 'Failed to load department layout')
      setDeptResult(null)
      setMachineStatusFilter('ALL')
    } finally {
      setLoadingDept(false)
    }
  }

  function closeMachineModal() {
    setSelectedMachine(null)
  }

  return (
    <div className="space-y-3">
      {selectedMachine ? (
        <MachineDetailsModal
          machine={selectedMachine.machine}
          context={selectedMachine.context}
          fetchedAt={selectedMachine.fetchedAt}
          onClose={closeMachineModal}
        />
      ) : null}

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
                <DepartmentZoneTickerCard
                  key={d.id}
                  name={d.name}
                  summary={d.summary}
                  id={d.id}
                  machines={d.machines}
                  zones={d.zones}
                  bodyMaxHeightClass="max-h-[320px]"
                  onClick={() => onSelectDepartment(d)}
                  onMachineClick={(m) =>
                    setSelectedMachine({
                      machine: m,
                      context: {
                        department: d.name,
                        plant: selectedPlantName,
                      },
                      fetchedAt: departmentsFetchedAt,
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {deptResult ? (
        <div className="space-y-3">
          <DepartmentZonesCard
            name={deptResult.department.name}
            summary={deptResult.summary}
            machines={allMachines}
            onBack={() => {
              setDeptResult(null)
              setMachineStatusFilter('ALL')
              setShowDepartments(true)
            }}
            onMachineClick={(m) =>
              setSelectedMachine({
                machine: m,
                context: {
                  department: deptResult.department.name,
                  plant: selectedPlantName,
                },
                fetchedAt: deptResult.meta?.fetchedAt,
              })
            }
          />

          {/* <div className="rounded border bg-white p-4">
            <div className="text-xs text-gray-500">
              simulated: {String(deptResult.meta.simulated)} | fetchedAt:{' '}
              {deptResult.meta.fetchedAt}
            </div>
          </div> */}

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
                    plant: selectedPlantName,
                  }}
                  fetchedAt={deptResult.meta?.fetchedAt}
                  variant="compact"
                  onClick={() =>
                    setSelectedMachine({
                      machine: m,
                      context: {
                        department: deptResult.department.name,
                        plant: selectedPlantName,
                      },
                      fetchedAt: deptResult.meta?.fetchedAt,
                    })
                  }
                />
              ))}
            </div>

            {filteredMachines.length === 0 ? (
              <div className="mt-3 rounded border bg-gray-50 p-3 text-sm text-gray-600">
                No machines found for this filter.
              </div>
            ) : null}
          </div>

          <div className="text-xs text-gray-500">
            Auto-refresh is enabled (updates every 5 seconds).
          </div>
        </div>
      ) : null}
    </div>
  )
}
