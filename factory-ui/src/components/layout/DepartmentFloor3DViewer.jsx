import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Center, Html, OrbitControls, useGLTF } from '@react-three/drei'

const DEFAULT_PLANE_SIZE = 10

function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
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

export default function DepartmentFloor3DViewer({
  modelUrl = '/models/floor-model.glb',
  scale = 1,
  autoRotate = false,
  elements = [],
  onMoveElement,
  showMachineMarkers = true,
  planeSize = DEFAULT_PLANE_SIZE,
}) {
  const [draggingId, setDraggingId] = useState('')

  const machineElements = (Array.isArray(elements) ? elements : []).filter((e) => e && e.type === 'MACHINE')

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border bg-slate-50"
      style={{ height: '52vh', maxHeight: 560, minHeight: 320 }}
    >
      <Canvas camera={{ position: [3.5, 2.5, 3.5], fov: 45 }}>
        <color attach="background" args={['#f8fafc']} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} />

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

        {showMachineMarkers ? (
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, 0]}
            onPointerMove={(e) => {
              if (!draggingId || typeof onMoveElement !== 'function') return
              e.stopPropagation()
              const p = e.point
              const next = planeToNorm(p.x, p.z, planeSize)
              onMoveElement(draggingId, next)
            }}
            onPointerUp={() => setDraggingId('')}
            onPointerLeave={() => setDraggingId('')}
          >
            <planeGeometry args={[planeSize, planeSize]} />
            <meshStandardMaterial transparent opacity={0} />
          </mesh>
        ) : null}

        {showMachineMarkers
          ? machineElements.map((el) => {
              const pos = normToPlane(el.x ?? 0.5, el.y ?? 0.5, planeSize)
              const isDragging = draggingId && String(draggingId) === String(el.id)

              return (
                <mesh
                  key={String(el.id)}
                  position={[pos.x, 0.08, pos.z]}
                  onPointerDown={(e) => {
                    if (typeof onMoveElement !== 'function') return
                    e.stopPropagation()
                    setDraggingId(String(el.id))
                  }}
                >
                  <boxGeometry args={[0.25, 0.16, 0.25]} />
                  <meshStandardMaterial color={isDragging ? '#0ea5e9' : '#111827'} />
                </mesh>
              )
            })
          : null}

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          autoRotate={autoRotate}
          autoRotateSpeed={1.0}
          onStart={() => setDraggingId('')}
        />
      </Canvas>

      <div className="pointer-events-none absolute bottom-2 right-2 rounded-md border bg-white/80 px-2 py-1 text-xs text-slate-700 backdrop-blur">
        Drag cubes to move machines
      </div>
    </div>
  )
}

useGLTF.preload('/models/floor-model.glb')
