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

const DEFAULT_PLANE_SIZE = 20;

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
    return "#166534";
  if (k === "orange") return "#15803d";
  if (k === "yellow") return "#16a34a";
  return "#166534";
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

  // Status-colored models in preview mode.
  const s = String(status || "").toUpperCase();
  if (s === "DOWN") return "/models/machine-down.glb";
  if (s === "IDLE") return "/models/machine-idle.glb";
  if (s === "RUNNING") return "/models/machine-running.glb";
  // Fallbacks for statuses without dedicated GLB.
  if (s === "MAINTENANCE") return "/models/machine-idle.glb";
  if (s === "OFF" || s === "OFFLINE") return "/models/machine-down.glb";
  return "/models/machine-running.glb";
}

function machineOrderIndex(machine) {
  const raw = Number(machine?.meta?.slotIndex);
  return Number.isFinite(raw) ? raw : Number.POSITIVE_INFINITY;
}

function sortMachinesForZone(a, b) {
  const ai = machineOrderIndex(a);
  const bi = machineOrderIndex(b);
  if (ai !== bi) return ai - bi;
  return String(a?.label || "").localeCompare(String(b?.label || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
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
  const safeStatus = String(status || "â€”");
  const oeeText = oeePct == null ? "â€”" : `${Number(oeePct).toFixed(1)}%`;
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
          <span className="mx-2">â€¢</span>
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
          ? clamp((target * 1.12) / modelXZ, 0.001, 100)
          : 1;
      const computedYOffset = Number.isFinite(minY)
        ? -minY * computedFitScale
        : 0;

      return { fitScale: computedFitScale, yOffset: computedYOffset };
    } catch {
      return { fitScale: 1, yOffset: 0 };
    }
  }, [measured, fitW, fitD]);

  // Use model colors as-authored.
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
  onDoubleClick,
  selectedObjectRef,
}) {
  const wNorm = clamp01(Number(el.w) || 0.12);
  const hNorm = clamp01(Number(el.h) || 0.12);
  const cx = clamp01((Number(el.x) || 0.5) + wNorm / 2);
  const cy = clamp01((Number(el.y) || 0.5) + hNorm / 2);
  const pos = normToPlane(cx, cy, effectivePlaneSize);
  const labelY = Math.max(
    0.92,
    Math.max(Number(fitW) || 0, Number(fitD) || 0) * 0.55,
  );

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
      onDoubleClick={onDoubleClick}
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
      (labelText || machineName) ? (
        <Billboard follow lockX lockZ>
          <Text
            position={[0, labelY, 0]}
            fontSize={0.14}
            color="#f8fafc"
            outlineWidth={0.012}
            outlineColor="#0b1220"
            anchorX="center"
            anchorY="bottom"
            material-depthTest={false}
            material-transparent
          >
            {fullScreen ? labelText : labelText}
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
    prev.fitW === next.fitW &&
    prev.fitD === next.fitD &&
    prev.machineStatus === next.machineStatus &&
    prev.fullScreen === next.fullScreen
  );
});

// Floor model component: handles both auto-scaled and predefined floor models
// - Predefined models (from /models/pre-defined-models/) are rendered as-is without scaling
//   This preserves the exact design of floor plans like floor(1x2).glb, floor(2x3).glb
// - Auto-layout models (from /models/) are scaled to fit the specified width/depth
// - Predefined models are identified by path or ?predef=true query parameter
const FloorModel3D = memo(function FloorModel3D({ width, depth, url }) {
  const w = Math.max(0.02, Number(width) || 1);
  const d = Math.max(0.02, Number(depth) || 1);
  const modelUrl = url || "/models/floor-model.glb";
  
  // Check if this is a pre-defined model (should not be scaled)
  // Predefined models are loaded directly from /models/pre-defined-models/ folder
  const isPreDefinedModel = modelUrl.includes("/models/pre-defined-models/") || 
                            modelUrl.includes("?predef=true");
  
  const { scene } = useGLTF(modelUrl);

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);

    if (isPreDefinedModel) {
      // Pre-defined models: render as-is without any scaling or centering
      // Just position at floor level
      const box = new Box3().setFromObject(clone);
      clone.position.set(0, -box.min.y, 0);
      return clone;
    }

    // Auto-layout models: scale to fit the desired width and depth
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
  }, [scene, w, d, modelUrl, isPreDefinedModel]);

  return <primitive object={clonedScene} />;
});

function floorShellModeFromModelUrl(modelUrl) {
  const url = String(modelUrl || "");
  const m = url.match(/[?&]shell=([^&]+)/i);
  const raw = String(m?.[1] || "").trim().toLowerCase();
  if (raw === "none" || raw === "0") return "none";
  if (raw === "2" || raw === "two") return "2";
  if (raw === "2l" || raw === "2-left" || raw === "two-left") return "2l";
  if (raw === "3" || raw === "three") return "3";
  // Default department shell mode when unspecified.
  return "3";
}

// Procedural wall shell for department floor when no dedicated wall GLB exists.
// Dynamic with floor size; rendered once for the whole department floor.
const DepartmentShellWalls = memo(function DepartmentShellWalls({
  width,
  depth,
  wallHeight = 1.4,
  wallMode = "3",
}) {
  const w = Math.max(0.02, Number(width) || 1);
  const d = Math.max(0.02, Number(depth) || 1);
  const h = Math.max(0.4, Number(wallHeight) || 1.4);
  const t = Math.max(0.05, Math.min(w, d) * 0.03); // wall thickness
  const capH = 0.03;

  const mode = String(wallMode || "3");
  const showBack = mode === "2" || mode === "2l" || mode === "3";
  const showLeft = mode === "2l" || mode === "3";
  const showRight = mode === "2" || mode === "3";

  return (
    <group position={[0, 0, 0]}>
      {showBack ? (
        <mesh position={[0, h / 2, -d / 2 + t / 2]} renderOrder={2}>
          <boxGeometry args={[w, h, t]} />
          <meshStandardMaterial color="#d1d5db" />
        </mesh>
      ) : null}
      {showLeft ? (
        <mesh position={[-w / 2 + t / 2, h / 2, 0]} renderOrder={2}>
          <boxGeometry args={[t, h, d]} />
          <meshStandardMaterial color="#e5e7eb" />
        </mesh>
      ) : null}
      {showRight ? (
        <mesh position={[w / 2 - t / 2, h / 2, 0]} renderOrder={2}>
          <boxGeometry args={[t, h, d]} />
          <meshStandardMaterial color="#e5e7eb" />
        </mesh>
      ) : null}

      {/* Top caps for cleaner edge definition */}
      {showBack ? (
        <mesh position={[0, h + capH / 2, -d / 2 + t / 2]} renderOrder={3}>
          <boxGeometry args={[w, capH, t]} />
          <meshStandardMaterial color="#f3f4f6" />
        </mesh>
      ) : null}
      {showLeft ? (
        <mesh position={[-w / 2 + t / 2, h + capH / 2, 0]} renderOrder={3}>
          <boxGeometry args={[t, capH, d]} />
          <meshStandardMaterial color="#f3f4f6" />
        </mesh>
      ) : null}
      {showRight ? (
        <mesh position={[w / 2 - t / 2, h + capH / 2, 0]} renderOrder={3}>
          <boxGeometry args={[t, capH, d]} />
          <meshStandardMaterial color="#f3f4f6" />
        </mesh>
      ) : null}
    </group>
  );
});

// Zone Model using zone-green.glb
const ZoneModel3D = memo(function ZoneModel3D({ width, depth, color }) {
  const w = Math.max(0.02, Number(width) || 1);
  const d = Math.max(0.02, Number(depth) || 1);
  const { scene } = useGLTF("/models/zone-green.glb");
  const resolvedColor = color || "#ffffff";

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);

    // Force zone model tint so zone canvas can be white regardless of source GLB color.
    clone.traverse((obj) => {
      if (!obj?.isMesh) return;
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((mat) => {
          if (!mat) return mat;
          const next = mat.clone();
          if ("color" in next) next.color = new Color(resolvedColor);
          return next;
        });
        return;
      }
      if (obj.material) {
        const next = obj.material.clone();
        if ("color" in next) next.color = new Color(resolvedColor);
        obj.material = next;
      }
    });
    
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
  }, [scene, w, d, resolvedColor]);

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
  planeScale = 1,
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
  // `planeScale` expands the world when zone/machine counts grow (prevents shrink).
  const effectivePlaneScale = clamp(Number(planeScale) || 1, 0.25, 50);
  const effectivePlaneSize =
    Math.max(0.01, Number(planeSize) || DEFAULT_PLANE_SIZE) *
    clamp(Number(scale) || 1, 0.01, 50) *
    effectivePlaneScale;

  const effectiveFloorY = 0;
  // Keep lifts in world units. Use a larger machine lift to ensure the semi-transparent
  // zone planes never visually occlude the GLBs due to depth sorting.
  // overlayLift for walkways - placed at 0.1m above floor
  const overlayLift = 0.1;
  const placeableLift = 0.115;

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

    // Slightly slower rotation for easier machine focusing.
    if ("rotateSpeed" in controls) controls.rotateSpeed = 0.65;
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

  const focusPreviewCameraOnMachine = useCallback(
    (el) => {
      if (fullScreen || !el) return;
      const cam = cameraRef.current;
      const controls = orbitRef.current;
      if (!cam || !controls || !controls.target) return;

      const wNorm = clamp01(Number(el?.w) || 0.12);
      const hNorm = clamp01(Number(el?.h) || 0.12);
      const cx = clamp01((Number(el?.x) || 0.5) + wNorm / 2);
      const cy = clamp01((Number(el?.y) || 0.5) + hNorm / 2);
      const pos = normToPlane(cx, cy, effectivePlaneSize);

      const offset = new Vector3().subVectors(cam.position, controls.target);
      let distance = offset.length();
      const minDist = Math.max(0.5, effectivePlaneSize * 0.035);
      const maxDist = Math.max(minDist + 0.2, effectivePlaneSize * 1.2);
      if (!Number.isFinite(distance) || distance < 0.001) {
        distance = Math.max(minDist, effectivePlaneSize * 0.4);
      }
      distance = clamp(distance, minDist, maxDist);

      offset.normalize().multiplyScalar(distance);
      controls.target.set(pos.x, effectiveFloorY, pos.z);
      cam.position.set(
        pos.x + offset.x,
        effectiveFloorY + Math.max(0.25, offset.y),
        pos.z + offset.z,
      );
      cam.lookAt(pos.x, effectiveFloorY, pos.z);
      if (typeof controls.update === "function") controls.update();
    },
    [fullScreen, effectivePlaneSize, effectiveFloorY],
  );

  const centerPreviewCameraOnLayout = useCallback(
    (zones) => {
      if (fullScreen) return;
      const cam = cameraRef.current;
      const controls = orbitRef.current;
      if (!cam || !controls || !controls.target) return;

      const safeZones = Array.isArray(zones) ? zones.filter(Boolean) : [];
      let cx = 0.5;
      let cy = 0.5;
      let spanNorm = 0.8;

      if (safeZones.length) {
        const minX = Math.min(...safeZones.map((z) => Number(z?.x) || 0));
        const minY = Math.min(...safeZones.map((z) => Number(z?.y) || 0));
        const maxX = Math.max(
          ...safeZones.map((z) => (Number(z?.x) || 0) + (Number(z?.w) || 0)),
        );
        const maxY = Math.max(
          ...safeZones.map((z) => (Number(z?.y) || 0) + (Number(z?.h) || 0)),
        );
        cx = clamp01((minX + maxX) / 2);
        cy = clamp01((minY + maxY) / 2);
        spanNorm = clamp(Math.max(maxX - minX, maxY - minY), 0.15, 1);
      }

      const center = normToPlane(cx, cy, effectivePlaneSize);
      const offset = new Vector3().subVectors(cam.position, controls.target);
      const fovDeg = Number(cam.fov) || 34;
      const fovRad = (fovDeg * Math.PI) / 180;
      const spanWorld = Math.max(0.5, spanNorm * effectivePlaneSize);
      const fitDist = spanWorld / (2 * Math.tan(fovRad / 2)) + 0.6;
      const minDist = Math.max(0.8, effectivePlaneSize * 0.32);
      const maxDist = Math.max(minDist + 0.4, effectivePlaneSize * 2.0);
      let distance = clamp(fitDist, minDist, maxDist);
      if (!Number.isFinite(distance) || distance <= 0) {
        distance = Math.max(minDist, effectivePlaneSize * 0.8);
      }

      if (offset.length() < 0.0001) offset.set(0, 1, 1);
      offset.normalize().multiplyScalar(distance);

      controls.target.set(center.x, effectiveFloorY, center.z);
      cam.position.set(
        center.x + offset.x,
        effectiveFloorY + Math.max(0.35, offset.y),
        center.z + offset.z,
      );
      cam.lookAt(center.x, effectiveFloorY, center.z);
      if (typeof controls.update === "function") controls.update();
    },
    [fullScreen, effectivePlaneSize, effectiveFloorY],
  );

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

  const previewLayout = useMemo(() => {
    if (fullScreen || zoneElements.length === 0) {
      return {
        zones: zoneElements,
        walkways: walkwayElements,
        placeables: visiblePlaceableElements,
        floors: floorElements,
      };
    }

    const ROW_Y_TOLERANCE = 0.08;
    const orderedZones = [...zoneElements].sort((a, b) => {
      const ay = Number(a?.y) || 0;
      const by = Number(b?.y) || 0;
      if (Math.abs(ay - by) > ROW_Y_TOLERANCE) return ay - by;
      const ax = Number(a?.x) || 0;
      const bx = Number(b?.x) || 0;
      return ax - bx;
    });

    const sourceZoneById = new Map(orderedZones.map((z) => [String(z.id), z]));
    const resolveSourceZoneForMachine = (m) => {
      const zid = String(m?.meta?.zoneId || "").trim();
      if (zid && sourceZoneById.has(zid)) return sourceZoneById.get(zid);
      const zname = String(m?.meta?.zoneName || "").trim();
      if (zname) {
        const byName = orderedZones.find(
          (z) => String(z?.label || "").trim() === zname,
        );
        if (byName) return byName;
      }
      const mx = Number(m?.x) || 0;
      const my = Number(m?.y) || 0;
      const mw = Number(m?.w) || 0;
      const mh = Number(m?.h) || 0;
      const cx = mx + mw / 2;
      const cy = my + mh / 2;
      return orderedZones.find((z) => {
        const zx = Number(z?.x) || 0;
        const zy = Number(z?.y) || 0;
        const zw = Number(z?.w) || 0;
        const zh = Number(z?.h) || 0;
        return cx >= zx && cx <= zx + zw && cy >= zy && cy <= zy + zh;
      }) || null;
    };

    const machines = visiblePlaceableElements.filter(
      (e) => e?.type === ELEMENT_TYPES.MACHINE,
    );
    const grouped = new Map(orderedZones.map((z) => [String(z.id), []]));
    for (const m of machines) {
      const sourceZone = resolveSourceZoneForMachine(m);
      if (!sourceZone) continue;
      grouped.get(String(sourceZone.id)).push(m);
    }

    const zoneCount = orderedZones.length;
    const getRowCounts = (count) => {
      if (count <= 0) return [1];
      if (count === 1) return [1];
      if (count === 2) return [2];
      if (count === 3) return [3];
      if (count === 4) return [2, 2];
      if (count === 5) return [3, 2];
      if (count === 6) return [3, 3];
      if (count === 7) return [4, 3];
      if (count === 8) return [4, 4];
      if (count === 9) return [3, 3, 3];
      if (count === 10) return [5, 5];

      // For larger counts: avoid tiny last rows (e.g. 5,5,1).
      // Keep rows visually balanced, up to ~8 zones per row:
      // 11 -> [6,5], 12 -> [6,6], 13 -> [7,6], 17 -> [6,6,5]
      const maxPerRow = 8;
      const rowCount = Math.max(2, Math.ceil(count / maxPerRow));
      const base = Math.floor(count / rowCount);
      const remainder = count % rowCount;
      return Array.from({ length: rowCount }, (_, i) =>
        base + (i < remainder ? 1 : 0),
      );
    };
    const rowCounts = getRowCounts(zoneCount);
    const rows = Math.max(1, rowCounts.length);
    const maxCols = Math.max(...rowCounts, 1);
    const indexToRowCol = (index) => {
      let row = 0;
      let offset = index;
      while (row < rowCounts.length && offset >= rowCounts[row]) {
        offset -= rowCounts[row];
        row += 1;
      }
      return { row, col: Math.max(0, offset) };
    };

    // Keep everything inside a fixed normalized layout frame so no zone can
    // render outside the white floor canvas in preview.
    const frameX = 0.03;
    const frameY = 0.04;
    const frameW = 0.94;
    const frameH = 0.92;
    const gapX = 0.02;
    const gapY = 0.03;
    const slotH = Math.max(
      0.08,
      (frameH - gapY * Math.max(0, rows - 1)) / rows,
    );

    let maxCount = 0;
    for (const list of grouped.values()) {
      maxCount = Math.max(maxCount, list.length || 0);
    }
    const minScale = 0.9;
    const maxScale = 0.9;
    // Shared preview machine grid for all zones.
    const maxColsByCount = clamp(
      Math.ceil(Math.sqrt(Math.max(1, maxCount)) * 1.3),
      5,
      12,
    );
    const maxRowsByCount = Math.max(
      1,
      Math.ceil(Math.max(1, maxCount) / maxColsByCount),
    );
    const maxCapacity = maxColsByCount * maxRowsByCount;
    const maxFill = clamp(maxCount / Math.max(1, maxCapacity), 0, 1);
    const maxDensityFactor = clamp(0.55 + maxFill * 0.45, 0.55, 1);
    const uniformZoneScale = clamp(
      minScale + (maxScale - minScale) * maxDensityFactor,
      minScale,
      maxScale,
    );
    const remappedZones = [];
    const availableW = Math.max(0.1, frameW);
    for (let i = 0; i < zoneCount; i += 1) {
      const z = orderedZones[i];
      const { row, col } = indexToRowCol(i);
      const rowCols = Math.max(1, rowCounts[row] || maxCols);
      const rowGapX = rowCols > 1 ? gapX : 0;
      const rowSlotW = Math.max(
        0.08,
        (availableW - rowGapX * Math.max(0, rowCols - 1)) / Math.max(1, rowCols),
      );
      const zw = rowSlotW * uniformZoneScale;
      const zh = slotH * uniformZoneScale;
      const slotX = frameX + col * (rowSlotW + rowGapX);
      // Keep row index direction same as 2D ordering (top->bottom),
      // so later rows in 2D appear lower (bottom) in 3D.
      const slotY = frameY + row * (slotH + gapY);
      remappedZones.push({
        ...z,
        x: clamp01(slotX + (rowSlotW - zw) / 2),
        y: clamp01(slotY + (slotH - zh) / 2),
        w: zw,
        h: zh,
      });
    }
    const remappedMachines = [];
    const headerH = 0;
    const zoneBodies = remappedZones.map((z) => {
      const padX = Math.max(0.004, z.w * 0.018);
      const padY = Math.max(0.004, z.h * 0.018);
      const bodyX = z.x + padX;
      const bodyY = z.y + headerH + padY;
      const bodyW = Math.max(0.02, z.w - padX * 2);
      const bodyH = Math.max(0.02, z.h - headerH - padY * 2);
      return { bodyX, bodyY, bodyW, bodyH };
    });
    const minBodyW = zoneBodies.length
      ? Math.min(...zoneBodies.map((b) => b.bodyW))
      : 0.02;
    const minBodyH = zoneBodies.length
      ? Math.min(...zoneBodies.map((b) => b.bodyH))
      : 0.02;
    const rowsM = Math.max(2, maxRowsByCount);
    const colsM = maxColsByCount;
    const baseCellW = Math.max(0.01, minBodyW / colsM);
    const baseCellH = Math.max(0.01, minBodyH / rowsM);
    const fillRatio = 0.86;
    const uniformMachineSize = Math.max(
      0.008,
      Math.min(baseCellW, baseCellH) * fillRatio,
    );

    for (const z of remappedZones) {
      const zid = String(z.id);
      const list = (grouped.get(zid) || []).sort(sortMachinesForZone);
      // Preview: use almost full zone area for machines.
      const padX = Math.max(0.004, z.w * 0.018);
      const padY = Math.max(0.004, z.h * 0.018);
      const bodyX = z.x + padX;
      const bodyY = z.y + headerH + padY;
      const bodyW = Math.max(0.02, z.w - padX * 2);
      const bodyH = Math.max(0.02, z.h - headerH - padY * 2);
      // Shared grid pattern and shared machine size across zones.
      const cellW = Math.max(0.01, bodyW / colsM);
      const cellH = Math.max(0.01, bodyH / rowsM);

      for (let i = 0; i < list.length; i += 1) {
        const m = list[i];
        const col = i % colsM;
        const logicalRow = Math.floor(i / colsM);
        const row = logicalRow;
        const mw = uniformMachineSize;
        const mh = uniformMachineSize;
        const mx = clamp01(bodyX + col * cellW + (cellW - mw) / 2);
        const my = clamp01(bodyY + row * cellH + (cellH - mh) / 2);
        remappedMachines.push({
          ...m,
          x: clamp(mx, 0, 1 - mw),
          y: clamp(my, 0, 1 - mh),
          w: mw,
          h: mh,
          meta: {
            ...(m?.meta || {}),
            zoneId: zid,
            zoneName: String(z?.label || ""),
          },
        });
      }
    }

    const others = visiblePlaceableElements.filter(
      (e) => e?.type !== ELEMENT_TYPES.MACHINE,
    );
    const remappedPlaceables = [...remappedMachines, ...others];

    const minX = frameX;
    const minY = frameY;
    const maxX = Math.min(1, frameX + frameW);
    const maxY = Math.min(1, frameY + frameH);
    const baseFloor = floorElements[0] || {};
    const remappedFloors = [
      {
        id: String(baseFloor?.id || "__preview_floor__"),
        type: ELEMENT_TYPES.FLOOR,
        label: String(baseFloor?.label || "Floor"),
        modelUrl: baseFloor?.modelUrl || "/models/floor-model.glb",
        rotationDeg: 0,
        x: minX,
        y: minY,
        w: Math.max(0.02, maxX - minX),
        h: Math.max(0.02, maxY - minY),
      },
    ];

    return {
      zones: remappedZones,
      walkways: [],
      placeables: remappedPlaceables,
      floors: remappedFloors,
    };
  }, [
    fullScreen,
    zoneElements,
    walkwayElements,
    visiblePlaceableElements,
    floorElements,
  ]);

  const sceneFloorElements = fullScreen ? floorElements : previewLayout.floors;
  const sceneZoneElements = fullScreen ? zoneElements : previewLayout.zones;
  const sceneWalkwayElements = fullScreen
    ? walkwayElements
    : previewLayout.walkways;
  const sceneVisiblePlaceableElements = fullScreen
    ? visiblePlaceableElements
    : previewLayout.placeables;

  const isInsideAnySceneFloor = useCallback(
    (xNorm, yNorm) => {
      const x = clamp01(Number(xNorm) || 0);
      const y = clamp01(Number(yNorm) || 0);
      const floors = Array.isArray(sceneFloorElements) ? sceneFloorElements : [];
      if (!floors.length) return true;
      return floors.some((f) => {
        const fx = Number(f?.x) || 0;
        const fy = Number(f?.y) || 0;
        const fw = Number(f?.w) || 0;
        const fh = Number(f?.h) || 0;
        return x >= fx && x <= fx + fw && y >= fy && y <= fy + fh;
      });
    },
    [sceneFloorElements],
  );

  useEffect(() => {
    if (fullScreen) return;
    const onDocPointerDown = (e) => {
      const root = containerRef.current;
      if (!root) return;
      const target = e?.target;
      if (target instanceof Node && root.contains(target)) return;
      centerPreviewCameraOnLayout(sceneZoneElements);
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
    };
  }, [fullScreen, sceneZoneElements, centerPreviewCameraOnLayout]);

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
        const machineData = sceneVisiblePlaceableElements.find(
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
          // Balanced DPR for faster load on 3D layout page.
          dpr={fullScreen ? [1, 1.5] : [0.75, 1.15]}
          gl={{ 
            antialias: false,
            powerPreference: "high-performance", // Force dedicated GPU
            stencil: false, // Not needed, saves memory
            depth: true,
            alpha: false, // Opaque canvas = better performance
            premultipliedAlpha: false, // Faster blending
            preserveDrawingBuffer: false, // Don't preserve = faster
            failIfMajorPerformanceCaveat: false, // Try even on slow GPUs
            // Performance: low precision shaders, no logarithmic depth
            logarithmicDepthBuffer: false,
            precision: "mediump",
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

          {/* 3D floor model rendering:
              - Saved floors (including predefined models from /models/pre-defined-models/) are rendered with their stored modelUrl
              - Predefined floors are identified and rendered as-is without auto-scaling
              - Only uses default floor if no floor element exists in the layout
              - Auto-layout is only applied when loading a layout with NO saved elements
          */}
          {(() => {
            const list = sceneFloorElements.length
              ? sceneFloorElements
              : [
                  {
                    id: "__default_floor__",
                    x: 0.025,
                    y: 0.025,
                    w: 0.95,
                    h: 0.95,
                    rotationDeg: 0,
                    modelUrl: "/models/floor-model.glb",
                  },
                ];

            return list.map((el, floorIdx) => {
              const id = String(el.id);
              const isSelected = selectedId && String(selectedId) === id;
              const wNorm = clamp01(Number(el.w) || 0.9);
              const hNorm = clamp01(Number(el.h) || 0.9);
              const cx = clamp01((Number(el.x) || 0.05) + wNorm / 2);
              const cy = clamp01((Number(el.y) || 0.05) + hNorm / 2);
              const pos = normToPlane(cx, cy, effectivePlaneSize);
              const w = Math.max(0.02, wNorm) * effectivePlaneSize;
              const d = Math.max(0.02, hNorm) * effectivePlaneSize;
              const shellWallHeight = clamp(Math.max(w, d) * 0.18, 0.9, 2.2);
              const rot = (Number(el.rotationDeg) || 0) * (Math.PI / 180);
              // modelUrl is preserved from MongoDB - supports predefined floors (floor(1x2).glb, etc.)
              const floorModelUrl = el.modelUrl || "/models/floor-model.glb";
              const shellMode = floorShellModeFromModelUrl(floorModelUrl);

              // Disable all editing interactions in non-fullScreen
              const allowEdit = fullScreen;
              const allowMove = false;

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
                          allowMove &&
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
                  {/* In preview mode, use a clean white base plane for consistent organization.
                      Keep model-based floor only in fullscreen editor mode. */}
                  {fullScreen ? (
                    <Suspense fallback={null}>
                      <FloorModel3D width={w} depth={d} url={floorModelUrl} />
                    </Suspense>
                  ) : (
                    <mesh
                      rotation={[-Math.PI / 2, 0, 0]}
                      position={[0, 0.002, 0]}
                      receiveShadow={false}
                    >
                      <planeGeometry args={[w, d]} />
                      <meshStandardMaterial color="#e5e7eb" />
                    </mesh>
                  )}

                  {/* One connected shell for department floor (dynamic + scalable). */}
                  {floorIdx === 0 && shellMode !== "none" ? (
                    <DepartmentShellWalls
                      width={w}
                      depth={d}
                      wallHeight={shellWallHeight}
                      wallMode={shellMode}
                    />
                  ) : null}
                  
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
          {sceneZoneElements.map((el) => {
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
            const zoneHeight = 0.1; // Zones placed at 0.1m above floor

            // Disable all editing interactions in non-fullScreen
            const allowEdit = fullScreen;
            const allowMove = false;
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
                        // CRITICAL: Stop all event propagation FIRST to prevent OrbitControls from receiving events
                        e.stopPropagation();
                        e.nativeEvent?.stopPropagation?.();
                        e.nativeEvent?.stopImmediatePropagation?.();
                        e.nativeEvent?.preventDefault?.();
                        
                        if (isTransforming) return;
                        
                        if (typeof onSelectElement === "function")
                          onSelectElement(id);

                        if (activeTool === "select") {
                          // Disable OrbitControls BEFORE capturing pointer
                          setOrbitEnabledNow(false);
                          capturePointer(e);
                        }

                        if (
                          allowMove &&
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
                          // Ensure controls are disabled during drag
                          setOrbitEnabledNow(false);
                        }

                        // Don't initiate drag immediately - wait for actual pointer movement
                      }
                    : undefined
                }
                onPointerMove={
                  allowEdit
                    ? (e) => {
                        // Stop propagation during drag to keep camera static
                        e.stopPropagation();
                        e.nativeEvent?.stopPropagation?.();
                        e.nativeEvent?.stopImmediatePropagation?.();
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
              </group>
            );
          })}

          {/* Render zone labels separately in world space (not rotated with zones) */}
          {(() => {
            // Helper function to check if a point is inside a zone
            const isPointInZone = (pointX, pointY, zone) => {
              const zoneX = Number(zone.x) || 0;
              const zoneY = Number(zone.y) || 0;
              const zoneW = Number(zone.w) || 0.15;
              const zoneH = Number(zone.h) || 0.12;
              return pointX >= zoneX && pointX <= zoneX + zoneW &&
                     pointY >= zoneY && pointY <= zoneY + zoneH;
            };

            // Calculate machine centers for each zone
            const zoneMachineCenters = sceneZoneElements.reduce((acc, zone) => {
              const machinesInZone = sceneVisiblePlaceableElements.filter(machine => {
                const machineWNorm = clamp01(Number(machine.w) || 0.12);
                const machineHNorm = clamp01(Number(machine.h) || 0.12);
                const machineCx = clamp01((Number(machine.x) || 0.5) + machineWNorm / 2);
                const machineCy = clamp01((Number(machine.y) || 0.5) + machineHNorm / 2);
                return isPointInZone(machineCx, machineCy, zone);
              });

              if (machinesInZone.length > 0) {
                const sumX = machinesInZone.reduce((sum, m) => {
                  const mWNorm = clamp01(Number(m.w) || 0.12);
                  const mCx = clamp01((Number(m.x) || 0.5) + mWNorm / 2);
                  return sum + mCx;
                }, 0);
                const sumY = machinesInZone.reduce((sum, m) => {
                  const mHNorm = clamp01(Number(m.h) || 0.12);
                  const mCy = clamp01((Number(m.y) || 0.5) + mHNorm / 2);
                  return sum + mCy;
                }, 0);
                
                acc[zone.id] = {
                  cx: sumX / machinesInZone.length,
                  cy: sumY / machinesInZone.length
                };
              } else {
                // No machines in zone, use zone center
                const wNorm = clamp01(Number(zone.w) || 0.15);
                const hNorm = clamp01(Number(zone.h) || 0.12);
                acc[zone.id] = {
                  cx: clamp01((Number(zone.x) || 0) + wNorm / 2),
                  cy: clamp01((Number(zone.y) || 0) + hNorm / 2)
                };
              }
              return acc;
            }, {});

            return sceneZoneElements.map((zone) => {
              const zoneName = String(zone.label || "").trim() || "Zone";
              const labelCenter = zoneMachineCenters[zone.id];
              if (!labelCenter) return null;

              const labelPos = normToPlane(labelCenter.cx, labelCenter.cy, effectivePlaneSize);

              return (
                <Billboard key={`zone-label-${zone.id}`} follow lockX lockZ position={[labelPos.x, 1.5, labelPos.z]}>
                  <Text
                    fontSize={0.28}
                    color="#000000"
                    outlineWidth={0.025}
                    outlineColor="#ffffff"
                    anchorX="center"
                    anchorY="middle"
                    renderOrder={150}
                    material-depthTest={false}
                    material-transparent
                  >
                    {zoneName}
                  </Text>
                </Billboard>
              );
            });
          })()}

          {sceneWalkwayElements.map((el) => {
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
                        // CRITICAL: Stop all event propagation FIRST to prevent OrbitControls from receiving events
                        e.stopPropagation();
                        e.nativeEvent?.stopPropagation?.();
                        e.nativeEvent?.stopImmediatePropagation?.();
                        e.nativeEvent?.preventDefault?.();
                        if (typeof onSelectElement === "function")
                          onSelectElement(id);

                        if (isTransforming) return;

                        if (activeTool === "select") {
                          // Disable OrbitControls BEFORE capturing pointer
                          setOrbitEnabledNow(false);
                          capturePointer(e);
                        }

                        if (
                          allowMove &&
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
                          // Ensure controls are disabled during drag
                          setOrbitEnabledNow(false);
                          capturePointer(e);
                        }
                      }
                    : undefined
                }
                onPointerMove={
                  allowEdit
                    ? (e) => {
                        // Stop propagation during drag to keep camera static
                        e.stopPropagation();
                        e.nativeEvent?.stopPropagation?.();
                        e.nativeEvent?.stopImmediatePropagation?.();
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

              if (!fullScreen) {
                const hit = getFloorHitFromEvent(e);
                if (hit) {
                  const norm = planeToNorm(hit.x, hit.z, effectivePlaneSize);
                  if (!isInsideAnySceneFloor(norm.x, norm.y)) {
                    centerPreviewCameraOnLayout(sceneZoneElements);
                  }
                }
                return;
              }

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
                  return sceneVisiblePlaceableElements.map((el) => {
                    const wNorm = clamp01(Number(el.w) || 0.12);
                    const hNorm = clamp01(Number(el.h) || 0.12);
                    const cx = clamp01((Number(el.x) || 0.5) + wNorm / 2);
                    const cy = clamp01((Number(el.y) || 0.5) + hNorm / 2);
                    const pos = normToPlane(cx, cy, effectivePlaneSize);
                    return { el, pos, id: String(el.id) };
                  });
                }, [sceneVisiblePlaceableElements, effectivePlaneSize]);

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
                    // Prevent OrbitControls from receiving the same pointer down.
                    e.stopPropagation();
                    e.nativeEvent?.stopPropagation?.();
                    e.nativeEvent?.stopImmediatePropagation?.();
                    e.nativeEvent?.preventDefault?.();
                    if (isTransforming) return;
                    if (typeof onSelectElement === "function")
                      onSelectElement(String(el.id));
                    if (activeTool === "select") {
                      setOrbitEnabledNow(false);
                      capturePointer(e);
                    }
                  } else if (canOpenDetails) {
                    e.stopPropagation();
                  }
                }, [isAddMode, isTransforming, onSelectElement, activeTool, setOrbitEnabledNow]);

                const createPointerMoveHandler = useCallback((el, isSelected, allowEdit) => (e) => {
                  if (!allowEdit) return;
                  // Stop propagation during drag to keep camera static.
                  e.stopPropagation();
                  e.nativeEvent?.stopPropagation?.();
                  e.nativeEvent?.stopImmediatePropagation?.();
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

                const createClickHandler = useCallback((el, machineId, canOpenDetails) => (e) => {
                  if (!canOpenDetails) return;
                  e.stopPropagation();
                  focusPreviewCameraOnMachine(el);
                }, [focusPreviewCameraOnMachine]);

                const createDoubleClickHandler = useCallback((machineId, canOpenDetails) => (e) => {
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

                  // Show label for every machine when label toggle is enabled.
                  const showLabel =
                    showMachineLabels &&
                    el?.type === ELEMENT_TYPES.MACHINE;

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
                      onClick={createClickHandler(el, machineId, canOpenDetails)}
                      onDoubleClick={createDoubleClickHandler(machineId, canOpenDetails)}
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
              fullScreen ? effectivePlaneSize * 0.12 : effectivePlaneSize * 0.035
            }
            maxDistance={
              fullScreen ? effectivePlaneSize * 3.0 : effectivePlaneSize * 2.0
            }
            mouseButtons={{
              LEFT: MOUSE.ROTATE,
              MIDDLE: MOUSE.DOLLY,
              RIGHT: fullScreen ? MOUSE.PAN : MOUSE.ROTATE,
            }}
            autoRotate={fullScreen ? autoRotate : false}
            autoRotateSpeed={0.6}
            enabled={controlsEnabled}
            onStart={() => {
              // CRITICAL: Prevent OrbitControls from starting if we're dragging an object
              if (draggingId || isAddDrawing || isOverlayAddToolActive) {
                // Force disable controls if somehow they started during a drag operation
                const controls = orbitRef.current;
                if (controls) {
                  controls.enabled = false;
                  if (typeof controls.update === "function") {
                    controls.update();
                  }
                }
                return;
              }
              
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
          ? "Hover machine for details • Click machine to focus • Click outside canvas to recenter • Double-click to open"
          : isOverlayAddToolActive
            ? "Click + drag + release to draw â€¢ Camera drag disabled"
            : isAddMode
              ? "Click to place"
              : selectedId
                ? "Drag to move â€¢ Use gizmo to scale"
                : "Click to select â€¢ Drag to move"}
      </div>
    </div>
  );
}

// Preload all models at module load time for optimal performance
useGLTF.preload("/models/floor-model.glb");
useGLTF.preload("/models/pre-defined-models/floor/floor-plan1.glb");
useGLTF.preload("/models/zone-green.glb");
useGLTF.preload("/models/machine.glb");
useGLTF.preload("/models/machine-running.glb");
useGLTF.preload("/models/machine-idle.glb");
useGLTF.preload("/models/machine-down.glb");
useGLTF.preload("/models/machine-blender.glb");
useGLTF.preload("/models/transporter.glb");
useGLTF.preload("/models/walkway.glb");


