import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getDepartmentLayout } from '../services/mockApi'

import DepartmentFloor3DViewer from '../components/layout/DepartmentFloor3DViewer'
import { createDefaultLayoutForDepartment } from '../components/layout/defaultLayout'
import { normalizeLayout } from '../components/layout/layoutTypes'
import {
  deleteDepartmentCustomLayout,
  saveDepartmentCustomLayout,
} from '../services/layoutStorage'

function withThreeDDefaults(layout) {
  const normalized = normalizeLayout(layout)
  const threeD = normalized.threeD && typeof normalized.threeD === 'object' ? normalized.threeD : {}

  return {
    ...normalized,
    threeD: {
      floorModelUrl: threeD.floorModelUrl || '/models/floor-model.glb',
      floorModelScale: Number.isFinite(Number(threeD.floorModelScale)) ? Number(threeD.floorModelScale) : 1,
      floorModelAutoRotate: !!threeD.floorModelAutoRotate,
    },
  }
}

export default function Department3DLayoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { departmentId } = useParams()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deptResult, setDeptResult] = useState(null)
  const [draft, setDraft] = useState(null)
  const [showMachineMarkers, setShowMachineMarkers] = useState(true)

  const plantName = location.state?.plantName || ''

  useEffect(() => {
    if (!departmentId) return
    let cancelled = false

    ;(async () => {
      try {
        setError('')
        setLoading(true)
        const result = await getDepartmentLayout(departmentId)
        if (cancelled) return

        setDeptResult(result)

        const base = result?.customLayout || createDefaultLayoutForDepartment(result?.department)
        setDraft(withThreeDDefaults(base))
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load department')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [departmentId])

  const layoutCtx = useMemo(() => {
    return {
      factoryId: deptResult?.factory?.id || '',
      plantId: deptResult?.plant?.id || '',
      departmentId: departmentId || '',
    }
  }, [deptResult, departmentId])

  const onCancel = () => {
    navigate(`/departments/${departmentId}`, { state: location.state || {} })
  }

  const onSave = () => {
    if (!draft) return
    saveDepartmentCustomLayout(layoutCtx, draft)
    navigate(`/departments/${departmentId}`, { state: location.state || {} })
  }

  const onReset = () => {
    deleteDepartmentCustomLayout(layoutCtx)
    const base = createDefaultLayoutForDepartment(deptResult?.department)
    setDraft(withThreeDDefaults(base))
  }

  if (loading && !draft) {
    return (
      <div className="rounded border bg-white p-4 text-sm text-slate-600">Loading 3D editor…</div>
    )
  }

  if (error && !draft) {
    return (
      <div className="rounded border bg-white p-4">
        <div className="text-sm text-red-600">{error}</div>
        <button
          type="button"
          className="mt-3 rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          onClick={onCancel}
        >
          Back
        </button>
      </div>
    )
  }

  if (!draft) return null

  const floorScale = Number(draft?.threeD?.floorModelScale) || 1

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold text-slate-900">
              3D Layout — {deptResult?.department?.name || `Department ${departmentId}`}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Plant: {deptResult?.plant?.name || plantName || '—'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={onReset}
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={onSave}
            >
              Save
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-xl border bg-white p-3">
            <div className="text-sm font-semibold text-slate-900">3D settings</div>
            <div className="mt-1 text-xs text-slate-500">
              Use the scale slider if the GLB looks too small/large.
            </div>

            <div className="mt-3 space-y-3">
              <div className="rounded-lg border p-2">
                <div className="text-xs font-semibold text-slate-700">Floor model</div>
                <div className="mt-2 text-xs text-slate-600 break-all">{draft?.threeD?.floorModelUrl}</div>

                <label className="mt-3 block text-xs text-slate-600">
                  Scale: {floorScale.toFixed(2)}x
                  <input
                    className="mt-2 w-full"
                    type="range"
                    min="0.25"
                    max="10"
                    step="0.05"
                    value={String(floorScale)}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              threeD: {
                                ...(prev.threeD || {}),
                                floorModelScale: Number(e.target.value),
                              },
                            }
                          : prev,
                      )
                    }
                  />
                </label>

                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={!!draft?.threeD?.floorModelAutoRotate}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              threeD: {
                                ...(prev.threeD || {}),
                                floorModelAutoRotate: e.target.checked,
                              },
                            }
                          : prev,
                      )
                    }
                  />
                  Auto-rotate
                </label>
              </div>

              <div className="rounded-lg border p-2">
                <div className="text-xs font-semibold text-slate-700">Machines</div>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={showMachineMarkers}
                    onChange={(e) => setShowMachineMarkers(e.target.checked)}
                  />
                  Show draggable machine markers
                </label>
                <div className="mt-2 text-[11px] text-slate-500">
                  Tip: drag the cubes in the 3D view to move machines.
                </div>
              </div>
            </div>
          </div>

          <div>
            <DepartmentFloor3DViewer
              modelUrl={draft?.threeD?.floorModelUrl || '/models/floor-model.glb'}
              scale={floorScale}
              autoRotate={!!draft?.threeD?.floorModelAutoRotate}
              elements={draft?.elements || []}
              showMachineMarkers={showMachineMarkers}
              onMoveElement={(id, patch) => {
                setDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        elements: (prev.elements || []).map((e) =>
                          String(e.id) === String(id) ? { ...e, ...patch } : e,
                        ),
                      }
                    : prev,
                )
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
