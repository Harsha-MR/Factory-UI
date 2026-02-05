import {
  Component,
  Suspense,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  Billboard,
  Edges,
  Instances,
  Instance,
  OrbitControls,
  Text,
  TransformControls,
  useGLTF,
} from "@react-three/drei";
import { Box3, Color, Frustum, Matrix4, MOUSE, Plane, Vector2, Vector3 } from "three";
import { vector3Pool, vector2Pool } from "../../utils/objectPool";
import { getWorkerManager } from "../../utils/workerManager";

import { ELEMENT_TYPES } from "./layoutTypes";

const DEFAULT_PLANE_SIZE = 10;

const DEFAULT_MODEL_URLS = {
  [ELEMENT_TYPES.MACHINE]: "/models/machine.glb",
  [ELEMENT_TYPES.WALKWAY]: "/models/walkway.glb",
  [ELEMENT_TYPES.TRANSPORTER]: "/models/transporter.glb",
};

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Intentionally empty: we show fallback UI instead of crashing the page.
  }

  render() {
    if (this.state.hasError) {
      return typeof this.props.fallback === "function"
        ? this.props.fallback()
        : this.props.fallback || null;
    }
    return this.props.children;
  }
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function abbreviateMachineName(raw) {
  const name = String(raw || "").trim();
  if (!name) return "MA";

  // Match: "Machine 1", "Machine-1", "MACHINE_01" -> MA-1
  const m = name.match(/\bmachine\b\s*[-_]?\s*(\d+)/i);
  if (m) return `MA-${Number.parseInt(m[1], 10)}`;

  // Generic: take an uppercase prefix + trailing number
  const parts = name.split(/\s*[-_\s]+\s*/).filter(Boolean);
  const head = parts[0] || name;
  const last = parts[parts.length - 1] || "";
  const numMatch = last.match(/(\d+)/);

  const isAllCapsShort = /^[A-Z0-9]{2,4}$/.test(head);
  const prefix = isAllCapsShort ? head : head.slice(0, 2).toUpperCase();

  if (numMatch) return `${prefix}-${Number.parseInt(numMatch[1], 10)}`;
  return prefix;
}

function statusColor(status) {
  const s = String(status || "").toUpperCase();
  if (s === "DOWN") return "#ef4444";
  if (s === "IDLE") return "#eab308";
  if (s === "WARNING") return "#f59e0b";
  if (s === "MAINTENANCE") return "#a855f7";
  if (s === "OFFLINE") return "#94a3b8";
  return "#22c55e"; // RUNNING (default)
}

function zoneFillColor(colorKey) {
  const k = String(colorKey || "").toLowerCase();
  if (k === "dark-green" || k === "darkgreen" || k === "green")
    return "#14532d";
  if (k === "orange") return "#f97316";
  if (k === "yellow") return "#facc15";
  return "#14532d";
}

function computeMachineOeePct(machine) {
  const time = machine?.timeMetrics || {};
  const prod = machine?.productionMetrics || {};

  const planned = Number(time.plannedProductionTime ?? NaN);
  const runtime = Number(time.runTime ?? NaN);
  const idealCycleTime = Number(prod.idealCycleTime ?? NaN);
  const totalParts = Number(prod.totalPartsProduced ?? NaN);
  const goodParts = Number(prod.goodParts ?? NaN);

  if (!Number.isFinite(planned) || planned <= 0) return null;
  if (!Number.isFinite(runtime) || runtime <= 0) return null;
  if (!Number.isFinite(idealCycleTime) || idealCycleTime <= 0) return null;
  if (!Number.isFinite(totalParts) || totalParts <= 0) return null;
  if (!Number.isFinite(goodParts) || goodParts < 0) return null;

  const availability = runtime / planned;
  const performance = (idealCycleTime * totalParts) / runtime;
  const quality = goodParts / totalParts;
  const oee = clamp01(availability) * clamp01(performance) * clamp01(quality);
  return oee * 100;
}

function machineModelUrlForStatus(status, fullScreen = false) {
  // Use generic machine.glb in fullscreen for consistent appearance
  if (fullScreen) return "/models/machine.glb";
  
  // Use status-based models in preview mode for visual status indication
  const s = String(status || "").toUpperCase();
  if (s === "DOWN") return "/models/machine-down.glb";
  if (s === "IDLE") return "/models/machine-idle.glb";
  // Default to RUNNING for unknown/other states.
  return "/models/machine-running.glb";
}

function setCursor(cursor) {
  if (typeof document === "undefined") return;
  document.body.style.cursor = cursor || "default";
}

function noRaycast() {
  // Disable pointer hit-testing for helper meshes/text.
}

// HTML-based tooltip for fixed screen-space size (doesn't scale with canvas zoom)
function MachineHoverTooltipHTML({ title, status, oeePct, accentColor, position }) {
  const safeTitle = String(title || "Machine");
  const safeStatus = String(status || "—");
  const oeeText = oeePct == null ? "—" : `${Number(oeePct).toFixed(1)}%`;
  const accent = accentColor || "#22c55e";

  if (!position) return null;

  return (
    <div
      className="pointer-events-none absolute z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -120%)', // Center horizontally, position above
      }}
    >
      <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: accent }}
          />
          <div className="text-sm font-semibold text-slate-100 truncate max-w-[180px]">
            {safeTitle}
          </div>
        </div>
        <div className="text-xs text-slate-100 mb-1">
          <span className="font-semibold">Status:</span> {safeStatus}
          <span className="mx-2">•</span>
          <span className="font-semibold">OEE:</span> {oeeText}
        </div>
        <div className="text-xs text-slate-500 italic">
          Click to open machine details
        </div>
      </div>
      {/* Tooltip arrow */}
      <div
        className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-full"
        style={{
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid rgb(15 23 42 / 0.95)',
        }}
      />
    </div>
  );
}

function normToPlane(xNorm, yNorm, planeSize) {
  const x = (clamp01(xNorm) - 0.5) * planeSize;
  const z = (0.5 - clamp01(yNorm)) * planeSize;
  return { x, z };
}

function planeToNorm(x, z, planeSize) {
  const xNorm = clamp01(x / planeSize + 0.5);
  const yNorm = clamp01(0.5 - z / planeSize);
  return { x: xNorm, y: yNorm };
}

// Distance-based visibility helper (optimized: avoid sqrt when possible)
function shouldShowLabel(cameraPos, objectPos, maxDistance = 15) {
  const dx = cameraPos.x - objectPos.x;
  const dz = cameraPos.z - objectPos.z;
  // Compare squared distances to avoid expensive sqrt
  const distanceSq = dx * dx + dz * dz;
  const maxDistanceSq = maxDistance * maxDistance;
  return distanceSq < maxDistanceSq;
}

// Frustum culling hook - only renders objects visible to camera
function useFrustumCulling(objects, camera, enabled = true) {
  return useMemo(() => {
    if (!enabled || !camera) return objects;
    
    try {
      const frustum = new Frustum();
      const matrix = new Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      frustum.setFromProjectionMatrix(matrix);
      
      return objects.filter(obj => {
        // Use bounding sphere for fast culling
        const pos = obj.position || { x: 0, y: 0, z: 0 };
        const radius = obj.radius || 0.5; // Approximate machine size
        const sphere = new THREE.Sphere(
          new Vector3(pos.x, pos.y || 0, pos.z),
          radius
        );
        return frustum.intersectsSphere(sphere);
      });
    } catch {
      return objects;
    }
  }, [objects, camera, enabled]);
}

// Limit visible labels based on camera distance - only show closest N labels
function useLimitedLabels(elements, cameraPos, maxLabels = 25, maxDistance = 15) {
  return useMemo(() => {
    if (!elements || elements.length === 0) return [];
    
    // Calculate distances and sort
    const withDistance = elements.map(el => {
      const dx = cameraPos.x - (el.pos?.x || 0);
      const dz = cameraPos.z - (el.pos?.z || 0);
      const distanceSq = dx * dx + dz * dz;
      return { el, distanceSq };
    });
    
    // Sort by distance (closest first)
    withDistance.sort((a, b) => a.distanceSq - b.distanceSq);
    
    // Return only closest N elements within max distance
    const maxDistanceSq = maxDistance * maxDistance;
    return withDistance
      .filter(item => item.distanceSq < maxDistanceSq)
      .slice(0, maxLabels)
      .map(item => item.el);
  }, [elements, cameraPos.x, cameraPos.z, maxLabels, maxDistance]);
}

// Camera position tracker for distance-based optimizations
function CameraTracker({ onCameraMove }) {
  const { camera } = useThree();
  const lastPos = useRef({ x: 0, y: 0, z: 0 });
  const rafRef = useRef(0);
  const lastUpdate = useRef(0);

  useFrame(() => {
    const pos = camera.position;
    // Only update if camera moved significantly (throttle updates)
    const dx = pos.x - lastPos.current.x;
    const dy = pos.y - lastPos.current.y;
    const dz = pos.z - lastPos.current.z;
    const moved = Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1 || Math.abs(dz) > 0.1;
    
    // Additional throttle: max 30fps for camera updates (labels don't need 60fps)
    const now = performance.now();
    const timeSinceUpdate = now - lastUpdate.current;
    if (timeSinceUpdate < 33.33) return; // 30fps
    
    if (moved && !rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        lastPos.current = { x: pos.x, y: pos.y, z: pos.z };
        lastUpdate.current = performance.now();
        onCameraMove({ x: pos.x, y: pos.y, z: pos.z });
      });
    }
  });

  return null;
}

const PlacedGLB = memo(function PlacedGLB({
  url,
  fitW = 0,
  fitD = 0,
}) {
  const { scene } = useGLTF(url);

  const measured = useMemo(() => scene.clone(true), [scene]);

  const { fitScale, yOffset } = useMemo(() => {
    try {
      const w = Number(fitW) || 0;
      const d = Number(fitD) || 0;
      const target = Math.max(0, Math.min(w, d));

      const tmp = measured.clone(true);
      tmp.position.set(0, 0, 0);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrixWorld(true);
      const box = new Box3().setFromObject(tmp);
      const size = new Vector3();
      box.getSize(size);

      const modelXZ = Math.max(Number(size.x) || 0, Number(size.z) || 0);
      const minY = Number(box.min.y);

      const hasTarget = Number.isFinite(target) && target > 0;
      const hasModelXZ = Number.isFinite(modelXZ) && modelXZ > 0.000001;
      const computedFitScale =
        hasTarget && hasModelXZ
          ? clamp((target * 0.88) / modelXZ, 0.001, 100)
          : 1;
      const computedYOffset = Number.isFinite(minY)
        ? -minY * computedFitScale
        : 0;

      return { fitScale: computedFitScale, yOffset: computedYOffset };
    } catch {
      return { fitScale: 1, yOffset: 0 };
    }
  }, [measured, fitW, fitD]);

  // No tint color - use status-specific models directly for better performance
  const cloned = useMemo(() => scene.clone(true), [scene]);

  return (
    <group position={[0, yOffset, 0]}>
      <primitive object={cloned} scale={[fitScale, fitScale, fitScale]} />
    </group>
  );
});

function CanvasPointerTracker({ enabled, floorY, onMove }) {
  const { gl, camera, raycaster, invalidate } = useThree();

  // Use object pooling for frequently created/destroyed objects
  const planeRef = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const hitRef = useMemo(() => new Vector3(), []);
  const ndcRef = useMemo(() => new Vector2(), []);
  const rafRef = useRef(0);
  const lastMoveTime = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const el = gl?.domElement;
    if (!el) return;

    const onPointerMove = (ev) => {
      if (typeof onMove !== "function") return;
      
      // Additional throttling: limit to 60fps max (16ms)
      const now = performance.now();
      const timeSinceLastMove = now - lastMoveTime.current;
      if (timeSinceLastMove < 16) return; // Skip if less than 16ms since last move
      
      // Throttle with RAF for better performance with many objects
      if (rafRef.current) return;
      
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        lastMoveTime.current = performance.now();
        
        const rect = el.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        ndcRef.set(x, y);

        raycaster.setFromCamera(ndcRef, camera);

        const yPlane =
          (Number.isFinite(Number(floorY)) ? Number(floorY) : 0) + 0.001;
        planeRef.normal.set(0, 1, 0);
        planeRef.constant = -yPlane;

        const hit = raycaster.ray.intersectPlane(planeRef, hitRef);
        if (!hit) return;
        onMove(hit.x, hit.z);
        
        // Request render update for demand frameloop
        invalidate();
      });
    };

    el.addEventListener("pointermove", onPointerMove);
    return () => {
      el.removeEventListener("pointermove", onPointerMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [
    enabled,
    gl,
    camera,
    raycaster,
    floorY,
    onMove,
    planeRef,
    hitRef,
    ndcRef,
    invalidate,
  ]);

  return null;
}

const FallbackMarker = memo(function FallbackMarker({ selected }) {
  return (
    <mesh position={[0, 0.08, 0]}>
      <boxGeometry args={[0.25, 0.16, 0.25]} />
      <meshStandardMaterial color={selected ? "#0ea5e9" : "#111827"} />
    </mesh>
  );
});

// Memoized Machine Element Component - prevents expensive re-renders
const MachineElement = memo(function MachineElement({
  el,
  effectivePlaneSize,
  machineY,
  isSelected,
  isDragging,
  machineId,
  machineName,
  machineStatus,
  url,
  fitW,
  fitD,
  uniformScale,
  markerColor,
  labelText,
  oeePct,
  hoveredMachineId,
  fullScreen,
  showLabel,
  allowEdit,
  canOpenDetails,
  onPointerDown,
  onPointerMove,
  onPointerOver,
  onPointerOut,
  onPointerEnter,
  onPointerLeave,
  onPointerMoveOverMachine,
  onClick,
  selectedObjectRef,
}) {
  const wNorm = clamp01(Number(el.w) || 0.12);
  const hNorm = clamp01(Number(el.h) || 0.12);
  const cx = clamp01((Number(el.x) || 0.5) + wNorm / 2);
  const cy = clamp01((Number(el.y) || 0.5) + hNorm / 2);
  const pos = normToPlane(cx, cy, effectivePlaneSize);

  const content = (
    <group
      ref={isSelected ? selectedObjectRef : undefined}
      position={[pos.x, machineY, pos.z]}
      renderOrder={200}
      scale={[uniformScale, uniformScale, uniformScale]}
      rotation={[
        0,
        (Number(el.rotationDeg) || 0) * (Math.PI / 180),
        0,
      ]}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => {
        onPointerMove?.(e);
        onPointerMoveOverMachine?.(e);
      }}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      <ErrorBoundary
        fallback={() => (
          <FallbackMarker selected={isSelected || isDragging} />
        )}
      >
        <Suspense
          fallback={
            <FallbackMarker selected={isSelected || isDragging} />
          }
        >
          {url ? (
            <PlacedGLB
              url={url}
              fitW={fitW}
              fitD={fitD}
            />
          ) : null}
        </Suspense>
      </ErrorBoundary>

      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[0.25, 0.16, 0.25]} />
        <meshStandardMaterial
          color={
            isSelected
              ? "#0ea5e9"
              : isDragging
                ? "#0ea5e9"
                : markerColor
          }
          transparent
          opacity={url ? 0.05 : 1}
        />
      </mesh>

      {showLabel &&
      el?.type === ELEMENT_TYPES.MACHINE &&
      labelText ? (
        <Billboard follow lockX lockZ>
          <Text
            position={[0, 0.38, 0]}
            fontSize={0.14}
            color={fullScreen ? "#ffffff" : markerColor}
            outlineWidth={0.012}
            outlineColor="#000000"
            anchorX="center"
            anchorY="middle"
            material-depthTest={false}
            material-transparent
          >
            {labelText}
          </Text>
        </Billboard>
      ) : null}

      {/* Removed 3D Billboard tooltip - now using HTML overlay for better performance and fixed sizing */}

      {isSelected && allowEdit ? (
        <mesh
          position={[0, 0.08, 0]}
          onPointerOver={(ev) => {
            ev.stopPropagation();
            setCursor("grab");
          }}
          onPointerOut={() => {
            setCursor("default");
          }}
        >
          <boxGeometry args={[0.28, 0.18, 0.28]} />
          <meshBasicMaterial color="#fdba74" wireframe />
        </mesh>
      ) : null}
    </group>
  );

  return content;
}, (prev, next) => {
  // Custom comparison - only re-render if these properties change
  return (
    prev.el === next.el &&
    prev.isSelected === next.isSelected &&
    prev.isDragging === next.isDragging &&
    prev.hoveredMachineId === next.hoveredMachineId &&
    prev.showLabel === next.showLabel &&
    prev.uniformScale === next.uniformScale &&
    prev.machineStatus === next.machineStatus &&
    prev.fullScreen === next.fullScreen
  );
});

// Floor model component: scale like zones (fit width/depth, preserve height)
const FloorModel3D = memo(function FloorModel3D({ width, depth }) {
  const w = Math.max(0.02, Number(width) || 1);
  const d = Math.max(0.02, Number(depth) || 1);
  const { scene } = useGLTF("/models/floor-model.glb");

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);

    // Calculate bounding box of the loaded model
    const box = new Box3().setFromObject(clone);
    const modelSize = new Vector3();
    box.getSize(modelSize);

    // Scale to fit the desired width and depth
    const scaleX = modelSize.x > 0 ? w / modelSize.x : 1;
    const scaleZ = modelSize.z > 0 ? d / modelSize.z : 1;
    const scaleY = 1; // Keep original Y height

    clone.scale.set(scaleX, scaleY, scaleZ);

    // Center the model at origin (floor level)
    const center = new Vector3();
    box.getCenter(center);
    clone.position.set(-center.x * scaleX, -box.min.y * scaleY, -center.z * scaleZ);

    return clone;
  }, [scene, w, d]);

  return <primitive object={clonedScene} />;
});

// Zone Model using zone-green.glb
const ZoneModel3D = memo(function ZoneModel3D({ width, depth, color }) {
  const w = Math.max(0.02, Number(width) || 1);
  const d = Math.max(0.02, Number(depth) || 1);
  const { scene } = useGLTF("/models/zone-green.glb");

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    
    // Calculate bounding box of the loaded model
    const box = new Box3().setFromObject(clone);
    const modelSize = new Vector3();
    box.getSize(modelSize);

    // Scale to fit the desired width and depth
    const scaleX = modelSize.x > 0 ? w / modelSize.x : 1;
    const scaleZ = modelSize.z > 0 ? d / modelSize.z : 1;
    const scaleY = 1; // Keep original Y height

    clone.scale.set(scaleX, scaleY, scaleZ);

    // Center the model at origin (floor level)
    const center = new Vector3();
    box.getCenter(center);
    clone.position.set(-center.x * scaleX, -box.min.y * scaleY, -center.z * scaleZ);

    return clone;
  }, [scene, w, d]);

  return <primitive object={clonedScene} />;
});

// Walkway Model using zone-green.glb temporarily (will be replaced with proper walkway model later)
const WalkwayModel3D = memo(function WalkwayModel3D({ width, depth }) {
  const w = Math.max(0.02, Number(width) || 1);
  const d = Math.max(0.02, Number(depth) || 1);
  const { scene } = useGLTF("/models/zone-green.glb");

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    
    // Calculate bounding box of the loaded model
    const box = new Box3().setFromObject(clone);
    const modelSize = new Vector3();
    box.getSize(modelSize);

    // Scale to fit the desired width and depth
    const scaleX = modelSize.x > 0 ? w / modelSize.x : 1;
    const scaleZ = modelSize.z > 0 ? d / modelSize.z : 1;
    const scaleY = 1; // Keep original Y height

    clone.scale.set(scaleX, scaleY, scaleZ);

    // Center the model at origin (floor level)
    const center = new Vector3();
    box.getCenter(center);
    clone.position.set(-center.x * scaleX, -box.min.y * scaleY, -center.z * scaleZ);

    return clone;
  }, [scene, w, d]);

  return <primitive object={clonedScene} />;
});

// Simple loading toast component
function LoadingToast({ show, message }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-8 z-50 -translate-x-1/2 rounded bg-slate-900 px-4 py-2 text-sm text-white shadow-lg animate-pulse">
      {message || "Loading 3D view..."}
    </div>
  );
}

export default function DepartmentFloor3DViewer({
  scale = 1,
  autoRotate = false,
  elements = [],
  activeTool = "select",
  selectedId = "",
  onSelectElement,
  onAddElement,
  onMoveElement,
  onUpdateElement,
  onOpenMachineDetails,
  onPointerPositionChange,
  showMachineMarkers = true,
  showMachineLabels = true,
  machineMetaById = null,
  machineStatusVisibility = null,
  planeSize = DEFAULT_PLANE_SIZE,
  fullScreen = false,
}) {
  // Preload all models at component mount for better performance
  useEffect(() => {
    const modelUrls = [
      "/models/floor-model.glb",
      "/models/zone-green.glb",
      "/models/machine.glb",
      "/models/machine-running.glb",
      "/models/machine-idle.glb",
      "/models/machine-down.glb",
      "/models/transporter.glb",
      "/models/walkway.glb",
    ];
    
    // Preload all models in parallel
    modelUrls.forEach(url => {
      try {
        useGLTF.preload(url);
      } catch (e) {
        console.warn(`Failed to preload model: ${url}`, e);
      }
    });
    
    // Also preload any custom models from elements
    if (Array.isArray(elements)) {
      const customUrls = [...new Set(
        elements
          .map(el => el?.modelUrl)
          .filter(url => url && typeof url === 'string' && url.trim())
      )];
      customUrls.forEach(url => {
        try {
          useGLTF.preload(url);
        } catch (e) {
          console.warn(`Failed to preload custom model: ${url}`, e);
        }
      });
    }
  }, [elements]);

  // Loading state for non-fullscreen canvas
  const [loading, setLoading] = useState(!fullScreen);
  const [cameraPos, setCameraPos] = useState({ x: 0, y: 10, z: 0 });
  const [hoveredTooltipPosition, setHoveredTooltipPosition] = useState(null);
  
  const containerRef = useRef(null);
  const [draggingId, setDraggingId] = useState("");
  const [hoverNorm, setHoverNorm] = useState(null);
  const [hoverNormRaw, setHoverNormRaw] = useState(null);
  const [hoveredMachineId, setHoveredMachineId] = useState("");
  const [isTransforming, setIsTransforming] = useState(false);
  const [isAddDrawing, setIsAddDrawing] = useState(false);
  const [addPreview, setAddPreview] = useState(null);
  // `planeSize` comes from auto-layout (zones/machines). `scale` is a global multiplier.
  // For the overlay-based floor, `planeSize` controls camera + world scale only.
  const effectivePlaneSize =
    Math.max(0.01, Number(planeSize) || DEFAULT_PLANE_SIZE) *
    clamp(Number(scale) || 1, 0.01, 50);

  const effectiveFloorY = 0;
  // Keep lifts in world units. Use a larger machine lift to ensure the semi-transparent
  // zone planes never visually occlude the GLBs due to depth sorting.
  // overlayLift for zones - reduced to sit closer to floor
  const overlayLift = 0.001;
  const placeableLift = 0.03;

  // DEBUG: force machines below the floor surface to validate whether we're dealing
  // with a Y-reference/sign issue vs. occlusion.
  // Flip to false once verified.
  const FORCE_MACHINES_BELOW_FLOOR = false;
  const machineY =
    effectiveFloorY + (FORCE_MACHINES_BELOW_FLOOR ? -0.12 : placeableLift);

  const orbitRef = useRef(null);
  const cameraRef = useRef(null);

  const defaultMouseButtonsRef = useRef(null);
  const panDragPointerIdRef = useRef(null);
  const lastClickRef = useRef({ t: 0, x: 0, y: 0 });
  const DOUBLE_CLICK_MS = 320;
  const DOUBLE_CLICK_PX = 6;

  const setOrbitEnabledNow = useCallback((enabled) => {
    const controls = orbitRef.current;
    if (!controls) return;
    // Allow controls in both modes; pan/rotate restrictions are handled via enablePan/enableRotate props
    const next = !!enabled;
    if ("enabled" in controls) controls.enabled = next;
    if (typeof controls.update === "function") controls.update();
  }, []);

  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;

    if (!defaultMouseButtonsRef.current) {
      // Snapshot so we can restore after temporary pan mode.
      defaultMouseButtonsRef.current = { ...controls.mouseButtons };
    }

    // three.js OrbitControls supports zoom-to-cursor in newer versions.
    // We set both flags for compatibility across versions.
    if ("zoomToCursor" in controls) controls.zoomToCursor = true;
    if ("dollyToCursor" in controls) controls.dollyToCursor = true;

    if ("enableDamping" in controls) controls.enableDamping = true;
    if ("dampingFactor" in controls) controls.dampingFactor = 0.12;

    // Make movement speeds identical in both modes
    if ("rotateSpeed" in controls) controls.rotateSpeed = 1.0;
    if ("zoomSpeed" in controls) controls.zoomSpeed = 1.0;
    if ("panSpeed" in controls) controls.panSpeed = 1.0;

    if (typeof controls.update === "function") controls.update();
  }, [fullScreen]);

  const setOrbitMouseModeNow = useCallback((mode) => {
    const controls = orbitRef.current;
    if (!controls) return;
    if (!controls.mouseButtons) return;
    controls.mouseButtons.LEFT = mode === "pan" ? MOUSE.PAN : MOUSE.ROTATE;
    if (typeof controls.update === "function") controls.update();
  }, []);

  const maybeStartPanDrag = (e) => {
    // Allow double-click+drag panning in both fullscreen and non-fullscreen modes
    const controls = orbitRef.current;
    if (!controls || !controls.enabled) return false;
    // In fullscreen, check for overlay/transform modes
    if (fullScreen && (isOverlayAddToolActive || isTransforming || isAddDrawing || draggingId))
      return false;
    // In non-fullscreen, only check for transform/add modes
    if (!fullScreen && (isTransforming || isAddDrawing || draggingId))
      return false;

    const ne = e?.nativeEvent;
    // Use event timestamps to keep React hook purity/lint happy.
    const now = Number(ne?.timeStamp) || Number(e?.timeStamp) || 0;
    const x = Number(ne?.clientX) || 0;
    const y = Number(ne?.clientY) || 0;

    const prev = lastClickRef.current;
    const dt = now - (Number(prev?.t) || 0);
    const dx = x - (Number(prev?.x) || 0);
    const dy = y - (Number(prev?.y) || 0);
    const dist = Math.hypot(dx, dy);

    // Record click for next time.
    lastClickRef.current = { t: now, x, y };

    const isDouble = dt > 0 && dt <= DOUBLE_CLICK_MS && dist <= DOUBLE_CLICK_PX;
    if (!isDouble) return false;

    panDragPointerIdRef.current = e?.pointerId ?? null;
    setOrbitMouseModeNow("pan");
    setCursor("grabbing");
    capturePointer(e);
    return true;
  };

  const stopPanDrag = (pointerId) => {
    if (panDragPointerIdRef.current == null) return;
    if (pointerId != null && panDragPointerIdRef.current !== pointerId) return;
    panDragPointerIdRef.current = null;
    setOrbitMouseModeNow("rotate");
    setCursor("default");
  };

  const draggingObjectRef = useRef(null);
  const draggingNormRef = useRef(null);
  const draggingOffsetRef = useRef(null);
  const addDragRef = useRef(null);
  const addPreviewRafRef = useRef(0);
  const hoverRafRef = useRef(0);

  useEffect(() => {
    return () => {
      if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
    };
  }, []);

  const clearAddDrag = useCallback(() => {
    addDragRef.current = null;
    setIsAddDrawing(false);
    setAddPreview(null);
    if (addPreviewRafRef.current) {
      cancelAnimationFrame(addPreviewRafRef.current);
      addPreviewRafRef.current = 0;
    }
  }, []);

  const floorPlaneRef = useRef(new Plane(new Vector3(0, 1, 0), 0));
  const floorHitRef = useRef(new Vector3());

  const previewCameraPosition = useMemo(() => {
    const size = Math.max(4, effectivePlaneSize);
    // Preview (non-fullScreen) should feel "zoomed in" by default.
    // Keep it closer than the full-screen editing view so machines/zones are readable.
    // const z = size * 0.70
    // const y = size * 0.35
    // return [0, y, z]
    const xy = size * 0.6;
    const y = size * 0.25;
    return [0, y, xy];
  }, [effectivePlaneSize]);

  const editingCameraPosition = useMemo(() => {
    const size = Math.max(4, effectivePlaneSize);
    const xy = size * 0.35;
    const y = size * 0.25;
    return [xy, y, xy];
  }, [effectivePlaneSize]);

  const cameraPosition = fullScreen
    ? editingCameraPosition
    : previewCameraPosition;

  const isAddMode =
    typeof activeTool === "string" && activeTool.startsWith("add:");
  const addType = isAddMode ? activeTool.slice("add:".length) : "";
  const addElementType =
    addType === "floor"
      ? ELEMENT_TYPES.FLOOR
      : addType === "zone"
        ? ELEMENT_TYPES.ZONE
        : addType === "machine"
          ? ELEMENT_TYPES.MACHINE
          : addType === "walkway"
            ? ELEMENT_TYPES.WALKWAY
            : addType === "transporter"
              ? ELEMENT_TYPES.TRANSPORTER
              : null;

  const normalizedElements = useMemo(() => 
    Array.isArray(elements) ? elements.filter(Boolean) : []
  , [elements]);
  
  const floorElements = useMemo(() => 
    normalizedElements.filter((e) => e?.type === ELEMENT_TYPES.FLOOR)
  , [normalizedElements]);
  
  const zoneElements = useMemo(() => 
    normalizedElements.filter((e) => e?.type === ELEMENT_TYPES.ZONE)
  , [normalizedElements]);
  
  // Walkway is rendered as a 2D overlay on the floor.
  const walkwayElements = useMemo(() => 
    normalizedElements.filter((e) => e?.type === ELEMENT_TYPES.WALKWAY)
  , [normalizedElements]);
  
  // 3D placeables (GLBs)
  const placeableElements = useMemo(() => 
    normalizedElements.filter((e) =>
      [ELEMENT_TYPES.MACHINE, ELEMENT_TYPES.TRANSPORTER].includes(e?.type)
    )
  , [normalizedElements]);

  const visiblePlaceableElements = useMemo(() => 
    placeableElements.filter((el) => {
      if (el?.type !== ELEMENT_TYPES.MACHINE) return true;
      const mid = String(el?.machineId || "");
      const status =
        machineMetaById && mid && machineMetaById[mid]?.status
          ? machineMetaById[mid].status
          : "RUNNING";
      const v =
        machineStatusVisibility && typeof machineStatusVisibility === "object"
          ? machineStatusVisibility[String(status).toUpperCase()]
          : undefined;
      return v !== false;
    })
  , [placeableElements, machineMetaById, machineStatusVisibility]);

  const addOverlayType =
    addElementType === ELEMENT_TYPES.FLOOR ||
    addElementType === ELEMENT_TYPES.ZONE ||
    addElementType === ELEMENT_TYPES.WALKWAY
      ? addElementType
      : null;

  const isOverlayAddToolActive = fullScreen && isAddMode && !!addOverlayType;

  const selectedObjectRef = useRef(null);
  // Enable controls for both fullScreen and non-fullScreen, but restrict features in non-fullScreen
  // Disable controls (pan/zoom) while adding or dragging zones/walkways
  // CRITICAL: Disable orbit controls during dragging to keep screen static
  const controlsEnabled =
    !isOverlayAddToolActive && !isTransforming && !isAddDrawing && !draggingId;

  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    const [cx, cy, cz] = cameraPosition;
    cam.position.set(cx, cy, cz);
    const targetY = effectiveFloorY;
    cam.lookAt(0, targetY, 0);
    cam.updateProjectionMatrix();

    const controls = orbitRef.current;
    if (controls && controls.target) {
      controls.target.set(0, targetY, 0);
      if (typeof controls.update === "function") controls.update();
    }
  }, [cameraPosition, effectiveFloorY]);

  const SNAP_NORM_STEP = 0.01;
  const snap01 = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    const step = Number(SNAP_NORM_STEP);
    if (!Number.isFinite(step) || step <= 0) return clamp01(n);
    return clamp01(Math.round(n / step) * step);
  };

  const shouldSnapPointer = fullScreen && (draggingId || isAddMode);
  const snapNormPoint = (p) => {
    if (!p) return p;
    if (!shouldSnapPointer) return p;
    return { x: snap01(p.x), y: snap01(p.y) };
  };

  const handleFloorMoveFromHit = useCallback((hitX, hitZ) => {
    const raw = planeToNorm(hitX, hitZ, effectivePlaneSize);
    const next = snapNormPoint(raw);

    if (typeof onPointerPositionChange === "function") {
      onPointerPositionChange(next);
    }

    if (isAddMode) {
      // Throttle hover updates to avoid React re-rendering on every pointermove
      if (!hoverRafRef.current) {
        hoverRafRef.current = requestAnimationFrame(() => {
          hoverRafRef.current = 0;
          setHoverNorm(next);
          setHoverNormRaw(raw);
        });
      }
    }

    // Click-drag adding for Zone/Walkway
    if (isAddMode && addDragRef.current) {
      addDragRef.current.current = next;

      if (!addPreviewRafRef.current) {
        addPreviewRafRef.current = requestAnimationFrame(() => {
          addPreviewRafRef.current = 0;
          const drag = addDragRef.current;
          if (!drag) return;
          const a = drag.start;
          const b = drag.current;
          const x = clamp01(Math.min(a.x, b.x));
          const y = clamp01(Math.min(a.y, b.y));
          const w = clamp01(Math.abs(a.x - b.x));
          const h = clamp01(Math.abs(a.y - b.y));
          setAddPreview({ x, y, w, h });
        });
      }
    }

    if (draggingId) {
      let targetNorm = next;
      if (draggingOffsetRef.current) {
        targetNorm = {
          x: next.x + draggingOffsetRef.current.x,
          y: next.y + draggingOffsetRef.current.y,
        };
      }

      draggingNormRef.current = targetNorm;
      
      // Update object position directly without forcing matrix recalculation
      const obj = draggingObjectRef.current;
      if (obj) {
        const pos = normToPlane(
          clamp01(targetNorm.x),
          clamp01(targetNorm.y),
          effectivePlaneSize
        );
        obj.position.x = pos.x;
        obj.position.z = pos.z;
        // Matrix will be updated automatically on next render
      }
    }
  }, [effectivePlaneSize, snapNormPoint, onPointerPositionChange, isAddMode, draggingId]);

  const getFloorHitFromEvent = (e) => {
    const ray = e?.ray;
    if (!ray) return null;

    // Plane equation: y = effectiveFloorY + epsilon.
    // three.Plane uses: normal.dot(point) + constant = 0
    const y =
      (Number.isFinite(Number(effectiveFloorY)) ? Number(effectiveFloorY) : 0) +
      0.001;
    const p = floorPlaneRef.current;
    p.normal.set(0, 1, 0);
    p.constant = -y;

    const hit = ray.intersectPlane(p, floorHitRef.current);
    if (!hit) return null;
    return { x: hit.x, z: hit.z };
  };

  const capturePointer = (e) => {
    const t = e?.nativeEvent?.target;
    const pid = e?.pointerId;
    if (!t || pid == null) return;
    if (typeof t.setPointerCapture !== "function") return;
    try {
      t.setPointerCapture(pid);
    } catch {
      // ignore
    }
  };

  const handleAddPointerDown = (e) => {
    if (!fullScreen) return;
    if (!isAddMode) return;
    if (!addElementType) return;
    if (typeof onAddElement !== "function") return;

    // In R3F, a single click can intersect multiple overlapping objects (floor overlay,
    // zone/walkway planes, models). When those handlers all forward to this function,
    // it can place multiple copies for one user click. Stop propagation so only the
    // closest hit handles the add.
    if (typeof e?.stopPropagation === "function") e.stopPropagation();

    const hit = getFloorHitFromEvent(e);
    if (!hit) return;
    const next = planeToNorm(hit.x, hit.z, effectivePlaneSize);

    // For zones/walkways: start click-drag sizing.
    if (addOverlayType) {
      capturePointer(e);
      // Disable camera immediately so click+drag draws without moving the scene.
      setOrbitEnabledNow(false);
      addDragRef.current = { type: addOverlayType, start: next, current: next };
      setIsAddDrawing(true);
      setAddPreview({ x: next.x, y: next.y, w: 0, h: 0 });
      return;
    }

    // For models: click-to-place.
    onAddElement(addElementType, next);
  };

  const handleFloorPointerMove = (e) => {
    if (!fullScreen) return;

    const hit = getFloorHitFromEvent(e);
    if (!hit) return;
    handleFloorMoveFromHit(hit.x, hit.z);
  };

  const stopDragging = () => {
    if (!draggingId) return;
    if (typeof onMoveElement === "function" && draggingNormRef.current) {
      const dragged = normalizedElements.find(
        (e) => String(e?.id) === String(draggingId),
      );
      const nextCenter = draggingNormRef.current;

      const wNorm = clamp01(Number(dragged?.w) || 0.12);
      const hNorm = clamp01(Number(dragged?.h) || 0.12);
      
      // Use the actual dragged center position directly
      // Calculate top-left from the final center position where cursor released
      const centerX = clamp01(Number(nextCenter?.x) || 0);
      const centerY = clamp01(Number(nextCenter?.y) || 0);
      
      // Convert center to top-left, ensuring we stay within bounds
      let newX = centerX - wNorm / 2;
      let newY = centerY - hNorm / 2;
      
      // Clamp to ensure the entire element stays within [0,1]
      newX = Math.max(0, Math.min(1 - wNorm, newX));
      newY = Math.max(0, Math.min(1 - hNorm, newY));
      
      const patch = {
        x: newX,
        y: newY,
      };

      onMoveElement(String(draggingId), patch);
    }
    draggingObjectRef.current = null;
    draggingNormRef.current = null;
    draggingOffsetRef.current = null;
    setDraggingId("");
    setCursor("default");
    // Re-enable camera only if current mode allows it.
    // (When adding Zone/Walkway, OrbitControls should remain disabled.)
    setOrbitEnabledNow(
      !isOverlayAddToolActive && !isTransforming && !isAddDrawing,
    );
  };

  // Show loading toast only for non-fullscreen
  useEffect(() => {
    if (fullScreen) {
      setLoading(false);
      return;
    }
    setLoading(true);
  }, [fullScreen]);

  // Hide loading toast when Canvas is ready
  const handleCanvasCreated = useCallback(({ camera }) => {
    cameraRef.current = camera;
    const [cx, cy, cz] = cameraPosition;
    camera.position.set(cx, cy, cz);
    camera.lookAt(0, effectiveFloorY, 0);
    setCameraPos({ x: cx, y: cy, z: cz });
    // Delay to ensure smooth transition
    setTimeout(() => setLoading(false), 400);
  }, [cameraPosition, effectiveFloorY]);

  // In preview mode, prevent the page from scrolling while the user zooms the canvas.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e) => {
      // Prevent page scroll for both modes when wheel is over the canvas
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fullScreen]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border bg-slate-950"
      style={
        fullScreen
          ? { height: "100%", flex: 1, minHeight: 0, overflow: "hidden" }
          : {
              height: "calc(100vh - 200px)",
              minHeight: "600px",
              overflow: "hidden",
            }
      }
    >
      {/* Loading toast for non-fullscreen */}
      <LoadingToast show={!fullScreen && loading} message="Loading 3D view..." />
      
      {/* HTML tooltip overlay - only render for hovered machine */}
      {!fullScreen && hoveredMachineId && hoveredTooltipPosition && (() => {
        const machineData = visiblePlaceableElements.find(
          el => el?.type === ELEMENT_TYPES.MACHINE && String(el?.machineId || "") === hoveredMachineId
        );
        if (!machineData) return null;
        
        const machineMeta = machineMetaById?.[hoveredMachineId];
        const machineName = machineMeta?.name || machineData?.label || hoveredMachineId;
        const machineStatus = machineMeta?.status || "RUNNING";
        const markerColor = statusColor(machineStatus);
        const oeePct = computeMachineOeePct(machineMeta);
        
        return (
          <MachineHoverTooltipHTML
            title={machineName}
            status={machineStatus}
            oeePct={oeePct}
            accentColor={markerColor}
            position={hoveredTooltipPosition}
          />
        );
      })()}
      
      <ErrorBoundary
        fallback={() => (
          <div className="flex h-full w-full items-center justify-center p-4">
            <div className="max-w-xl rounded-xl border bg-white p-4 text-sm text-slate-700 shadow">
              <div className="font-semibold">3D view failed to render</div>
              <div className="mt-1 text-xs text-slate-500">
                This usually happens when a referenced GLB file is
                missing/invalid or WebGL is unavailable.
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Check that your models are under{" "}
                <span className="font-mono">public/models</span> and accessible
                as
                <span className="font-mono">/models/*.glb</span>.
              </div>
            </div>
          </div>
        )}
      >
        <Canvas
          camera={{ position: cameraPosition, fov: fullScreen ? 45 : 34 }}
          // Optimized DPR for 100+ machines - lower pixel density = better performance
          dpr={[0.4, 0.8]}
          gl={{ 
            antialias: false, // Disabled for performance - use FXAA post-processing if needed
            powerPreference: "high-performance", // Force dedicated GPU
            stencil: false, // Not needed, saves memory
            depth: true,
            alpha: false, // Opaque canvas = better performance
            premultipliedAlpha: false, // Faster blending
            preserveDrawingBuffer: false, // Don't preserve = faster
            failIfMajorPerformanceCaveat: false, // Try even on slow GPUs
            // Performance: low precision shaders, no logarithmic depth
            logarithmicDepthBuffer: false,
            precision: "lowp", // Low precision = faster shaders
          }}
          // Demand rendering: only updates when invalidate() is called
          frameloop="demand"
          onCreated={handleCanvasCreated}
        >
          <CameraTracker onCameraMove={setCameraPos} />
          <CanvasPointerTracker
            enabled={draggingId || isAddMode}
            floorY={effectiveFloorY}
            onMove={(x, z) => handleFloorMoveFromHit(x, z)}
          />
          <color attach="background" args={["#0b1020"]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} />

          {fullScreen ? (
            <>
              <gridHelper
                args={[effectivePlaneSize * 2.5, 40, "#334155", "#1f2937"]}
                position={[0, 0.001, 0]}
              />
              <axesHelper args={[1.5]} />
            </>
          ) : null}

          {/* 3D floor model (replacing 2D overlay). If no explicit FLOOR element exists, render a default floor covering the whole plane. */}
          {(() => {
            const list = floorElements.length
              ? floorElements
              : [
                  {
                    id: "__default_floor__",
                    x: 0.05,
                    y: 0.05,
                    w: 0.9,
                    h: 0.9,
                    rotationDeg: 0,
                  },
                ];

            return list.map((el) => {
              const id = String(el.id);
              const isSelected = selectedId && String(selectedId) === id;
              const wNorm = clamp01(Number(el.w) || 0.9);
              const hNorm = clamp01(Number(el.h) || 0.9);
              const cx = clamp01((Number(el.x) || 0.05) + wNorm / 2);
              const cy = clamp01((Number(el.y) || 0.05) + hNorm / 2);
              const pos = normToPlane(cx, cy, effectivePlaneSize);
              const w = Math.max(0.02, wNorm) * effectivePlaneSize;
              const d = Math.max(0.02, hNorm) * effectivePlaneSize;
              const rot = (Number(el.rotationDeg) || 0) * (Math.PI / 180);

              // Disable all editing interactions in non-fullScreen
              const allowEdit = fullScreen;

              return (
                <group
                  key={id}
                  position={[pos.x, effectiveFloorY, pos.z]}
                  rotation={[0, rot, 0]}
                  onPointerDown={
                    allowEdit
                      ? (e) => {
                          if (isAddMode) {
                            handleAddPointerDown(e);
                            return;
                          }
                          if (id === "__default_floor__") return;
                          e.stopPropagation();
                          e.nativeEvent?.preventDefault?.();
                          if (typeof onSelectElement === "function")
                            onSelectElement(id);

                          if (activeTool === "select" && !isTransforming) {
                            setOrbitEnabledNow(false);
                            capturePointer(e);
                          }

                          if (isTransforming) return;

                          if (
                            typeof onMoveElement === "function" &&
                            activeTool === "select"
                          ) {
                            draggingObjectRef.current = e.currentTarget;
                            draggingNormRef.current = null;
                            if (typeof getFloorHitFromEvent === "function") {
                              const hit = getFloorHitFromEvent(e);
                              if (hit) {
                                const pointerNorm = planeToNorm(
                                  hit.x,
                                  hit.z,
                                  effectivePlaneSize,
                                );
                                // Store precise offset from cursor to center
                                draggingOffsetRef.current = {
                                  x: cx - pointerNorm.x,
                                  y: cy - pointerNorm.y,
                                };
                              } else {
                                draggingOffsetRef.current = null;
                              }
                            } else {
                              draggingOffsetRef.current = null;
                            }
                            setDraggingId(id);
                            setCursor("grabbing");
                            setOrbitEnabledNow(false);
                            capturePointer(e);
                          }
                        }
                      : undefined
                  }
                  onPointerMove={
                    allowEdit
                      ? (e) => {
                          handleFloorPointerMove(e);
                        }
                      : undefined
                  }
                  onPointerUp={
                    allowEdit
                      ? () => {
                          stopDragging();
                          setCursor("default");
                          setOrbitEnabledNow(
                            !isOverlayAddToolActive &&
                              !isTransforming &&
                              !isAddDrawing &&
                              !draggingId,
                          );
                        }
                      : undefined
                  }
                >
                  {/* Load 3D floor model and scale only X and Z axes (preserve Y height) */}
                  <Suspense fallback={null}>
                    <FloorModel3D width={w} depth={d} />
                  </Suspense>
                  
                  {id !== "__default_floor__" ? (
                    <mesh
                      rotation={[-Math.PI / 2, 0, 0]}
                      position={[0, 0.01, 0]}
                      renderOrder={5}
                      onPointerOver={
                        allowEdit
                          ? (e) => {
                              e.stopPropagation();
                              setCursor(
                                activeTool === "select" && !isAddMode
                                  ? "grab"
                                  : "pointer",
                              );
                            }
                          : undefined
                      }
                      onPointerOut={
                        allowEdit
                          ? () => {
                              setCursor("default");
                            }
                          : undefined
                      }
                    >
                      <planeGeometry args={[w, d]} />
                      <meshBasicMaterial
                        transparent
                        opacity={0}
                        depthWrite={false}
                        depthTest={false}
                      />
                      <Edges color={isSelected ? "#fdba74" : "#94a3b8"} />
                    </mesh>
                  ) : null}
                </group>
              );
            });
          })()}

          {/* 2D overlays: zones + walkways */}
          {zoneElements.map((el) => {
            const id = String(el.id);
            const isSelected = selectedId && String(selectedId) === id;
            const wNorm = clamp01(Number(el.w) || 0.15);
            const hNorm = clamp01(Number(el.h) || 0.12);
            const cx = clamp01((Number(el.x) || 0) + wNorm / 2);
            const cy = clamp01((Number(el.y) || 0) + hNorm / 2);
            const pos = normToPlane(cx, cy, effectivePlaneSize);
            const w = Math.max(0.02, wNorm) * effectivePlaneSize;
            const d = Math.max(0.02, hNorm) * effectivePlaneSize;
            const fill = zoneFillColor(el.color);
            const rot = (Number(el.rotationDeg) || 0) * (Math.PI / 180);
            const zoneName = String(el.label || "").trim() || "Zone";
            const zoneLabelY = 0.85;
            const zoneHeight = 0.03; // Zones placed slightly above floor

            // Disable all editing interactions in non-fullScreen
            const allowEdit = fullScreen;
            return (
              <group
                key={id}
                position={[pos.x, effectiveFloorY + zoneHeight, pos.z]}
                rotation={[0, rot, 0]}
                onPointerDown={
                  allowEdit
                    ? (e) => {
                        if (isAddMode) {
                          handleAddPointerDown(e);
                          return;
                        }
                        e.stopPropagation();
                        e.nativeEvent?.preventDefault?.();
                        
                        if (isTransforming) return;
                        
                        if (typeof onSelectElement === "function")
                          onSelectElement(id);

                        if (activeTool === "select") {
                          setOrbitEnabledNow(false);
                          capturePointer(e);
                        }

                        if (
                          typeof onMoveElement === "function" &&
                          activeTool === "select"
                        ) {
                          draggingObjectRef.current = e.currentTarget;
                          draggingNormRef.current = null;
                          if (typeof getFloorHitFromEvent === "function") {
                            const hit = getFloorHitFromEvent(e);
                            if (hit) {
                              const pointerNorm = planeToNorm(
                                hit.x,
                                hit.z,
                                effectivePlaneSize,
                              );
                              draggingOffsetRef.current = {
                                x: clamp01(cx) - pointerNorm.x,
                                y: clamp01(cy) - pointerNorm.y,
                              };
                            } else {
                              draggingOffsetRef.current = null;
                            }
                          } else {
                            draggingOffsetRef.current = null;
                          }
                          setDraggingId(id);
                          setCursor("grabbing");
                          setOrbitEnabledNow(false);
                        }

                        // Don't initiate drag immediately - wait for actual pointer movement
                      }
                    : undefined
                }
                onPointerMove={
                  allowEdit
                    ? (e) => {
                        e.stopPropagation();
                        handleFloorPointerMove(e);
                        
                        // Dragging is initiated on pointer down to prevent camera movement
                      }
                    : undefined
                }
                onPointerUp={
                  allowEdit
                    ? () => {
                        stopDragging();
                        setCursor("default");
                        setOrbitEnabledNow(
                          !isOverlayAddToolActive &&
                            !isTransforming &&
                            !isAddDrawing &&
                            !draggingId,
                        );
                      }
                    : undefined
                }
                onPointerOver={
                  allowEdit
                    ? (e) => {
                        if (isAddMode) return;
                        e.stopPropagation();
                        setCursor(
                          activeTool === "select" && !isAddMode
                            ? "grab"
                            : "pointer",
                        );
                      }
                    : undefined
                }
                onPointerOut={
                  allowEdit
                    ? () => {
                        setCursor("default");
                      }
                    : undefined
                }
              >
                {/* 3D Zone model - placed below floor level */}
                <Suspense fallback={null}>
                  <ZoneModel3D width={w} depth={d} color={fill} />
                </Suspense>

                {/* Invisible interaction plane for pointer events */}
                <mesh
                  rotation={[-Math.PI / 2, 0, 0]}
                  position={[0, 0.02, 0]}
                  renderOrder={110}
                >
                  <planeGeometry args={[w, d]} />
                  <meshBasicMaterial
                    transparent
                    opacity={0}
                    depthWrite={false}
                  />
                  {isSelected ? (
                    <Edges color="#fdba74" />
                  ) : (
                    <Edges color="#ffffff" />
                  )}
                </mesh>

                {/* Zone name centered and always above machine labels */}
                <Billboard follow lockX lockZ>
                  <Text
                    position={[0, zoneLabelY, 0]}
                    fontSize={0.22}
                    color="#ffffff"
                    outlineWidth={0.02}
                    outlineColor="#000000"
                    anchorX="center"
                    anchorY="middle"
                    renderOrder={100}
                    material-depthTest={false}
                    material-transparent
                  >
                    {zoneName}
                  </Text>
                </Billboard>
              </group>
            );
          })}

          {walkwayElements.map((el) => {
            const id = String(el.id);
            const isSelected = selectedId && String(selectedId) === id;
            const wNorm = clamp01(Number(el.w) || 0.2);
            const hNorm = clamp01(Number(el.h) || 0.06);
            const cx = clamp01((Number(el.x) || 0) + wNorm / 2);
            const cy = clamp01((Number(el.y) || 0) + hNorm / 2);
            const pos = normToPlane(cx, cy, effectivePlaneSize);
            const w = Math.max(0.02, wNorm) * effectivePlaneSize;
            const d = Math.max(0.02, hNorm) * effectivePlaneSize;
            const rot = (Number(el.rotationDeg) || 0) * (Math.PI / 180);

            // Disable all editing interactions in non-fullScreen
            const allowEdit = fullScreen;
            return (
              <group
                key={id}
                position={[pos.x, effectiveFloorY + overlayLift, pos.z]}
                rotation={[0, rot, 0]}
                onPointerDown={
                  allowEdit
                    ? (e) => {
                        if (isAddMode) {
                          handleAddPointerDown(e);
                          return;
                        }
                        e.stopPropagation();
                        if (typeof onSelectElement === "function")
                          onSelectElement(id);

                        if (isTransforming) return;

                        if (
                          typeof onMoveElement === "function" &&
                          activeTool === "select"
                        ) {
                          draggingObjectRef.current =
                            e.eventObject?.parent || null;
                          draggingNormRef.current = null;
                          if (typeof getFloorHitFromEvent === "function") {
                            const hit = getFloorHitFromEvent(e);
                            if (hit) {
                              const pointerNorm = planeToNorm(
                                hit.x,
                                hit.z,
                                effectivePlaneSize,
                              );
                              // Store precise offset from cursor to center
                              draggingOffsetRef.current = {
                                x: cx - pointerNorm.x,
                                y: cy - pointerNorm.y,
                              };
                            } else {
                              draggingOffsetRef.current = null;
                            }
                          } else {
                            draggingOffsetRef.current = null;
                          }
                          setDraggingId(id);
                          setCursor("grabbing");
                          setOrbitEnabledNow(false);
                          capturePointer(e);
                        }
                      }
                    : undefined
                }
                onPointerMove={
                  allowEdit
                    ? (e) => {
                        handleFloorPointerMove(e);
                      }
                    : undefined
                }
              >
                {/* Load 3D walkway model (temporarily using zone-green.glb) */}
                <Suspense fallback={null}>
                  <WalkwayModel3D width={w} depth={d} />
                </Suspense>

                <mesh
                  rotation={[-Math.PI / 2, 0, 0]}
                  position={[0, 0.01, 0]}
                  renderOrder={10}
                  onPointerOver={
                    allowEdit
                      ? (e) => {
                          e.stopPropagation();
                          setCursor(
                            activeTool === "select" && !isAddMode
                              ? "grab"
                              : "pointer",
                          );
                        }
                      : undefined
                  }
                  onPointerOut={
                    allowEdit
                      ? () => {
                          setCursor("default");
                        }
                      : undefined
                  }
                >
                  <planeGeometry args={[w, d]} />
                  <meshBasicMaterial
                    transparent
                    opacity={0}
                    depthWrite={false}
                    depthTest={false}
                  />
                  <Edges color={isSelected ? "#fdba74" : "#ffffff"} />
                </mesh>
              </group>
            );
          })}

          {/* Add-mode click-drag preview for Zone/Walkway */}
          {fullScreen &&
          isAddMode &&
          isAddDrawing &&
          addPreview &&
          addOverlayType
            ? (() => {
                const wNorm = clamp01(Number(addPreview.w) || 0);
                const hNorm = clamp01(Number(addPreview.h) || 0);
                const x = clamp01(Number(addPreview.x) || 0);
                const y = clamp01(Number(addPreview.y) || 0);
                const cx = clamp01(x + wNorm / 2);
                const cy = clamp01(y + hNorm / 2);
                const pos = normToPlane(cx, cy, effectivePlaneSize);
                const w = Math.max(0.02, wNorm) * effectivePlaneSize;
                const d = Math.max(0.02, hNorm) * effectivePlaneSize;
                const color =
                  addOverlayType === ELEMENT_TYPES.FLOOR
                    ? "#ffffff"
                    : addOverlayType === ELEMENT_TYPES.ZONE
                      ? "#14532d"
                      : "#000000";
                const opacity =
                  addOverlayType === ELEMENT_TYPES.FLOOR
                    ? 0.6
                    : addOverlayType === ELEMENT_TYPES.ZONE
                      ? 0.25
                      : 0.65;

                return (
                  <group
                    position={[pos.x, effectiveFloorY + overlayLift, pos.z]}
                  >
                    <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
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
                    <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
                      <planeGeometry args={[w, d]} />
                      <meshBasicMaterial
                        transparent
                        opacity={0}
                        depthWrite={false}
                        depthTest={false}
                      />
                      <Edges color="#fdba74" />
                    </mesh>
                  </group>
                );
              })()
            : null}

          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, effectiveFloorY + 0.001, 0]}
            onPointerMove={(e) => {
              handleFloorPointerMove(e);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();

              // Double-click + drag pans the camera (works in both fullscreen and non-fullscreen)
              // Note: we only start it when the user clicks on the floor (not on objects).
              if (!isAddMode) {
                maybeStartPanDrag(e);
              }

              if (!fullScreen) return;

              if (!isAddMode) {
                if (typeof onSelectElement === "function") onSelectElement("");
                setDraggingId("");
                setCursor("default");
                return;
              }

              handleAddPointerDown(e);
            }}
            onPointerUp={() => {
              stopPanDrag();
              stopDragging();
              setCursor("default");
              setOrbitEnabledNow(
                !isOverlayAddToolActive && !isTransforming && !isAddDrawing,
              );

              if (!fullScreen) return;
              if (!isAddMode) return;
              if (!addDragRef.current) return;
              if (typeof onAddElement !== "function") {
                clearAddDrag();
                return;
              }

              const drag = addDragRef.current;
              const a = drag.start;
              const b = drag.current;
              const x = clamp01(Math.min(a.x, b.x));
              const y = clamp01(Math.min(a.y, b.y));
              const w = clamp01(Math.abs(a.x - b.x));
              const h = clamp01(Math.abs(a.y - b.y));

              // Allow rectangles (not forced square) and let walkways be thinner.
              const minW = drag.type === ELEMENT_TYPES.WALKWAY ? 0.01 : 0.02;
              const minH = drag.type === ELEMENT_TYPES.WALKWAY ? 0.006 : 0.02;
              const finalW = Math.max(minW, w);
              const finalH = Math.max(minH, h);

              const payload = {
                x,
                y,
                w: finalW,
                h: finalH,
                rotationDeg: 0,
                ...(drag.type === ELEMENT_TYPES.ZONE
                  ? { color: "dark-green" }
                  : drag.type === ELEMENT_TYPES.WALKWAY
                    ? { color: "black" }
                    : null),
              };

              onAddElement(drag.type, payload);
              clearAddDrag();
            }}
            onPointerLeave={() => {
              stopPanDrag();
              stopDragging();
              clearAddDrag();
              setCursor("default");
              setOrbitEnabledNow(
                !isOverlayAddToolActive && !isTransforming && !isAddDrawing,
              );
            }}
          >
            <planeGeometry args={[effectivePlaneSize, effectivePlaneSize]} />
            <meshStandardMaterial
              transparent
              opacity={0}
              depthWrite={false}
              depthTest={false}
            />
          </mesh>

          {showMachineMarkers
            ? (() => {
                // Prepare machine data with positions for efficient label limiting
                const machinesWithPositions = useMemo(() => {
                  return visiblePlaceableElements.map((el) => {
                    const wNorm = clamp01(Number(el.w) || 0.12);
                    const hNorm = clamp01(Number(el.h) || 0.12);
                    const cx = clamp01((Number(el.x) || 0.5) + wNorm / 2);
                    const cy = clamp01((Number(el.y) || 0.5) + hNorm / 2);
                    const pos = normToPlane(cx, cy, effectivePlaneSize);
                    return { el, pos, id: String(el.id) };
                  });
                }, [visiblePlaceableElements, effectivePlaneSize]);

                // Limit labels to closest 25 machines for performance
                const machinesWithLabels = useLimitedLabels(
                  machinesWithPositions,
                  cameraPos,
                  25,
                  effectivePlaneSize * 1.5
                );
                const labelIds = useMemo(
                  () => new Set(machinesWithLabels.map(m => m.id)),
                  [machinesWithLabels]
                );

                // Memoized event handler factories
                const createPointerDownHandler = useCallback((el, isSelected, machineId, canOpenDetails, allowEdit) => (e) => {
                  if (allowEdit) {
                    if (isAddMode) {
                      handleAddPointerDown(e);
                      return;
                    }
                    e.stopPropagation();
                    if (isTransforming) return;
                    if (typeof onSelectElement === "function")
                      onSelectElement(String(el.id));
                  } else if (canOpenDetails) {
                    e.stopPropagation();
                    onOpenMachineDetails(machineId);
                  }
                }, [isAddMode, isTransforming, onSelectElement, onOpenMachineDetails]);

                const createPointerMoveHandler = useCallback((el, isSelected, allowEdit) => (e) => {
                  if (!allowEdit) return;
                  handleFloorPointerMove(e);
                  
                  if (
                    !draggingId &&
                    !isTransforming &&
                    !isAddMode &&
                    selectedId &&
                    String(selectedId) === String(el.id) &&
                    e.buttons === 1 &&
                    typeof onMoveElement === "function" &&
                    activeTool === "select"
                  ) {
                    draggingObjectRef.current = e.eventObject;
                    draggingNormRef.current = null;
                    if (typeof getFloorHitFromEvent === "function") {
                      const hit = getFloorHitFromEvent(e);
                      if (hit) {
                        const pointerNorm = planeToNorm(
                          hit.x,
                          hit.z,
                          effectivePlaneSize,
                        );
                        const wNorm = clamp01(Number(el.w) || 0.12);
                        const hNorm = clamp01(Number(el.h) || 0.12);
                        const elX = clamp01(Number(el.x) || 0);
                        const elY = clamp01(Number(el.y) || 0);
                        const center = {
                          x: elX + wNorm / 2,
                          y: elY + hNorm / 2,
                        };
                        draggingOffsetRef.current = {
                          x: center.x - pointerNorm.x,
                          y: center.y - pointerNorm.y,
                        };
                      } else {
                        draggingOffsetRef.current = null;
                      }
                    } else {
                      draggingOffsetRef.current = null;
                    }
                    setDraggingId(String(el.id));
                    setCursor("grabbing");
                    setOrbitEnabledNow(false);
                    capturePointer(e);
                  }
                }, [
                  draggingId,
                  isTransforming,
                  isAddMode,
                  selectedId,
                  onMoveElement,
                  activeTool,
                  effectivePlaneSize,
                  getFloorHitFromEvent,
                  setOrbitEnabledNow,
                ]);

                const createPointerOverHandler = useCallback((allowEdit) => (e) => {
                  if (!allowEdit) return;
                  if (isAddMode) return;
                  e.stopPropagation();
                  setCursor(
                    activeTool === "select" && !isAddMode
                      ? "grab"
                      : "pointer",
                  );
                }, [isAddMode, activeTool]);

                const createPointerOutHandler = useCallback((allowEdit) => () => {
                  if (!allowEdit) return;
                  setCursor("default");
                }, []);

                const createPointerEnterHandler = useCallback((machineId, canOpenDetails) => (e) => {
                  if (!canOpenDetails) return;
                  e.stopPropagation();
                  setHoveredMachineId((prev) => prev === machineId ? prev : machineId);
                  
                  // Calculate screen position for HTML tooltip
                  const canvas = e?.nativeEvent?.target;
                  if (canvas && e.nativeEvent) {
                    const rect = canvas.getBoundingClientRect();
                    const x = e.nativeEvent.clientX - rect.left;
                    const y = e.nativeEvent.clientY - rect.top;
                    setHoveredTooltipPosition({ x, y });
                  }
                  setCursor("pointer");
                }, []);

                const createPointerMoveOverMachineHandler = useCallback((machineId, canOpenDetails) => (e) => {
                  if (!canOpenDetails) return;
                  // Update tooltip position as mouse moves over machine
                  if (hoveredMachineId === machineId) {
                    const canvas = e?.nativeEvent?.target;
                    if (canvas && e.nativeEvent) {
                      const rect = canvas.getBoundingClientRect();
                      const x = e.nativeEvent.clientX - rect.left;
                      const y = e.nativeEvent.clientY - rect.top;
                      setHoveredTooltipPosition({ x, y });
                    }
                  }
                }, [hoveredMachineId]);

                const createPointerLeaveHandler = useCallback((machineId, canOpenDetails) => () => {
                  if (!canOpenDetails) return;
                  setHoveredMachineId((prev) => prev === machineId ? "" : prev);
                  setHoveredTooltipPosition(null);
                  setCursor("default");
                }, []);

                const createClickHandler = useCallback((machineId, canOpenDetails) => (e) => {
                  if (!canOpenDetails) return;
                  e.stopPropagation();
                  onOpenMachineDetails(machineId);
                }, [onOpenMachineDetails]);

                return machinesWithPositions.map(({ el, pos }) => {
                  const wNorm = clamp01(Number(el.w) || 0.12);
                  const hNorm = clamp01(Number(el.h) || 0.12);
                  const fitW = Math.max(0.02, wNorm) * effectivePlaneSize;
                  const fitD = Math.max(0.02, hNorm) * effectivePlaneSize;
                  const isSelected =
                    selectedId && String(selectedId) === String(el.id);
                  const isDragging =
                    draggingId && String(draggingId) === String(el.id);

                  const machineId =
                    el?.type === ELEMENT_TYPES.MACHINE
                      ? String(el?.machineId || "")
                      : "";
                  const machineMeta =
                    machineId && machineMetaById
                      ? machineMetaById[machineId]
                      : null;
                  const machineName = machineMeta?.name || el?.label || machineId;
                  const machineStatus = machineMeta?.status || "RUNNING";

                  const rawModelUrl =
                    typeof el?.modelUrl === "string" ? el.modelUrl.trim() : "";
                  const isDefaultMachineUrl =
                    rawModelUrl === "" ||
                    rawModelUrl === DEFAULT_MODEL_URLS[ELEMENT_TYPES.MACHINE] ||
                    rawModelUrl === "/models/machine.glb";

                  const url =
                    el?.type === ELEMENT_TYPES.MACHINE
                      ? isDefaultMachineUrl
                        ? machineModelUrlForStatus(machineStatus, fullScreen)
                        : rawModelUrl
                      : rawModelUrl || DEFAULT_MODEL_URLS[el.type] || "";
                  const uniformScale = clamp(Number(el.scale) || 1, 0.01, 50);
                  const markerColor =
                    el?.type === ELEMENT_TYPES.MACHINE
                      ? statusColor(machineStatus)
                      : "#111827";
                  const labelText =
                    el?.type === ELEMENT_TYPES.MACHINE
                      ? abbreviateMachineName(machineName)
                      : "";
                  const oeePct =
                    el?.type === ELEMENT_TYPES.MACHINE
                      ? computeMachineOeePct(machineMeta)
                      : null;

                  const allowEdit = fullScreen;
                  const canOpenDetails =
                    !fullScreen &&
                    el?.type === ELEMENT_TYPES.MACHINE &&
                    !!machineId &&
                    typeof onOpenMachineDetails === "function";

                  // Only show label if this machine is in the limited label set
                  const showLabel = showMachineLabels && labelIds.has(String(el.id));

                  const machineElement = (
                    <MachineElement
                      key={String(el.id)}
                      el={el}
                      effectivePlaneSize={effectivePlaneSize}
                      machineY={machineY}
                      isSelected={isSelected}
                      isDragging={isDragging}
                      machineId={machineId}
                      machineName={machineName}
                      machineStatus={machineStatus}
                      url={url}
                      fitW={fitW}
                      fitD={fitD}
                      uniformScale={uniformScale}
                      markerColor={markerColor}
                      labelText={labelText}
                      oeePct={oeePct}
                      hoveredMachineId={hoveredMachineId}
                      fullScreen={fullScreen}
                      showLabel={showLabel}
                      allowEdit={allowEdit}
                      canOpenDetails={canOpenDetails}
                      onPointerDown={createPointerDownHandler(el, isSelected, machineId, canOpenDetails, allowEdit)}
                      onPointerMove={createPointerMoveHandler(el, isSelected, allowEdit)}
                      onPointerOver={createPointerOverHandler(allowEdit)}
                      onPointerOut={createPointerOutHandler(allowEdit)}
                      onPointerEnter={createPointerEnterHandler(machineId, canOpenDetails)}
                      onPointerLeave={createPointerLeaveHandler(machineId, canOpenDetails)}
                      onPointerMoveOverMachine={createPointerMoveOverMachineHandler(machineId, canOpenDetails)}
                      onClick={createClickHandler(machineId, canOpenDetails)}
                      selectedObjectRef={selectedObjectRef}
                    />
                  );

                  return isSelected && allowEdit ? (
                    <TransformControls
                      key={String(el.id)}
                      mode="scale"
                      enabled={typeof onUpdateElement === "function"}
                      onMouseDown={() => setIsTransforming(true)}
                      onMouseUp={() => setIsTransforming(false)}
                      onObjectChange={() => {
                        if (typeof onUpdateElement !== "function") return;
                        const obj = selectedObjectRef.current;
                        if (!obj) return;

                        const s = clamp(Number(obj.scale?.x) || 1, 0.01, 50);
                        obj.scale.setScalar(s);
                        onUpdateElement(String(el.id), { scale: s });
                      }}
                    >
                      <group>{machineElement}</group>
                    </TransformControls>
                  ) : (
                    machineElement
                  );
                });
              })()
            : null}

          {showMachineMarkers && isAddMode && (hoverNormRaw || hoverNorm) && addElementType
            ? (() => {
                const previewNorm = hoverNormRaw || hoverNorm;
                const pos = normToPlane(
                  previewNorm.x,
                  previewNorm.y,
                  effectivePlaneSize,
                );
                return (
                  <mesh position={[pos.x, effectiveFloorY + 0.08, pos.z]}>
                    <boxGeometry args={[0.25, 0.16, 0.25]} />
                    <meshStandardMaterial
                      color="#0ea5e9"
                      transparent
                      opacity={0.35}
                    />
                  </mesh>
                );
              })()
            : null}

          <OrbitControls
            ref={orbitRef}
            enablePan={fullScreen}
            enableZoom={true}
            // Allow rotation in both modes for smooth camera control
            enableRotate={true}
            // Keep preview zoom range tighter so it looks like the desired default.
            minDistance={
              fullScreen ? effectivePlaneSize * 0.25 : effectivePlaneSize * 0.18
            }
            maxDistance={
              fullScreen ? effectivePlaneSize * 3.0 : effectivePlaneSize * 1.25
            }
            mouseButtons={{
              LEFT: MOUSE.ROTATE,
              MIDDLE: MOUSE.DOLLY,
              RIGHT: fullScreen ? MOUSE.PAN : MOUSE.ROTATE,
            }}
            autoRotate={autoRotate}
            autoRotateSpeed={1.0}
            enabled={controlsEnabled}
            onStart={() => {
              // Only stop dragging if orbit controls are actually starting
              // This prevents interference during drag operations
              if (controlsEnabled) {
                stopDragging();
                clearAddDrag();
                setHoverNorm(null);
                setHoverNormRaw(null);
              }
            }}
            makeDefault
            // enableDamping={false}
            dampingFactor={0.09}
          />
        </Canvas>
      </ErrorBoundary>

      <div className="pointer-events-none absolute bottom-2 right-2 rounded-md border bg-white/80 px-2 py-1 text-xs text-slate-700 backdrop-blur">
        {!fullScreen
          ? "Hover machine for details • Click machine to open"
          : isOverlayAddToolActive
            ? "Click + drag + release to draw • Camera drag disabled"
            : isAddMode
              ? "Click to place"
              : selectedId
                ? "Drag to move • Use gizmo to scale"
                : "Click to select • Drag to move"}
      </div>
    </div>
  );
}

// Preload all models at module load time for optimal performance
useGLTF.preload("/models/floor-model.glb");
useGLTF.preload("/models/zone-green.glb");
useGLTF.preload("/models/machine.glb");
useGLTF.preload("/models/machine-running.glb");
useGLTF.preload("/models/machine-idle.glb");
useGLTF.preload("/models/machine-down.glb");
useGLTF.preload("/models/machine-blender.glb");
useGLTF.preload("/models/transporter.glb");
useGLTF.preload("/models/walkway.glb");


