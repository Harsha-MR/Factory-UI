import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Center, Edges, Html, OrbitControls, TransformControls, useGLTF } from '@react-three/drei'
import { Box3, Color, MOUSE, Plane, Vector2, Vector3 } from 'three'

import { ELEMENT_TYPES } from './layoutTypes'

const DEFAULT_PLANE_SIZE = 10

const DEFAULT_MODEL_URLS = {
  [ELEMENT_TYPES.MACHINE]: '/models/machine.glb',
  [ELEMENT_TYPES.WALKWAY]: '/models/walkway.glb',
  [ELEMENT_TYPES.TRANSPORTER]: '/models/transporter.glb',
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch() {
    // Intentionally empty: we show fallback UI instead of crashing the page.
  }

  render() {
    if (this.state.hasError) {
      return typeof this.props.fallback === 'function' ? this.props.fallback() : this.props.fallback || null
    }
    return this.props.children
  }
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function abbreviateMachineName(raw) {
  const name = String(raw || '').trim()
  if (!name) return 'MA'

  // Match: "Machine 1", "Machine-1", "MACHINE_01" -> MA-1
  const m = name.match(/\bmachine\b\s*[-_]?\s*(\d+)/i)
  if (m) return `MA-${Number.parseInt(m[1], 10)}`

  // Generic: take an uppercase prefix + trailing number
  const parts = name.split(/\s*[-_\s]+\s*/).filter(Boolean)
  const head = parts[0] || name
  const last = parts[parts.length - 1] || ''
  const numMatch = last.match(/(\d+)/)

  const isAllCapsShort = /^[A-Z0-9]{2,4}$/.test(head)
  const prefix = isAllCapsShort ? head : head.slice(0, 2).toUpperCase()

  if (numMatch) return `${prefix}-${Number.parseInt(numMatch[1], 10)}`
  return prefix
}

function statusColor(status) {
  const s = String(status || '').toUpperCase()
  if (s === 'DOWN') return '#ef4444'
  if (s === 'IDLE') return '#eab308'
  if (s === 'WARNING') return '#f59e0b'
  if (s === 'MAINTENANCE') return '#a855f7'
  if (s === 'OFFLINE') return '#94a3b8'
  return '#22c55e' // RUNNING (default)
}

function zoneFillColor(colorKey) {
  const k = String(colorKey || '').toLowerCase()
  if (k === 'dark-green' || k === 'darkgreen' || k === 'green') return '#14532d'
  if (k === 'orange') return '#f97316'
  if (k === 'yellow') return '#facc15'
  return '#14532d'
}

function computeMachineOeePct(machine) {
  const time = machine?.timeMetrics || {}
  const prod = machine?.productionMetrics || {}

  const planned = Number(time.plannedProductionTime ?? NaN)
  const runtime = Number(time.runTime ?? NaN)
  const idealCycleTime = Number(prod.idealCycleTime ?? NaN)
  const totalParts = Number(prod.totalPartsProduced ?? NaN)
  const goodParts = Number(prod.goodParts ?? NaN)

  if (!Number.isFinite(planned) || planned <= 0) return null
  if (!Number.isFinite(runtime) || runtime <= 0) return null
  if (!Number.isFinite(idealCycleTime) || idealCycleTime <= 0) return null
  if (!Number.isFinite(totalParts) || totalParts <= 0) return null
  if (!Number.isFinite(goodParts) || goodParts < 0) return null

  const availability = runtime / planned
  const performance = (idealCycleTime * totalParts) / runtime
  const quality = goodParts / totalParts
  const oee = clamp01(availability) * clamp01(performance) * clamp01(quality)
  return oee * 100
}

function machineModelUrlForStatus(status) {
  const s = String(status || '').toUpperCase()
  if (s === 'DOWN') return '/models/machine-down.glb'
  if (s === 'IDLE') return '/models/machine-idle.glb'
  // Default to RUNNING for unknown/other states.
  return '/models/machine-running.glb'
}

function setCursor(cursor) {
  if (typeof document === 'undefined') return
  document.body.style.cursor = cursor || 'default'
}

function normToPlane(xNorm, yNorm, planeSize) {
  const x = (clamp01(xNorm) - 0.5) * planeSize
  const z = (0.5 - clamp01(yNorm)) * planeSize
  return { x, z }
}

function planeToNorm(x, z, planeSize) {
  const xNorm = clamp01(x / planeSize + 0.5)
  const yNorm = clamp01(0.5 - z / planeSize)
  return { x: xNorm, y: yNorm }
}

function FloorModel({ url, scale, onComputedPlaneSize, onComputedFloorY }) {
  const { scene } = useGLTF(url)

  // Clone so multiple renders don’t mutate the shared cached scene.
  const cloned = useMemo(() => scene.clone(true), [scene])

  useEffect(() => {
    if (typeof onComputedPlaneSize !== 'function') return

    try {
      cloned.updateMatrixWorld(true)
      const box = new Box3().setFromObject(cloned)
      const size = new Vector3()
      box.getSize(size)

      const x = Number(size.x) * (Number(scale) || 1)
      const z = Number(size.z) * (Number(scale) || 1)
      const next = Math.max(x, z)

      if (Number.isFinite(next) && next > 0.001) {
        // Slightly pad so placing at the edge still feels reachable.
        onComputedPlaneSize(next * 1.02)
      }

      if (typeof onComputedFloorY === 'function') {
        const y = Number(size.y) * (Number(scale) || 1)
        // The model is wrapped in <Center>, so its bounds become centered at y=0.
        // For a floor mesh, the visible surface is typically the TOP of the bounds.
        const floorY = Number.isFinite(y) && y > 0 ? y / 2 : 0
        onComputedFloorY(floorY)
      }
    } catch {
      // ignore
    }
  }, [cloned, scale, onComputedPlaneSize, onComputedFloorY])

  return (
    <Center>
      <primitive object={cloned} scale={[scale, scale, scale]} />
    </Center>
  )
}

function PlacedGLB({ url, tintColor, tintStrength = 0.14 }) {
  const { scene } = useGLTF(url)

  const cloned = useMemo(() => {
    const root = scene.clone(true)
    if (!tintColor) return root

    const c = new Color(tintColor)
    const strength = clamp01(Number(tintStrength))

    root.traverse((obj) => {
      if (!obj) return
      // Only tint actual renderable meshes.
      if (!obj.isMesh && !obj.isSkinnedMesh) return

      const mat = obj.material
      if (!mat) return

      const tintMaterial = (m) => {
        if (!m || !m.isMaterial) return m

        const next = m.clone()

        // Keep the model readable: lightly mix base color and add a subtle emissive push.
        if (next.color) next.color.lerp(c, strength)
        if (Object.prototype.hasOwnProperty.call(next, 'emissive') && next.emissive) {
          next.emissive.copy(c)
          next.emissiveIntensity = Math.max(Number(next.emissiveIntensity) || 0, 0.35)
        }

        next.needsUpdate = true
        return next
      }

      obj.material = Array.isArray(mat) ? mat.map(tintMaterial) : tintMaterial(mat)
    })

    return root
  }, [scene, tintColor, tintStrength])

  return (
    <Center>
      <primitive object={cloned} />
    </Center>
  )
}

function CanvasPointerTracker({ enabled, floorY, onMove }) {
  const { gl, camera, raycaster } = useThree()

  const planeRef = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), [])
  const hitRef = useMemo(() => new Vector3(), [])
  const ndcRef = useMemo(() => new Vector2(), [])

  useEffect(() => {
    if (!enabled) return
    const el = gl?.domElement
    if (!el) return

    const onPointerMove = (ev) => {
      if (typeof onMove !== 'function') return

      const rect = el.getBoundingClientRect()
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      ndcRef.set(x, y)

      raycaster.setFromCamera(ndcRef, camera)

      const yPlane = (Number.isFinite(Number(floorY)) ? Number(floorY) : 0) + 0.001
      planeRef.normal.set(0, 1, 0)
      planeRef.constant = -yPlane

      const hit = raycaster.ray.intersectPlane(planeRef, hitRef)
      if (!hit) return
      onMove(hit.x, hit.z)
    }

    // Pointer capture is handled elsewhere; this listener ensures we still update
    // even when R3F doesn't emit events due to hit-testing gaps.
    el.addEventListener('pointermove', onPointerMove)
    return () => el.removeEventListener('pointermove', onPointerMove)
  }, [enabled, gl, camera, raycaster, floorY, onMove, planeRef, hitRef, ndcRef])

  return null
}

function FallbackMarker({ selected }) {
  return (
    <mesh position={[0, 0.08, 0]}>
      <boxGeometry args={[0.25, 0.16, 0.25]} />
      <meshStandardMaterial color={selected ? '#0ea5e9' : '#111827'} />
    </mesh>
  )
}

export default function DepartmentFloor3DViewer({
  modelUrl = '/models/floor-model.glb',
  scale = 1,
  autoRotate = false,
  elements = [],
  activeTool = 'select',
  selectedId = '',
  onSelectElement,
  onAddElement,
  onMoveElement,
  onUpdateElement,
  onOpenMachineDetails,
  showMachineMarkers = true,
  showMachineLabels = true,
  machineMetaById = null,
  machineStatusVisibility = null,
  planeSize = DEFAULT_PLANE_SIZE,
  fullScreen = false,
}) {
  const [draggingId, setDraggingId] = useState('')
  const [hoverNorm, setHoverNorm] = useState(null)
  const [hoveredMachineId, setHoveredMachineId] = useState('')
  const [isTransforming, setIsTransforming] = useState(false)
  const [isAddDrawing, setIsAddDrawing] = useState(false)
  const [addPreview, setAddPreview] = useState(null)
  const [floorPlaneSize, setFloorPlaneSize] = useState(0)
  const [floorPlaneY, setFloorPlaneY] = useState(0)
  const effectivePlaneSize = Number.isFinite(Number(floorPlaneSize)) && Number(floorPlaneSize) > 0
    ? Number(floorPlaneSize)
    : planeSize

  const effectiveFloorY = Number.isFinite(Number(floorPlaneY)) ? Number(floorPlaneY) : 0
  const overlayLift = Math.max(0.002, effectivePlaneSize * 0.001)

  const orbitRef = useRef(null)
  const cameraRef = useRef(null)

  const defaultMouseButtonsRef = useRef(null)
  const panDragPointerIdRef = useRef(null)
  const lastClickRef = useRef({ t: 0, x: 0, y: 0 })
  const DOUBLE_CLICK_MS = 320
  const DOUBLE_CLICK_PX = 6

  const setOrbitEnabledNow = (enabled) => {
    const controls = orbitRef.current
    if (!controls) return
    const next = fullScreen ? !!enabled : false
    if ('enabled' in controls) controls.enabled = next
    if (typeof controls.update === 'function') controls.update()
  }

  useEffect(() => {
    const controls = orbitRef.current
    if (!controls) return

    if (!defaultMouseButtonsRef.current) {
      // Snapshot so we can restore after temporary pan mode.
      defaultMouseButtonsRef.current = { ...controls.mouseButtons }
    }

    // three.js OrbitControls supports zoom-to-cursor in newer versions.
    // We set both flags for compatibility across versions.
    if ('zoomToCursor' in controls) controls.zoomToCursor = true
    if ('dollyToCursor' in controls) controls.dollyToCursor = true

    if ('enableDamping' in controls) controls.enableDamping = true
    if ('dampingFactor' in controls) controls.dampingFactor = 0.12
    if (typeof controls.update === 'function') controls.update()
  }, [])

  const setOrbitMouseModeNow = (mode) => {
    const controls = orbitRef.current
    if (!controls) return
    if (!controls.mouseButtons) return
    controls.mouseButtons.LEFT = mode === 'pan' ? MOUSE.PAN : MOUSE.ROTATE
    if (typeof controls.update === 'function') controls.update()
  }

  const maybeStartPanDrag = (e) => {
    // Only allow double-click+drag panning when camera controls are active.
    const controls = orbitRef.current
    if (!controls || !controls.enabled) return false
    if (!fullScreen) return false
    if (isOverlayAddToolActive || isTransforming || isAddDrawing || draggingId) return false

    const ne = e?.nativeEvent
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    const x = Number(ne?.clientX) || 0
    const y = Number(ne?.clientY) || 0

    const prev = lastClickRef.current
    const dt = now - (Number(prev?.t) || 0)
    const dx = x - (Number(prev?.x) || 0)
    const dy = y - (Number(prev?.y) || 0)
    const dist = Math.hypot(dx, dy)

    // Record click for next time.
    lastClickRef.current = { t: now, x, y }

    const isDouble = dt > 0 && dt <= DOUBLE_CLICK_MS && dist <= DOUBLE_CLICK_PX
    if (!isDouble) return false

    panDragPointerIdRef.current = e?.pointerId ?? null
    setOrbitMouseModeNow('pan')
    setCursor('grabbing')
    capturePointer(e)
    return true
  }

  const stopPanDrag = (pointerId) => {
    if (panDragPointerIdRef.current == null) return
    if (pointerId != null && panDragPointerIdRef.current !== pointerId) return
    panDragPointerIdRef.current = null
    setOrbitMouseModeNow('rotate')
    setCursor('default')
  }

  const draggingObjectRef = useRef(null)
  const draggingNormRef = useRef(null)
  const addDragRef = useRef(null)
  const addPreviewRafRef = useRef(0)
  const hoverRafRef = useRef(0)

  useEffect(() => {
    return () => {
      if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current)
    }
  }, [])

  const clearAddDrag = () => {
    addDragRef.current = null
    setIsAddDrawing(false)
    setAddPreview(null)
    if (addPreviewRafRef.current) {
      cancelAnimationFrame(addPreviewRafRef.current)
      addPreviewRafRef.current = 0
    }
  }

  const floorPlaneRef = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), [])
  const floorHitRef = useMemo(() => new Vector3(), [])

  const previewCameraPosition = useMemo(() => {
    const size = Math.max(4, effectivePlaneSize)
    const z = size * 0.9
    const y = size * 0.45
    return [0, y, z]
  }, [effectivePlaneSize])

  const editingCameraPosition = useMemo(() => {
    const size = Math.max(4, effectivePlaneSize)
    const xy = size * 0.35
    const y = size * 0.25
    return [xy, y, xy]
  }, [effectivePlaneSize])

  const cameraPosition = fullScreen ? editingCameraPosition : previewCameraPosition

  const isAddMode = typeof activeTool === 'string' && activeTool.startsWith('add:')
  const addType = isAddMode ? activeTool.slice('add:'.length) : ''
  const addElementType =
    addType === 'floor'
      ? null
      : addType === 'zone'
        ? ELEMENT_TYPES.ZONE
      : addType === 'machine'
        ? ELEMENT_TYPES.MACHINE
        : addType === 'walkway'
          ? ELEMENT_TYPES.WALKWAY
          : addType === 'transporter'
            ? ELEMENT_TYPES.TRANSPORTER
            : null

  const normalizedElements = Array.isArray(elements) ? elements.filter(Boolean) : []
  const zoneElements = normalizedElements.filter((e) => e?.type === ELEMENT_TYPES.ZONE)
  // Walkway is rendered as a 2D overlay on the floor.
  const walkwayElements = normalizedElements.filter((e) => e?.type === ELEMENT_TYPES.WALKWAY)
  // 3D placeables (GLBs)
  const placeableElements = normalizedElements.filter((e) =>
    [ELEMENT_TYPES.MACHINE, ELEMENT_TYPES.TRANSPORTER].includes(e?.type),
  )

  const visiblePlaceableElements = placeableElements.filter((el) => {
    if (el?.type !== ELEMENT_TYPES.MACHINE) return true
    const mid = String(el?.machineId || '')
    const status = machineMetaById && mid && machineMetaById[mid]?.status ? machineMetaById[mid].status : 'RUNNING'
    const v = machineStatusVisibility && typeof machineStatusVisibility === 'object'
      ? machineStatusVisibility[String(status).toUpperCase()]
      : undefined
    return v !== false
  })

  const selectedElement = selectedId
    ? normalizedElements.find((e) => String(e?.id) === String(selectedId))
    : null

  const addOverlayType =
    addElementType === ELEMENT_TYPES.ZONE || addElementType === ELEMENT_TYPES.WALKWAY ? addElementType : null

  const isOverlayAddToolActive = fullScreen && isAddMode && !!addOverlayType

  const selectedObjectRef = useRef(null)
  const controlsEnabled = fullScreen && !isOverlayAddToolActive && !draggingId && !isTransforming && !isAddDrawing

  useEffect(() => {
    const cam = cameraRef.current
    if (!cam) return
    const [cx, cy, cz] = cameraPosition
    cam.position.set(cx, cy, cz)
    const targetY = effectiveFloorY
    cam.lookAt(0, targetY, 0)
    cam.updateProjectionMatrix()

    const controls = orbitRef.current
    if (controls && controls.target) {
      controls.target.set(0, targetY, 0)
      if (typeof controls.update === 'function') controls.update()
    }
  }, [cameraPosition, effectiveFloorY])

  const handleFloorMoveFromHit = useCallback((hitX, hitZ) => {
    const next = planeToNorm(hitX, hitZ, effectivePlaneSize)

    if (isAddMode) {
      // Throttle hover updates to avoid React re-rendering on every pointermove
      // (helps on low-end GPUs/CPUs).
      if (!hoverRafRef.current) {
        hoverRafRef.current = requestAnimationFrame(() => {
          hoverRafRef.current = 0
          setHoverNorm(next)
        })
      }
    }

    // Click-drag adding for Zone/Walkway
    if (isAddMode && addDragRef.current) {
      addDragRef.current.current = next

      if (!addPreviewRafRef.current) {
        addPreviewRafRef.current = requestAnimationFrame(() => {
          addPreviewRafRef.current = 0
          const drag = addDragRef.current
          if (!drag) return
          const a = drag.start
          const b = drag.current
          const x = clamp01(Math.min(a.x, b.x))
          const y = clamp01(Math.min(a.y, b.y))
          const w = clamp01(Math.abs(a.x - b.x))
          const h = clamp01(Math.abs(a.y - b.y))
          setAddPreview({ x, y, w, h })
        })
      }
    }

    if (draggingId) {
      draggingNormRef.current = next
      const obj = draggingObjectRef.current
      if (obj) {
        obj.position.x = hitX
        obj.position.z = hitZ
      }
    }
  }, [effectivePlaneSize, isAddMode, draggingId])

  const getFloorHitFromEvent = (e) => {
    const ray = e?.ray
    if (!ray) return null

    // Plane equation: y = effectiveFloorY + epsilon.
    // three.Plane uses: normal.dot(point) + constant = 0
    const y = (Number.isFinite(Number(effectiveFloorY)) ? Number(effectiveFloorY) : 0) + 0.001
    floorPlaneRef.normal.set(0, 1, 0)
    floorPlaneRef.constant = -y

    const hit = ray.intersectPlane(floorPlaneRef, floorHitRef)
    if (!hit) return null
    return { x: hit.x, z: hit.z }
  }

  const capturePointer = (e) => {
    const t = e?.nativeEvent?.target
    const pid = e?.pointerId
    if (!t || pid == null) return
    if (typeof t.setPointerCapture !== 'function') return
    try {
      t.setPointerCapture(pid)
    } catch {
      // ignore
    }
  }

  const handleAddPointerDown = (e) => {
    if (!fullScreen) return
    if (!isAddMode) return
    if (!addElementType) return
    if (typeof onAddElement !== 'function') return

    const hit = getFloorHitFromEvent(e)
    if (!hit) return
    const next = planeToNorm(hit.x, hit.z, effectivePlaneSize)

    // For zones/walkways: start click-drag sizing.
    if (addOverlayType) {
      capturePointer(e)
      // Disable camera immediately so click+drag draws without moving the scene.
      setOrbitEnabledNow(false)
      addDragRef.current = { type: addOverlayType, start: next, current: next }
      setIsAddDrawing(true)
      setAddPreview({ x: next.x, y: next.y, w: 0, h: 0 })
      return
    }

    // For models: click-to-place.
    onAddElement(addElementType, next)
  }

  const handleFloorPointerMove = (e) => {
    if (!fullScreen) return

    const hit = getFloorHitFromEvent(e)
    if (!hit) return
    handleFloorMoveFromHit(hit.x, hit.z)
  }

  const stopDragging = () => {
    if (!draggingId) return
    if (typeof onMoveElement === 'function' && draggingNormRef.current) {
      const dragged = normalizedElements.find((e) => String(e?.id) === String(draggingId))
      const nextCenter = draggingNormRef.current

      if (dragged?.type === ELEMENT_TYPES.ZONE || dragged?.type === ELEMENT_TYPES.WALKWAY) {
        const wNorm = clamp01(Number(dragged?.w) || 0.2)
        const hNorm = clamp01(Number(dragged?.h) || 0.12)
        onMoveElement(String(draggingId), {
          x: clamp01((Number(nextCenter?.x) || 0) - wNorm / 2),
          y: clamp01((Number(nextCenter?.y) || 0) - hNorm / 2),
        })
      } else {
        onMoveElement(String(draggingId), nextCenter)
      }
    }
    draggingObjectRef.current = null
    draggingNormRef.current = null
    setDraggingId('')
    setCursor('default')
    // Re-enable camera only if current mode allows it.
    // (When adding Zone/Walkway, OrbitControls should remain disabled.)
    setOrbitEnabledNow(!isOverlayAddToolActive && !isTransforming && !isAddDrawing)
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border bg-slate-950"
      style={
        fullScreen
          ? { height: '100%', minHeight: 0 }
          : { height: '60vh', maxHeight: 560, minHeight: 320 }
      }
    >
      <ErrorBoundary
        fallback={() => (
          <div className="flex h-full w-full items-center justify-center p-4">
            <div className="max-w-xl rounded-xl border bg-white p-4 text-sm text-slate-700 shadow">
              <div className="font-semibold">3D view failed to render</div>
              <div className="mt-1 text-xs text-slate-500">
                This usually happens when a referenced GLB file is missing/invalid or WebGL is unavailable.
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Check that your models are under <span className="font-mono">public/models</span> and accessible as
                <span className="font-mono">/models/*.glb</span>.
              </div>
            </div>
          </div>
        )}
      >
        <Canvas
          camera={{ position: cameraPosition, fov: fullScreen ? 45 : 40 }}
          onCreated={({ camera }) => {
            cameraRef.current = camera
            const [cx, cy, cz] = cameraPosition
            camera.position.set(cx, cy, cz)
            camera.lookAt(0, effectiveFloorY, 0)
          }}
        >
          <CanvasPointerTracker
            enabled={fullScreen && (draggingId || isAddMode)}
            floorY={effectiveFloorY}
            onMove={(x, z) => handleFloorMoveFromHit(x, z)}
          />
          <color attach="background" args={['#0b1020']} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} />

          {fullScreen ? (
            <>
              <gridHelper args={[effectivePlaneSize * 2.5, 40, '#334155', '#1f2937']} position={[0, 0.001, 0]} />
              <axesHelper args={[1.5]} />
            </>
          ) : null}

          <ErrorBoundary
            fallback={() => (
              <Html center>
                <div className="rounded-lg border bg-white/90 px-3 py-2 text-xs text-slate-700 shadow">
                  Failed to load floor model
                </div>
              </Html>
            )}
          >
            <Suspense
              fallback={
                <Html center>
                  <div className="rounded-lg border bg-white/90 px-3 py-2 text-xs text-slate-700 shadow">
                    Loading 3D model…
                  </div>
                </Html>
              }
            >
              <FloorModel
                url={modelUrl}
                scale={scale}
                onComputedPlaneSize={(next) => {
                  // Avoid noisy re-renders if the computed size doesn’t really change.
                  setFloorPlaneSize((prev) => {
                    const p = Number(prev) || 0
                    const n = Number(next) || 0
                    if (!Number.isFinite(n) || n <= 0) return p
                    if (Math.abs(p - n) < 0.001) return p
                    return n
                  })
                }}
                onComputedFloorY={(next) => {
                  setFloorPlaneY((prev) => {
                    const p = Number(prev) || 0
                    const n = Number(next) || 0
                    if (!Number.isFinite(n)) return p
                    if (Math.abs(p - n) < 0.001) return p
                    return n
                  })
                }}
              />
            </Suspense>
          </ErrorBoundary>

          {/* 2D overlays: zones + walkways */}
          {zoneElements.map((el) => {
            const id = String(el.id)
            const isSelected = selectedId && String(selectedId) === id
            const wNorm = clamp01(Number(el.w) || 0.15)
            const hNorm = clamp01(Number(el.h) || 0.12)
            const cx = clamp01((Number(el.x) || 0) + wNorm / 2)
            const cy = clamp01((Number(el.y) || 0) + hNorm / 2)
            const pos = normToPlane(cx, cy, effectivePlaneSize)
            const w = Math.max(0.02, wNorm) * effectivePlaneSize
            const d = Math.max(0.02, hNorm) * effectivePlaneSize
            const fill = zoneFillColor(el.color)
            const rot = (Number(el.rotationDeg) || 0) * (Math.PI / 180)

            return (
              <group
                key={id}
                position={[pos.x, effectiveFloorY + overlayLift, pos.z]}
                rotation={[0, rot, 0]}
                onPointerDown={(e) => {
                  if (!fullScreen) return
                  if (isAddMode) {
                    handleAddPointerDown(e)
                    return
                  }
                  e.stopPropagation()
                  if (typeof onSelectElement === 'function') onSelectElement(id)

                  if (isTransforming) return

                  if (typeof onMoveElement === 'function' && activeTool === 'select') {
                    // eventObject is one of the meshes; move its parent group.
                    draggingObjectRef.current = e.eventObject?.parent || null
                    draggingNormRef.current = null
                    setDraggingId(id)
                    setCursor('grabbing')
                    setOrbitEnabledNow(false)
                    capturePointer(e)
                  }
                }}
                onPointerMove={(e) => {
                  // Keep add preview + dragging responsive even when hovering existing meshes.
                  handleFloorPointerMove(e)
                }}
              >
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[w, d]} />
                  <meshBasicMaterial
                    color={fill}
                    transparent
                    opacity={0.35}
                    depthWrite={false}
                    polygonOffset
                    polygonOffsetFactor={-1}
                    polygonOffsetUnits={-1}
                  />
                </mesh>
                <mesh
                  rotation={[-Math.PI / 2, 0, 0]}
                  renderOrder={10}
                  onPointerOver={(e) => {
                    if (!fullScreen) return
                    e.stopPropagation()
                    setCursor(activeTool === 'select' && !isAddMode ? 'grab' : 'pointer')
                  }}
                  onPointerOut={() => {
                    if (!fullScreen) return
                    setCursor('default')
                  }}
                >
                  <planeGeometry args={[w, d]} />
                  <meshBasicMaterial transparent opacity={0} />
                  {isSelected ? <Edges color="#fdba74" /> : <Edges color="#ffffff" />}
                </mesh>
              </group>
            )
          })}

          {walkwayElements.map((el) => {
            const id = String(el.id)
            const isSelected = selectedId && String(selectedId) === id
            const wNorm = clamp01(Number(el.w) || 0.2)
            const hNorm = clamp01(Number(el.h) || 0.06)
            const cx = clamp01((Number(el.x) || 0) + wNorm / 2)
            const cy = clamp01((Number(el.y) || 0) + hNorm / 2)
            const pos = normToPlane(cx, cy, effectivePlaneSize)
            const w = Math.max(0.02, wNorm) * effectivePlaneSize
            const d = Math.max(0.02, hNorm) * effectivePlaneSize
            const rot = (Number(el.rotationDeg) || 0) * (Math.PI / 180)

            return (
              <group
                key={id}
                position={[pos.x, effectiveFloorY + overlayLift, pos.z]}
                rotation={[0, rot, 0]}
                onPointerDown={(e) => {
                  if (!fullScreen) return
                  if (isAddMode) {
                    handleAddPointerDown(e)
                    return
                  }
                  e.stopPropagation()
                  if (typeof onSelectElement === 'function') onSelectElement(id)

                  if (isTransforming) return

                  if (typeof onMoveElement === 'function' && activeTool === 'select') {
                    draggingObjectRef.current = e.eventObject?.parent || null
                    draggingNormRef.current = null
                    setDraggingId(id)
                    setCursor('grabbing')
                    setOrbitEnabledNow(false)
                    capturePointer(e)
                  }
                }}
                onPointerMove={(e) => {
                  handleFloorPointerMove(e)
                }}
              >
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <planeGeometry args={[w, d]} />
                  <meshBasicMaterial
                    color="#000000"
                    transparent
                    opacity={0.85}
                    depthWrite={false}
                    polygonOffset
                    polygonOffsetFactor={-1}
                    polygonOffsetUnits={-1}
                  />
                </mesh>
                <mesh
                  rotation={[-Math.PI / 2, 0, 0]}
                  renderOrder={10}
                  onPointerOver={(e) => {
                    if (!fullScreen) return
                    e.stopPropagation()
                    setCursor(activeTool === 'select' && !isAddMode ? 'grab' : 'pointer')
                  }}
                  onPointerOut={() => {
                    if (!fullScreen) return
                    setCursor('default')
                  }}
                >
                  <planeGeometry args={[w, d]} />
                  <meshBasicMaterial transparent opacity={0} />
                  <Edges color={isSelected ? '#fdba74' : '#ffffff'} />
                </mesh>
              </group>
            )
          })}

          {/* Add-mode click-drag preview for Zone/Walkway */}
          {fullScreen && isAddMode && isAddDrawing && addPreview && addOverlayType ? (
            (() => {
              const wNorm = clamp01(Number(addPreview.w) || 0)
              const hNorm = clamp01(Number(addPreview.h) || 0)
              const x = clamp01(Number(addPreview.x) || 0)
              const y = clamp01(Number(addPreview.y) || 0)
              const cx = clamp01(x + wNorm / 2)
              const cy = clamp01(y + hNorm / 2)
              const pos = normToPlane(cx, cy, effectivePlaneSize)
              const w = Math.max(0.02, wNorm) * effectivePlaneSize
              const d = Math.max(0.02, hNorm) * effectivePlaneSize
              const color = addOverlayType === ELEMENT_TYPES.ZONE ? '#14532d' : '#000000'
              const opacity = addOverlayType === ELEMENT_TYPES.ZONE ? 0.25 : 0.65

              return (
                <group position={[pos.x, effectiveFloorY + overlayLift, pos.z]}>
                  <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[w, d]} />
                    <meshBasicMaterial
                      color={color}
                      transparent
                      opacity={opacity}
                      depthWrite={false}
                      polygonOffset
                      polygonOffsetFactor={-1}
                      polygonOffsetUnits={-1}
                    />
                  </mesh>
                  <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[w, d]} />
                    <meshBasicMaterial transparent opacity={0} />
                    <Edges color="#fdba74" />
                  </mesh>
                </group>
              )
            })()
          ) : null}

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, effectiveFloorY + 0.001, 0]}
          onPointerMove={(e) => {
            if (!fullScreen) return
            e.stopPropagation()
            handleFloorPointerMove(e)
          }}
          onPointerDown={(e) => {
            if (!fullScreen) return
            e.stopPropagation()

            // Double-click + drag pans the camera.
            // Note: we only start it when the user clicks on the floor (not on objects).
            if (!isAddMode) {
              maybeStartPanDrag(e)
            }

            if (!isAddMode) {
              if (typeof onSelectElement === 'function') onSelectElement('')
              setDraggingId('')
              setCursor('default')
              return
            }

            handleAddPointerDown(e)
          }}
          onPointerUp={() => {
            stopPanDrag()
            stopDragging()
            setCursor('default')
            setOrbitEnabledNow(!isOverlayAddToolActive && !isTransforming && !isAddDrawing)

            if (!fullScreen) return
            if (!isAddMode) return
            if (!addDragRef.current) return
            if (typeof onAddElement !== 'function') {
              clearAddDrag()
              return
            }

            const drag = addDragRef.current
            const a = drag.start
            const b = drag.current
            const x = clamp01(Math.min(a.x, b.x))
            const y = clamp01(Math.min(a.y, b.y))
            const w = clamp01(Math.abs(a.x - b.x))
            const h = clamp01(Math.abs(a.y - b.y))

            // Allow rectangles (not forced square) and let walkways be thinner.
            const minW = drag.type === ELEMENT_TYPES.WALKWAY ? 0.01 : 0.02
            const minH = drag.type === ELEMENT_TYPES.WALKWAY ? 0.006 : 0.02
            const finalW = Math.max(minW, w)
            const finalH = Math.max(minH, h)

            const payload = {
              x,
              y,
              w: finalW,
              h: finalH,
              rotationDeg: 0,
              ...(drag.type === ELEMENT_TYPES.ZONE
                ? { color: 'dark-green' }
                : drag.type === ELEMENT_TYPES.WALKWAY
                  ? { color: 'black' }
                  : null),
            }

            onAddElement(drag.type, payload)
            clearAddDrag()
          }}
          onPointerLeave={() => {
            stopPanDrag()
            stopDragging()
            clearAddDrag()
            setCursor('default')
            setOrbitEnabledNow(!isOverlayAddToolActive && !isTransforming && !isAddDrawing)
          }}
        >
          <planeGeometry args={[effectivePlaneSize, effectivePlaneSize]} />
          <meshStandardMaterial transparent opacity={0} />
        </mesh>

          {showMachineMarkers
            ? visiblePlaceableElements.map((el) => {
              const pos = normToPlane(el.x ?? 0.5, el.y ?? 0.5, effectivePlaneSize)
              const isSelected = selectedId && String(selectedId) === String(el.id)
              const isDragging = draggingId && String(draggingId) === String(el.id)

              const machineId = el?.type === ELEMENT_TYPES.MACHINE ? String(el?.machineId || '') : ''
              const machineMeta = machineId && machineMetaById ? machineMetaById[machineId] : null
              const machineName = machineMeta?.name || el?.label || machineId
              const machineStatus = machineMeta?.status || 'RUNNING'

              const rawModelUrl = typeof el?.modelUrl === 'string' ? el.modelUrl.trim() : ''
              const isDefaultMachineUrl =
                rawModelUrl === '' ||
                rawModelUrl === DEFAULT_MODEL_URLS[ELEMENT_TYPES.MACHINE] ||
                rawModelUrl === '/models/machine.glb'

              const url =
                el?.type === ELEMENT_TYPES.MACHINE
                  ? (isDefaultMachineUrl
                      ? machineModelUrlForStatus(machineStatus)
                      : rawModelUrl)
                  : (rawModelUrl || DEFAULT_MODEL_URLS[el.type] || '')
              const uniformScale = clamp(Number(el.scale) || 1, 0.01, 50)
              const markerColor = el?.type === ELEMENT_TYPES.MACHINE ? statusColor(machineStatus) : '#111827'
              const labelText = el?.type === ELEMENT_TYPES.MACHINE ? abbreviateMachineName(machineName) : ''
              const oeePct = el?.type === ELEMENT_TYPES.MACHINE ? computeMachineOeePct(machineMeta) : null

              const canOpenDetails =
                !fullScreen &&
                el?.type === ELEMENT_TYPES.MACHINE &&
                !!machineId &&
                typeof onOpenMachineDetails === 'function'

              const content = (
                <group
                  ref={isSelected ? selectedObjectRef : undefined}
                  position={[pos.x, effectiveFloorY + 0.0, pos.z]}
                  scale={[uniformScale, uniformScale, uniformScale]}
                  rotation={[0, (Number(el.rotationDeg) || 0) * (Math.PI / 180), 0]}
                  onPointerDown={(e) => {
                    if (isAddMode) {
                      handleAddPointerDown(e)
                      return
                    }

                    if (!fullScreen) {
                      if (canOpenDetails) {
                        e.stopPropagation()
                        onOpenMachineDetails(machineId)
                      }
                      return
                    }
                    if (!fullScreen) return
                    e.stopPropagation()

                    if (isTransforming) return

                    if (typeof onSelectElement === 'function') onSelectElement(String(el.id))

                    if (typeof onMoveElement === 'function' && activeTool === 'select') {
                      draggingObjectRef.current = e.eventObject
                      draggingNormRef.current = null
                      setDraggingId(String(el.id))
                      setCursor('grabbing')
                      setOrbitEnabledNow(false)
                      capturePointer(e)
                    }
                  }}
                  onPointerMove={(e) => {
                    handleFloorPointerMove(e)
                  }}
                  onPointerOver={(e) => {
                    if (isAddMode) return
                    if (canOpenDetails) {
                      e.stopPropagation()
                      setHoveredMachineId(machineId)
                      setCursor('pointer')
                      return
                    }
                    if (!fullScreen) return
                    e.stopPropagation()
                    setCursor(activeTool === 'select' && !isAddMode ? 'grab' : 'pointer')
                  }}
                  onPointerOut={() => {
                    if (canOpenDetails) {
                      setHoveredMachineId((prev) => (prev === machineId ? '' : prev))
                      setCursor('default')
                      return
                    }
                    if (!fullScreen) return
                    setCursor('default')
                  }}
                  onClick={(e) => {
                    if (!canOpenDetails) return
                    e.stopPropagation()
                    onOpenMachineDetails(machineId)
                  }}
                >
                  <ErrorBoundary fallback={() => <FallbackMarker selected={isSelected || isDragging} />}>
                    <Suspense fallback={<FallbackMarker selected={isSelected || isDragging} />}>
                      {url ? (
                        <PlacedGLB
                          url={url}
                          tintColor={!fullScreen && el?.type === ELEMENT_TYPES.MACHINE ? markerColor : undefined}
                          tintStrength={0.12}
                        />
                      ) : null}
                    </Suspense>
                  </ErrorBoundary>

                  <mesh position={[0, 0.08, 0]}>
                    <boxGeometry args={[0.25, 0.16, 0.25]} />
                    <meshStandardMaterial
                      color={isSelected ? '#0ea5e9' : isDragging ? '#0ea5e9' : markerColor}
                      transparent
                      opacity={url ? 0.05 : 1}
                    />
                  </mesh>

                  {showMachineLabels && el?.type === ELEMENT_TYPES.MACHINE && labelText ? (
                    <Html
                      position={[0, 0.35, 0]}
                      center
                      distanceFactor={10}
                      zIndexRange={[10, 0]}
                      style={{ pointerEvents: 'none' }}
                    >
                      <div
                        className="px-1 text-[11px] font-semibold"
                        style={{
                          color: fullScreen ? '#ffffff' : markerColor,
                          textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                        }}
                        title={`${machineName}${machineStatus ? ` • ${machineStatus}` : ''}`}
                      >
                        {labelText}
                      </div>
                    </Html>
                  ) : null}

                  {!fullScreen && canOpenDetails && hoveredMachineId === machineId ? (
                    <Html
                      position={[0, 0.55, 0]}
                      center={false}
                      distanceFactor={10}
                      zIndexRange={[20, 0]}
                      style={{ pointerEvents: 'none' }}
                    >
                      <div style={{ transform: 'translate(14px, calc(-100% - 10px))' }}>
                        <div className="max-w-[260px] rounded-lg border bg-white/95 p-2 text-xs text-slate-800 shadow-lg">
                          <div className="font-semibold">{machineName || 'Machine'}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-slate-600">
                            <span>Status: {machineStatus || '—'}</span>
                            <span>•</span>
                            <span>OEE: {oeePct == null ? '—' : `${oeePct.toFixed(1)}%`}</span>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">Click to open machine details</div>
                        </div>
                      </div>
                    </Html>
                  ) : null}

                  {isSelected ? (
                    <mesh
                      position={[0, 0.08, 0]}
                      onPointerOver={(ev) => {
                        if (!fullScreen) return
                        ev.stopPropagation()
                        setCursor(activeTool === 'select' && !isAddMode ? 'grab' : 'pointer')
                      }}
                      onPointerOut={() => {
                        if (!fullScreen) return
                        setCursor('default')
                      }}
                    >
                      <boxGeometry args={[0.28, 0.18, 0.28]} />
                      <meshBasicMaterial color="#fdba74" wireframe />
                    </mesh>
                  ) : null}
                </group>
              )

              return isSelected ? (
                <TransformControls
                  key={String(el.id)}
                  mode="scale"
                  enabled={typeof onUpdateElement === 'function'}
                  onMouseDown={() => setIsTransforming(true)}
                  onMouseUp={() => setIsTransforming(false)}
                  onObjectChange={() => {
                    if (typeof onUpdateElement !== 'function') return
                    const obj = selectedObjectRef.current
                    if (!obj) return

                    const s = clamp(Number(obj.scale?.x) || 1, 0.01, 50)
                    obj.scale.setScalar(s)
                    onUpdateElement(String(el.id), { scale: s })
                  }}
                >
                  {content}
                </TransformControls>
              ) : (
                <group key={String(el.id)}>{content}</group>
              )
            })
            : null}

        {showMachineMarkers && isAddMode && hoverNorm && addElementType ? (
          (() => {
            const pos = normToPlane(hoverNorm.x, hoverNorm.y, effectivePlaneSize)
            return (
              <mesh position={[pos.x, effectiveFloorY + 0.08, pos.z]}>
                <boxGeometry args={[0.25, 0.16, 0.25]} />
                <meshStandardMaterial color="#0ea5e9" transparent opacity={0.35} />
              </mesh>
            )
          })()
        ) : null}

          <OrbitControls
            ref={orbitRef}
            enablePan={fullScreen}
            enableZoom={fullScreen}
            enableRotate={fullScreen}
            mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
            autoRotate={autoRotate}
            autoRotateSpeed={1.0}
            // Important: when adding Zone/Walkway we need click+drag on the floor to draw,
            // so disable OrbitControls drag handling in that mode.
            enabled={controlsEnabled}
            onStart={() => {
              stopDragging()
              clearAddDrag()
              setHoverNorm(null)
            }}
          />
        </Canvas>
      </ErrorBoundary>

      <div className="pointer-events-none absolute bottom-2 right-2 rounded-md border bg-white/80 px-2 py-1 text-xs text-slate-700 backdrop-blur">
        {!fullScreen
          ? 'Hover machine for details • Click machine to open'
          : isOverlayAddToolActive
            ? 'Click + drag + release to draw • Camera drag disabled'
            : isAddMode
              ? 'Click to place'
              : selectedId
                ? 'Drag to move • Use gizmo to scale'
                : 'Click to select • Drag to move'}
      </div>
    </div>
  )
}

useGLTF.preload('/models/floor-model.glb')
useGLTF.preload('/models/machine-running.glb')
useGLTF.preload('/models/machine-idle.glb')
useGLTF.preload('/models/machine-down.glb')
