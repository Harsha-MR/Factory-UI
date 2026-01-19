import { useEffect, useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import { getHierarchyRoot, resetHierarchyToSeed, saveHierarchyRoot } from '../services/mockApi'

function newId(prefix) {
  return `${prefix}-${nanoid(6)}`
}

function coerceNum(n, fallback) {
  const v = Number(n)
  return Number.isFinite(v) ? v : fallback
}

function defaultMachine(name) {
  return {
    id: newId('m'),
    name: name || 'Machine',
    status: 'RUNNING',
    updatedAt: new Date().toISOString(),
    timeMetrics: {
      plannedProductionTime: 28800,
      runTime: 24000,
      idleTime: 2400,
      breakdownTime: 0,
      offTime: 2400,
    },
    productionMetrics: {
      idealCycleTime: 1.0,
      actualCycleTime: 1.2,
      totalPartsProduced: 1000,
      goodParts: 980,
      rejectedParts: 20,
    },
  }
}

export default function BuilderPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [root, setRoot] = useState(null)
  const [selectedFactoryId, setSelectedFactoryId] = useState('')
  const [selectedPlantId, setSelectedPlantId] = useState('')
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')
  const [selectedZoneId, setSelectedZoneId] = useState('')

  const factories = useMemo(() => root?.factories || [], [root])
  const selectedFactory = useMemo(
    () => factories.find((f) => String(f.id) === String(selectedFactoryId)) || null,
    [factories, selectedFactoryId],
  )
  const plants = useMemo(() => selectedFactory?.plants || [], [selectedFactory])
  const selectedPlant = useMemo(
    () => plants.find((p) => String(p.id) === String(selectedPlantId)) || null,
    [plants, selectedPlantId],
  )
  const departments = useMemo(() => selectedPlant?.departments || [], [selectedPlant])
  const selectedDepartment = useMemo(
    () => departments.find((d) => String(d.id) === String(selectedDepartmentId)) || null,
    [departments, selectedDepartmentId],
  )
  const zones = useMemo(() => selectedDepartment?.zones || [], [selectedDepartment])
  const selectedZone = useMemo(
    () => zones.find((z) => String(z.id) === String(selectedZoneId)) || null,
    [zones, selectedZoneId],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setError('')
        setLoading(true)
        const data = await getHierarchyRoot()
        if (cancelled) return
        setRoot(data)

        const firstFactory = data?.factories?.[0]
        if (firstFactory?.id) setSelectedFactoryId(firstFactory.id)
        const firstPlant = firstFactory?.plants?.[0]
        if (firstPlant?.id) setSelectedPlantId(firstPlant.id)
        const firstDept = firstPlant?.departments?.[0]
        if (firstDept?.id) setSelectedDepartmentId(firstDept.id)
        const firstZone = firstDept?.zones?.[0]
        if (firstZone?.id) setSelectedZoneId(firstZone.id)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load hierarchy')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const updateFactory = (factoryId, patch) => {
    setRoot((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        factories: (prev.factories || []).map((f) => (f.id === factoryId ? { ...f, ...patch } : f)),
      }
    })
  }

  const updatePlant = (plantId, patch) => {
    setRoot((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        factories: (prev.factories || []).map((f) => ({
          ...f,
          plants: (f.plants || []).map((p) => (p.id === plantId ? { ...p, ...patch } : p)),
        })),
      }
    })
  }

  const updateDepartment = (departmentId, patch) => {
    setRoot((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        factories: (prev.factories || []).map((f) => ({
          ...f,
          plants: (f.plants || []).map((p) => ({
            ...p,
            departments: (p.departments || []).map((d) => (d.id === departmentId ? { ...d, ...patch } : d)),
          })),
        })),
      }
    })
  }

  const updateZone = (departmentId, zoneId, patch) => {
    setRoot((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        factories: (prev.factories || []).map((f) => ({
          ...f,
          plants: (f.plants || []).map((p) => ({
            ...p,
            departments: (p.departments || []).map((d) => {
              if (d.id !== departmentId) return d
              return {
                ...d,
                zones: (d.zones || []).map((z) => (z.id === zoneId ? { ...z, ...patch } : z)),
              }
            }),
          })),
        })),
      }
    })
  }

  const addFactory = () => {
    const f = { id: newId('f'), name: `Factory ${factories.length + 1}`, plants: [] }
    setRoot((prev) => ({ ...(prev || { generatedAt: new Date().toISOString(), factories: [] }), factories: [...(prev?.factories || []), f] }))
    setSelectedFactoryId(f.id)
    setSelectedPlantId('')
    setSelectedDepartmentId('')
    setSelectedZoneId('')
  }

  const addPlant = () => {
    if (!selectedFactory) return
    const p = { id: newId('p'), name: `Plant ${plants.length + 1}`, departments: [] }
    updateFactory(selectedFactory.id, { plants: [...plants, p] })
    setSelectedPlantId(p.id)
    setSelectedDepartmentId('')
    setSelectedZoneId('')
  }

  const addDepartment = () => {
    if (!selectedPlant) return
    const d = { id: newId('d'), name: `Department ${departments.length + 1}`, zones: [] }
    updatePlant(selectedPlant.id, { departments: [...departments, d] })
    setSelectedDepartmentId(d.id)
    setSelectedZoneId('')
  }

  const addZone = () => {
    if (!selectedDepartment) return
    const z = { id: newId('z'), name: `Zone ${zones.length + 1}`, machines: [] }
    updateDepartment(selectedDepartment.id, { zones: [...zones, z] })
    setSelectedZoneId(z.id)
  }

  const addMachine = () => {
    if (!selectedDepartment || !selectedZone) return
    const m = defaultMachine(`Machine ${selectedZone.machines.length + 1}`)
    updateZone(selectedDepartment.id, selectedZone.id, { machines: [...(selectedZone.machines || []), m] })
  }

  const renameMachine = (machineId, name) => {
    if (!selectedDepartment || !selectedZone) return
    const next = (selectedZone.machines || []).map((m) => (m.id === machineId ? { ...m, name } : m))
    updateZone(selectedDepartment.id, selectedZone.id, { machines: next })
  }

  const updateMachineMetric = (machineId, group, key, value) => {
    if (!selectedDepartment || !selectedZone) return
    const next = (selectedZone.machines || []).map((m) => {
      if (m.id !== machineId) return m
      const obj = { ...(m[group] || {}) }
      obj[key] = coerceNum(value, obj[key] ?? 0)
      return { ...m, [group]: obj }
    })
    updateZone(selectedDepartment.id, selectedZone.id, { machines: next })
  }

  const onSave = async () => {
    try {
      setError('')
      setSaving(true)
      await saveHierarchyRoot({
        ...(root || { generatedAt: new Date().toISOString(), factories: [] }),
        generatedAt: new Date().toISOString(),
      })
    } catch (e) {
      setError(e?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const onResetToSeed = async () => {
    try {
      setError('')
      setSaving(true)
      await resetHierarchyToSeed()
      const data = await getHierarchyRoot()
      setRoot(data)
    } catch (e) {
      setError(e?.message || 'Failed to reset')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !root) {
    return <div className="rounded border bg-white p-4 text-sm text-slate-600">Loading builder…</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Factory Builder</h1>
          <div className="text-xs text-slate-500">Create plants/departments/zones/machines from scratch and save to the local database.</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={onResetToSeed}
            disabled={saving}
          >
            Reset to seed
          </button>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save to local DB'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded border bg-white p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        <div className="rounded-xl border bg-white p-3">
          <div className="text-sm font-semibold text-slate-900">Hierarchy</div>

          <div className="mt-3 space-y-3">
            <div className="rounded-lg border p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-700">Factories</div>
                <button type="button" className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white" onClick={addFactory}>
                  + Factory
                </button>
              </div>
              <select className="mt-2 w-full rounded-md border px-2 py-1 text-sm" value={selectedFactoryId} onChange={(e) => {
                setSelectedFactoryId(e.target.value)
                setSelectedPlantId('')
                setSelectedDepartmentId('')
                setSelectedZoneId('')
              }}>
                <option value="">Select factory…</option>
                {factories.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              {selectedFactory ? (
                <input className="mt-2 w-full rounded-md border px-2 py-1 text-sm" value={selectedFactory.name} onChange={(e) => updateFactory(selectedFactory.id, { name: e.target.value })} />
              ) : null}
            </div>

            <div className="rounded-lg border p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-700">Plants</div>
                <button type="button" className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" onClick={addPlant} disabled={!selectedFactory}>
                  + Plant
                </button>
              </div>
              <select className="mt-2 w-full rounded-md border px-2 py-1 text-sm" value={selectedPlantId} onChange={(e) => {
                setSelectedPlantId(e.target.value)
                setSelectedDepartmentId('')
                setSelectedZoneId('')
              }} disabled={!selectedFactory}>
                <option value="">Select plant…</option>
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {selectedPlant ? (
                <input className="mt-2 w-full rounded-md border px-2 py-1 text-sm" value={selectedPlant.name} onChange={(e) => updatePlant(selectedPlant.id, { name: e.target.value })} />
              ) : null}
            </div>

            <div className="rounded-lg border p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-700">Departments</div>
                <button type="button" className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" onClick={addDepartment} disabled={!selectedPlant}>
                  + Department
                </button>
              </div>
              <select className="mt-2 w-full rounded-md border px-2 py-1 text-sm" value={selectedDepartmentId} onChange={(e) => {
                setSelectedDepartmentId(e.target.value)
                setSelectedZoneId('')
              }} disabled={!selectedPlant}>
                <option value="">Select department…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {selectedDepartment ? (
                <input className="mt-2 w-full rounded-md border px-2 py-1 text-sm" value={selectedDepartment.name} onChange={(e) => updateDepartment(selectedDepartment.id, { name: e.target.value })} />
              ) : null}
            </div>

            <div className="rounded-lg border p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-700">Zones</div>
                <button type="button" className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" onClick={addZone} disabled={!selectedDepartment}>
                  + Zone
                </button>
              </div>
              <select className="mt-2 w-full rounded-md border px-2 py-1 text-sm" value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value)} disabled={!selectedDepartment}>
                <option value="">Select zone…</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
              {selectedZone ? (
                <input className="mt-2 w-full rounded-md border px-2 py-1 text-sm" value={selectedZone.name} onChange={(e) => updateZone(selectedDepartment.id, selectedZone.id, { name: e.target.value })} />
              ) : null}
              <button
                type="button"
                className="mt-2 w-full rounded-md border px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                onClick={addMachine}
                disabled={!selectedZone}
              >
                + Add machine to selected zone
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-3">
          <div className="text-sm font-semibold text-slate-900">Zone machines</div>
          <div className="mt-1 text-xs text-slate-500">Edit machine names and basic OEE inputs. (More fields can be added.)</div>

          {!selectedZone ? (
            <div className="mt-3 rounded border bg-slate-50 p-3 text-sm text-slate-600">Select a zone to edit machines.</div>
          ) : (
            <div className="mt-3 space-y-3">
              {(selectedZone.machines || []).map((m) => (
                <div key={m.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">{m.id}</div>
                    <div className="text-xs text-slate-500">Status: {m.status}</div>
                  </div>

                  <label className="mt-2 block text-xs text-slate-600">
                    Machine name
                    <input
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={m.name || ''}
                      onChange={(e) => renameMachine(m.id, e.target.value)}
                    />
                  </label>

                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="block text-xs text-slate-600">
                      Planned time
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        type="number"
                        value={m.timeMetrics?.plannedProductionTime ?? 0}
                        onChange={(e) => updateMachineMetric(m.id, 'timeMetrics', 'plannedProductionTime', e.target.value)}
                      />
                    </label>
                    <label className="block text-xs text-slate-600">
                      Run time
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        type="number"
                        value={m.timeMetrics?.runTime ?? 0}
                        onChange={(e) => updateMachineMetric(m.id, 'timeMetrics', 'runTime', e.target.value)}
                      />
                    </label>
                    <label className="block text-xs text-slate-600">
                      Ideal cycle time
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        type="number"
                        step="0.01"
                        value={m.productionMetrics?.idealCycleTime ?? 0}
                        onChange={(e) => updateMachineMetric(m.id, 'productionMetrics', 'idealCycleTime', e.target.value)}
                      />
                    </label>
                    <label className="block text-xs text-slate-600">
                      Total parts
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        type="number"
                        value={m.productionMetrics?.totalPartsProduced ?? 0}
                        onChange={(e) => updateMachineMetric(m.id, 'productionMetrics', 'totalPartsProduced', e.target.value)}
                      />
                    </label>
                    <label className="block text-xs text-slate-600">
                      Good parts
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        type="number"
                        value={m.productionMetrics?.goodParts ?? 0}
                        onChange={(e) => updateMachineMetric(m.id, 'productionMetrics', 'goodParts', e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ))}

              {(selectedZone.machines || []).length === 0 ? (
                <div className="rounded border bg-slate-50 p-3 text-sm text-slate-600">No machines yet — click “Add machine”.</div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
