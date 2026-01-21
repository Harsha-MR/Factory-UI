import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { getDepartmentsByPlant, getFactories, getPlantsByFactory } from '../services/mockApi'

import { DepartmentZoneTickerCard, Select } from '../components/dashboard'

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const didAutoSelectFactoryRef = useRef(false)
  const didAutoSelectPlantRef = useRef(false)
  const didAutoShowDepartmentsRef = useRef(false)
  const departmentsRef = useRef(null)

  const prevFactoryIdRef = useRef(null)
  const prevPlantIdRef = useRef(null)

  const [factories, setFactories] = useState([])
  const [plants, setPlants] = useState([])
  const [departments, setDepartments] = useState([])
  const [departmentsFetchedAt, setDepartmentsFetchedAt] = useState('')

  const [factoryId, setFactoryId] = useState(() => searchParams.get('factoryId') || '')
  const [plantId, setPlantId] = useState(() => searchParams.get('plantId') || '')
  const [showDepartments, setShowDepartments] = useState(() => searchParams.get('show') === '1')

  const [loadingLists, setLoadingLists] = useState(false)
  const [error, setError] = useState('')

  const selectedPlantName = useMemo(() => {
    const p = plants.find((x) => x.id === plantId)
    return p?.name || ''
  }, [plants, plantId])

  // Auto-focus (scroll) to the Departments section when it becomes visible.
  useEffect(() => {
    if (!showDepartments) return
    const el = departmentsRef.current
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showDepartments])

  // If the user lands/navigates to a URL with query params, reflect them in state.
  // This ensures browser back/forward or manual URL navigation restores the expected view.
  useEffect(() => {
    const desiredFactoryId = searchParams.get('factoryId') || ''
    const desiredPlantId = searchParams.get('plantId') || ''
    const desiredShowDepartments = searchParams.get('show') === '1'

    if (desiredFactoryId && desiredFactoryId !== factoryId) setFactoryId(desiredFactoryId)
    if (desiredPlantId && desiredPlantId !== plantId) setPlantId(desiredPlantId)
    if (desiredShowDepartments !== showDepartments) {
      setShowDepartments(desiredShowDepartments)
      if (desiredShowDepartments) didAutoShowDepartmentsRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Keep URL in sync so back/refresh preserves state.
  useEffect(() => {
    const next = new URLSearchParams()
    if (factoryId) next.set('factoryId', factoryId)
    if (plantId) next.set('plantId', plantId)
    if (showDepartments) next.set('show', '1')

    const nextStr = next.toString()
    const curStr = searchParams.toString()
    if (nextStr !== curStr) setSearchParams(next, { replace: true })
  }, [factoryId, plantId, showDepartments, searchParams, setSearchParams])

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
          if (!didAutoSelectFactoryRef.current && !factoryId) {
            const preferred =
              data.find((f) => /factory\s*1/i.test(f?.name || '')) ||
              data.find((f) => String(f?.id || '').toLowerCase() === 'f1') ||
              data.find((f) => String(f?.id || '').endsWith('1')) ||
              data[0]

            if (preferred?.id) {
              didAutoSelectFactoryRef.current = true
              setFactoryId(preferred.id)
            }
          }
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load factories')
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

    const prevFactoryId = prevFactoryIdRef.current
    const isFirstRun = prevFactoryId === null
    const didChange = !isFirstRun && prevFactoryId !== factoryId

    // Only reset dependent state when the factory actually changes.
    // This keeps query-driven navigation (e.g. browser back) from wiping the plant selection.
    if (didChange) {
      setPlantId('')
      setPlants([])
      setDepartments([])
      setDepartmentsFetchedAt('')
      setShowDepartments(false)
    }

    prevFactoryIdRef.current = factoryId

    if (!factoryId) return

    ;(async () => {
      try {
        setError('')
        setLoadingLists(true)
        const data = await getPlantsByFactory(factoryId)
        if (!cancelled) {
          setPlants(data)

          // Default drill-down: Plant 1
          if (!didAutoSelectPlantRef.current && !plantId) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoryId])

  useEffect(() => {
    let cancelled = false

    const prevPlantId = prevPlantIdRef.current
    const isFirstRun = prevPlantId === null
    const didChange = !isFirstRun && prevPlantId !== plantId

    // Only reset dependent state when the plant actually changes.
    if (didChange) {
      setDepartments([])
      setDepartmentsFetchedAt('')
      setShowDepartments(false)
    }

    prevPlantIdRef.current = plantId

    if (!plantId) return

    ;(async () => {
      try {
        setError('')
        setLoadingLists(true)
        const data = await getDepartmentsByPlant(plantId)
        if (!cancelled) {
          setDepartments(data)
          setDepartmentsFetchedAt(new Date().toISOString())

          // Auto-open departments only for initial auto-selection.
          if (!didAutoShowDepartmentsRef.current && didAutoSelectPlantRef.current) {
            didAutoShowDepartmentsRef.current = true
            setShowDepartments(true)
          }
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load departments')
      } finally {
        if (!cancelled) setLoadingLists(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [plantId])

  function onGet() {
    if (!factoryId || !plantId) return
    setError('')
    setShowDepartments(true)
  }

  function openMachineFromTicker(dept, machine) {
    if (!dept?.id || !machine?.id) return

    navigate(`/departments/${dept.id}/machines/${machine.id}`, {
      state: {
        backgroundLocation: location,
        machine,
        context: { department: dept.name, plant: selectedPlantName },
        fetchedAt: departmentsFetchedAt,
      },
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
      </div>

      <div className="rounded border bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3 md:items-end">
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

          <div className="flex flex-col">
            <div className="mb-1 text-sm font-medium text-gray-700 opacity-0">Action</div>
            <button
              className="inline-flex w-fit rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={onGet}
              disabled={!plantId || loadingLists}
            >
              Get
            </button>
          </div>
        </div>

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      </div>

      {showDepartments ? (
        <div ref={departmentsRef} className="space-y-3 rounded border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-lg font-semibold">Departments</div>
              <div className="text-xs text-gray-500">Select a department to view the floor layout.</div>
            </div>
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
                  onClick={() =>
                    navigate(`/departments/${d.id}/layout-3d`, {
                      state: {
                        fromDashboard: { factoryId, plantId, show: showDepartments ? '1' : '0' },
                        plantName: selectedPlantName,
                        departmentsFetchedAt,
                      },
                    })
                  }
                  onMachineClick={(m) => openMachineFromTicker(d, m)}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
