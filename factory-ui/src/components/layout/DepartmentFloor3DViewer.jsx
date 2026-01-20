import { Component, Suspense, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Center, Html, OrbitControls, TransformControls, useGLTF } from '@react-three/drei'

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
  if (s === 'WARNING') return '#f59e0b'
  if (s === 'MAINTENANCE') return '#a855f7'
  if (s === 'OFFLINE') return '#94a3b8'
  return '#22c55e' // RUNNING (default)
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

function FloorModel({ url, scale }) {
  const { scene } = useGLTF(url)

  // Clone so multiple renders don’t mutate the shared cached scene.
  const cloned = useMemo(() => scene.clone(true), [scene])

  return (
    <Center>
      <primitive object={cloned} scale={[scale, scale, scale]} />
    </Center>
  )
}

function PlacedGLB({ url }) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => scene.clone(true), [scene])
  return (
    <Center>
      <primitive object={cloned} />
    </Center>
  )
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
  showMachineMarkers = true,
  showMachineLabels = true,
  machineMetaById = null,
  machineStatusVisibility = null,
  planeSize = DEFAULT_PLANE_SIZE,
  fullScreen = false,
}) {
  const [draggingId, setDraggingId] = useState('')
  const [hoverNorm, setHoverNorm] = useState(null)
  const [isTransforming, setIsTransforming] = useState(false)

  const orbitRef = useRef(null)

  const draggingObjectRef = useRef(null)
  const draggingNormRef = useRef(null)

  const stopDragging = () => {
    if (!draggingId) return
    if (typeof onMoveElement === 'function' && draggingNormRef.current) {
      onMoveElement(String(draggingId), draggingNormRef.current)
    }
    draggingObjectRef.current = null
    draggingNormRef.current = null
    setDraggingId('')
  }

  const isAddMode = typeof activeTool === 'string' && activeTool.startsWith('add:')
  const addType = isAddMode ? activeTool.slice('add:'.length) : ''
  const addElementType =
    addType === 'floor'
      ? null
      : addType === 'machine'
        ? ELEMENT_TYPES.MACHINE
        : addType === 'walkway'
          ? ELEMENT_TYPES.WALKWAY
          : addType === 'transporter'
            ? ELEMENT_TYPES.TRANSPORTER
            : null

  const normalizedElements = Array.isArray(elements) ? elements.filter(Boolean) : []
  const placeableElements = normalizedElements.filter((e) =>
    [ELEMENT_TYPES.MACHINE, ELEMENT_TYPES.WALKWAY, ELEMENT_TYPES.TRANSPORTER].includes(e?.type),
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
    ? visiblePlaceableElements.find((e) => String(e.id) === String(selectedId))
    : null

  const selectedObjectRef = useRef(null)

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border bg-slate-950"
      style={
        fullScreen
          ? { height: '100%', minHeight: 0 }
          : { height: '52vh', maxHeight: 560, minHeight: 320 }
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
        <Canvas camera={{ position: [3.5, 2.5, 3.5], fov: 45 }}>
          <color attach="background" args={['#0b1020']} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} />

          {fullScreen ? (
            <>
              <gridHelper args={[planeSize * 2.5, 40, '#334155', '#1f2937']} position={[0, 0.001, 0]} />
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
              <FloorModel url={modelUrl} scale={scale} />
            </Suspense>
          </ErrorBoundary>

        {showMachineMarkers ? (
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, 0]}
            onPointerMove={(e) => {
              e.stopPropagation()
              const p = e.point
              const next = planeToNorm(p.x, p.z, planeSize)

              if (isAddMode) setHoverNorm(next)

              if (draggingId) {
                draggingNormRef.current = next
                const obj = draggingObjectRef.current
                if (obj) {
                  obj.position.x = p.x
                  obj.position.z = p.z
                }
              }
            }}
            onPointerDown={(e) => {
              e.stopPropagation()

              if (!isAddMode) {
                if (typeof onSelectElement === 'function') onSelectElement('')
                setDraggingId('')
                return
              }

              if (!addElementType) return
              if (typeof onAddElement !== 'function') return

              const p = e.point
              const next = planeToNorm(p.x, p.z, planeSize)
              onAddElement(addElementType, next)
            }}
            onPointerUp={stopDragging}
            onPointerLeave={stopDragging}
          >
            <planeGeometry args={[planeSize, planeSize]} />
            <meshStandardMaterial transparent opacity={0} />
          </mesh>
        ) : null}

          {showMachineMarkers
            ? visiblePlaceableElements.map((el) => {
              const pos = normToPlane(el.x ?? 0.5, el.y ?? 0.5, planeSize)
              const isSelected = selectedId && String(selectedId) === String(el.id)
              const isDragging = draggingId && String(draggingId) === String(el.id)

              const url = el.modelUrl || DEFAULT_MODEL_URLS[el.type] || ''
              const uniformScale = clamp(Number(el.scale) || 1, 0.01, 50)

              const machineId = el?.type === ELEMENT_TYPES.MACHINE ? String(el?.machineId || '') : ''
              const machineMeta = machineId && machineMetaById ? machineMetaById[machineId] : null
              const machineName = machineMeta?.name || el?.label || machineId
              const machineStatus = machineMeta?.status || 'RUNNING'
              const markerColor = el?.type === ELEMENT_TYPES.MACHINE ? statusColor(machineStatus) : '#111827'
              const labelText = el?.type === ELEMENT_TYPES.MACHINE ? abbreviateMachineName(machineName) : ''

              const content = (
                <group
                  ref={isSelected ? selectedObjectRef : undefined}
                  position={[pos.x, 0.0, pos.z]}
                  scale={[uniformScale, uniformScale, uniformScale]}
                  onPointerDown={(e) => {
                    if (isAddMode) return
                    e.stopPropagation()

                    if (isTransforming) return

                    if (typeof onSelectElement === 'function') onSelectElement(String(el.id))

                    if (typeof onMoveElement === 'function') {
                      draggingObjectRef.current = e.eventObject
                      draggingNormRef.current = null
                      setDraggingId(String(el.id))
                    }
                  }}
                >
                  <ErrorBoundary fallback={() => <FallbackMarker selected={isSelected || isDragging} />}>
                    <Suspense fallback={<FallbackMarker selected={isSelected || isDragging} />}>
                      {url ? <PlacedGLB url={url} /> : null}
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
                      style={{ pointerEvents: 'none' }}
                    >
                      <div
                        className="rounded-md border border-slate-700/60 bg-slate-950/80 px-2 py-0.5 text-[11px] font-semibold text-slate-100 shadow"
                        title={`${machineName}${machineStatus ? ` • ${machineStatus}` : ''}`}
                      >
                        {labelText}
                      </div>
                    </Html>
                  ) : null}

                  {isSelected ? (
                    <mesh position={[0, 0.08, 0]}>
                      <boxGeometry args={[0.28, 0.18, 0.28]} />
                      <meshBasicMaterial color="#0ea5e9" wireframe />
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
            const pos = normToPlane(hoverNorm.x, hoverNorm.y, planeSize)
            return (
              <mesh position={[pos.x, 0.08, pos.z]}>
                <boxGeometry args={[0.25, 0.16, 0.25]} />
                <meshStandardMaterial color="#0ea5e9" transparent opacity={0.35} />
              </mesh>
            )
          })()
        ) : null}

          <OrbitControls
            ref={orbitRef}
            enablePan
            enableZoom
            enableRotate
            autoRotate={autoRotate}
            autoRotateSpeed={1.0}
            enabled={!draggingId && !isTransforming}
            onStart={() => {
              stopDragging()
              setHoverNorm(null)
            }}
          />
        </Canvas>
      </ErrorBoundary>

      <div className="pointer-events-none absolute bottom-2 right-2 rounded-md border bg-white/80 px-2 py-1 text-xs text-slate-700 backdrop-blur">
        {isAddMode ? 'Click to place' : selectedId ? 'Drag to move • Use gizmo to scale' : 'Click to select • Drag to move'}
      </div>
    </div>
  )
}

useGLTF.preload('/models/floor-model.glb')
