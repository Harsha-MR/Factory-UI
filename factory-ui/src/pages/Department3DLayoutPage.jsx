import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { nanoid } from "nanoid";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Box3, Vector3 } from "three";
import { getDepartmentLayout } from "../services/mockApi";

import DepartmentFloor2DViewer from "../components/layout/DepartmentFloor2DViewer";
import DepartmentFloor3DViewer from "../components/layout/DepartmentFloor3DViewer";
import { createDefaultLayoutForDepartment } from "../components/layout/defaultLayout";
import {
  ELEMENT_TYPES,
  normalizeLayout,
} from "../components/layout/layoutTypes";
import {
  deleteDepartmentCustomLayout,
  fetchDepartmentCustomLayoutVersions,
  saveDepartmentCustomLayout,
} from "../services/layoutStorage";

const MODEL_LIBRARY = {
  floor: [{ label: "Default floor", url: "/models/floor-model.glb" }],
  [ELEMENT_TYPES.MACHINE]: [{ label: "Machine", url: "/models/machine.glb" }],
  [ELEMENT_TYPES.TRANSPORTER]: [
    { label: "Transporter", url: "/models/transporter.glb" },
    { label: "Tranporter (alt filename)", url: "/models/tranporter.glb" },
  ],
};

const FLOOR_MODEL_OPTIONS = [
  {
    label: "Department floor (3 walls)",
    url: "/models/floor-model.glb?shell=3",
  },
  {
    label: "Department floor (2 walls)",
    url: "/models/floor-model.glb?shell=2",
  },
  {
    label: "Department floor (2 walls - top+left)",
    url: "/models/floor-model.glb?shell=2l",
  },
  {
    label: "Department floor (No walls)",
    url: "/models/floor-model.glb?shell=none",
  },
  // { label: "Floor plan 1", url: "/models/pre-defined-models/floor/floor-plan1.glb" },
  {
    label: "Floor plan(2x3)",
    url: "/models/pre-defined-models/floor/floor(2x3).glb",
  },
  {
    label: "Floor plan(2x2)",
    url: "/models/pre-defined-models/floor/floor(2x2).glb",
  },
  {
    label: "Floor plan(1x2)",
    url: "/models/pre-defined-models/floor/floor(1x2).glb",
  },
];
const STATUS_FILTER_BUTTONS = [
  "RUNNING",
  "IDLE",
  "DOWN",
  // "MAINTENANCE", // TEMP commented
  // "OFF", // TEMP commented
  "ALL",
];

function floorShellModeFromModelUrl(modelUrl) {
  const u = String(modelUrl || "");
  const m = u.match(/[?&]shell=([^&]+)/i);
  const raw = String(m?.[1] || "")
    .trim()
    .toLowerCase();
  if (raw === "none" || raw === "0") return "none";
  if (raw === "2" || raw === "two") return "2";
  if (raw === "2l" || raw === "2-left" || raw === "two-left") return "2l";
  if (raw === "3" || raw === "three") return "3";
  return "";
}

function floorModeLabelFromModelUrl(modelUrl) {
  const shellMode = floorShellModeFromModelUrl(modelUrl);
  if (shellMode === "none") return "No walls";
  if (shellMode === "2") return "2 walls";
  if (shellMode === "2l") return "2 walls (top+left)";
  if (shellMode === "3") return "3 walls";
  if (String(modelUrl || "").includes("/models/pre-defined-models/")) {
    return "Predefined floor";
  }
  return "Default floor";
}

function FloorModelPreviewGLB({ url }) {
  const { scene } = useGLTF(url);

  const previewScene = useMemo(() => {
    const clone = scene.clone(true);
    const box = new Box3().setFromObject(clone);
    const size = new Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 1.2 / maxDim;
    const center = new Vector3();
    box.getCenter(center);
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    clone.scale.setScalar(scale);
    return clone;
  }, [scene]);

  return <primitive object={previewScene} />;
}

function FloorShellPreview({ mode = "3" }) {
  const w = 1.6;
  const d = 1.15;
  const h = 0.42;
  const t = 0.06;
  const showBack = mode === "2" || mode === "2l" || mode === "3";
  const showLeft = mode === "2l" || mode === "3";
  const showRight = mode === "2" || mode === "3";

  return (
    <group position={[0, -0.25, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#d1d5db" />
      </mesh>
      {showBack ? (
        <mesh position={[0, h / 2, -d / 2 + t / 2]}>
          <boxGeometry args={[w, h, t]} />
          <meshStandardMaterial color="#e5e7eb" />
        </mesh>
      ) : null}
      {showLeft ? (
        <mesh position={[-w / 2 + t / 2, h / 2, 0]}>
          <boxGeometry args={[t, h, d]} />
          <meshStandardMaterial color="#f3f4f6" />
        </mesh>
      ) : null}
      {showRight ? (
        <mesh position={[w / 2 - t / 2, h / 2, 0]}>
          <boxGeometry args={[t, h, d]} />
          <meshStandardMaterial color="#f3f4f6" />
        </mesh>
      ) : null}
    </group>
  );
}

function FloorModelPreview({ url }) {
  const shellMode = floorShellModeFromModelUrl(url);
  const isShellPreset =
    String(url || "").includes("/models/floor-model.glb") && !!shellMode;
  if (isShellPreset) return <FloorShellPreview mode={shellMode} />;
  return <FloorModelPreviewGLB url={url} />;
}

function typeLabel(t) {
  if (t === ELEMENT_TYPES.FLOOR) return "Floor";
  if (t === ELEMENT_TYPES.MACHINE) return "Machine";
  if (t === ELEMENT_TYPES.ZONE) return "Zone";
  if (t === ELEMENT_TYPES.WALKWAY) return "Walkway";
  if (t === ELEMENT_TYPES.TRANSPORTER) return "Transporter";
  return String(t || "");
}

function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function computePlaneScaleFromElements(elements) {
  const safeElements = Array.isArray(elements) ? elements : [];
  const zones = safeElements.filter((e) => e?.type === ELEMENT_TYPES.ZONE);
  const machines = safeElements.filter(
    (e) => e?.type === ELEMENT_TYPES.MACHINE,
  );

  const zoneCounts = zones.map((z, i) => ({
    id: String(z?.id || `zone-${i + 1}`),
    name: String(z?.label || `Zone ${i + 1}`),
    x: Number(z?.x) || 0,
    y: Number(z?.y) || 0,
    w: Number(z?.w) || 0,
    h: Number(z?.h) || 0,
    machines: [],
  }));

  const machineCenters = machines.map((m) => {
    const mx = Number(m?.x) || 0;
    const my = Number(m?.y) || 0;
    const mw = Number(m?.w) || 0;
    const mh = Number(m?.h) || 0;
    return { cx: mx + mw / 2, cy: my + mh / 2 };
  });

  // Assign machines to zones by center point.
  const unassigned = [];
  machineCenters.forEach((mc) => {
    const hit = zoneCounts.find(
      (z) =>
        mc.cx >= z.x &&
        mc.cx <= z.x + z.w &&
        mc.cy >= z.y &&
        mc.cy <= z.y + z.h,
    );
    if (hit) {
      hit.machines.push({ id: `m-${hit.machines.length + 1}` });
    } else {
      unassigned.push(mc);
    }
  });

  if (zoneCounts.length === 0 && machineCenters.length > 0) {
    zoneCounts.push({
      id: "zone-auto-1",
      name: "Zone 1",
      machines: machineCenters.map((_, i) => ({ id: `m-${i + 1}` })),
    });
  } else if (unassigned.length > 0) {
    zoneCounts.push({
      id: "zone-unassigned",
      name: "Unassigned",
      machines: unassigned.map((_, i) => ({ id: `m-u-${i + 1}` })),
    });
  }

  const dept = {
    zones: zoneCounts.map((z) => ({
      id: z.id,
      name: z.name,
      machines: z.machines,
    })),
  };
  const auto = createDefaultLayoutForDepartment(dept);
  const scale = Number(auto?.threeD?.planeScale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function computeZoneSizeForMachineCount(count) {
  const n = Math.max(0, Number(count) || 0);
  if (n <= 0) return { w: 0.2, h: 0.16 };

  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);

  const baseMachine = 0.072;
  const baseGap = 0.016;
  const baseInnerPad = 0.03;
  const minZoneW = 0.2;
  const minZoneH = 0.16;
  const maxZoneW = 0.9;
  const maxZoneH = 0.9;

  const wRaw = baseInnerPad * 2 + cols * baseMachine + (cols - 1) * baseGap;
  const hRaw = baseInnerPad * 2 + rows * baseMachine + (rows - 1) * baseGap;
  const w = Math.max(minZoneW, Math.min(maxZoneW, wRaw));
  const h = Math.max(minZoneH, Math.min(maxZoneH, hRaw));
  return { w, h };
}

function countMachinesInsideZone(machines, zone) {
  if (!zone) return 0;
  const zx = Number(zone.x) || 0;
  const zy = Number(zone.y) || 0;
  const zw = Number(zone.w) || 0;
  const zh = Number(zone.h) || 0;
  return (machines || []).filter((m) => {
    const mx = Number(m?.x) || 0;
    const my = Number(m?.y) || 0;
    const mw = Number(m?.w) || 0;
    const mh = Number(m?.h) || 0;
    const cx = mx + mw / 2;
    const cy = my + mh / 2;
    return cx >= zx && cx <= zx + zw && cy >= zy && cy <= zy + zh;
  }).length;
}

function resizeZoneByMachineCount(zones) {
  return zones;
}

function _expandZoneForMachines(zones, machines, targetZoneId) {
  const zoneIndex = zones.findIndex(
    (z) => String(z.id) === String(targetZoneId),
  );
  if (zoneIndex === -1) return zones;
  const zone = zones[zoneIndex];
  const zx = Number(zone.x) || 0;
  const zy = Number(zone.y) || 0;
  const zw = Number(zone.w) || 0;
  const zh = Number(zone.h) || 0;

  const machineCount = machines.filter((m) => {
    const mx = Number(m?.x) || 0;
    const my = Number(m?.y) || 0;
    const mw = Number(m?.w) || 0;
    const mh = Number(m?.h) || 0;
    const cx = mx + mw / 2;
    const cy = my + mh / 2;
    return cx >= zx && cx <= zx + zw && cy >= zy && cy <= zy + zh;
  }).length;

  const desired = computeZoneSizeForMachineCount(machineCount);
  const nextW = Math.max(zw, desired.w);
  const nextH = Math.max(zh, desired.h);

  let nextX = zx;
  let nextY = zy;
  if (nextX + nextW > 1) nextX = Math.max(0, 1 - nextW);
  if (nextY + nextH > 1) nextY = Math.max(0, 1 - nextH);

  if (nextW === zw && nextH === zh && nextX === zx && nextY === zy)
    return zones;

  const nextZones = [...zones];
  nextZones[zoneIndex] = { ...zone, x: nextX, y: nextY, w: nextW, h: nextH };
  return nextZones;
}

function expandFloorForZones(floors, zones) {
  if (zones.length === 0) return floors;
  const pad = 0.035;
  const minX = Math.max(
    0,
    Math.min(...zones.map((z) => Number(z?.x) || 0)) - pad,
  );
  const minY = Math.max(
    0,
    Math.min(...zones.map((z) => Number(z?.y) || 0)) - pad,
  );
  const maxX = Math.min(
    1,
    Math.max(...zones.map((z) => (Number(z?.x) || 0) + (Number(z?.w) || 0))) +
      pad,
  );
  const maxY = Math.min(
    1,
    Math.max(...zones.map((z) => (Number(z?.y) || 0) + (Number(z?.h) || 0))) +
      pad,
  );
  const desired = {
    x: minX,
    y: minY,
    w: Math.max(0.02, maxX - minX),
    h: Math.max(0.02, maxY - minY),
  };

  const nextFloors = floors.length
    ? [...floors]
    : [
        {
          id: "floor-1",
          type: ELEMENT_TYPES.FLOOR,
          label: "Floor",
          x: desired.x,
          y: desired.y,
          w: desired.w,
          h: desired.h,
          rotationDeg: 0,
        },
      ];

  const floorIndex = nextFloors.findIndex(
    (f) => f?.type === ELEMENT_TYPES.FLOOR,
  );
  if (floorIndex === -1) return nextFloors;
  const floor = nextFloors[floorIndex];
  const modelUrl = String(floor?.modelUrl || "");
  const isPredefinedFloor =
    modelUrl.includes("/models/pre-defined-models/") ||
    modelUrl.includes("?predef=true");
  if (isPredefinedFloor) return nextFloors;

  const clampedMinX = Math.max(0, Math.min(1, desired.x));
  const clampedMinY = Math.max(0, Math.min(1, desired.y));
  const clampedMaxX = Math.max(0, Math.min(1, desired.x + desired.w));
  const clampedMaxY = Math.max(0, Math.min(1, desired.y + desired.h));

  nextFloors[floorIndex] = {
    ...floor,
    x: clampedMinX,
    y: clampedMinY,
    w: Math.max(0.02, clampedMaxX - clampedMinX),
    h: Math.max(0.02, clampedMaxY - clampedMinY),
  };
  return nextFloors;
}

function getZoneLayoutBounds(elements) {
  const floors = (elements || []).filter(
    (e) => e?.type === ELEMENT_TYPES.FLOOR,
  );
  if (!floors.length) {
    return { x: 0.02, y: 0.02, w: 0.96, h: 0.96 };
  }
  let largest = floors[0];
  let largestArea = (Number(largest?.w) || 0) * (Number(largest?.h) || 0);
  for (let i = 1; i < floors.length; i += 1) {
    const f = floors[i];
    const area = (Number(f?.w) || 0) * (Number(f?.h) || 0);
    if (area > largestArea) {
      largest = f;
      largestArea = area;
    }
  }
  const fx = clamp(Number(largest?.x) || 0, 0, 1);
  const fy = clamp(Number(largest?.y) || 0, 0, 1);
  const fw = clamp(Number(largest?.w) || 0, 0, 1);
  const fh = clamp(Number(largest?.h) || 0, 0, 1);
  const insetX = 0;
  const insetY = 0;
  const x = clamp(fx + insetX, 0, 1);
  const y = clamp(fy + insetY, 0, 1);
  const w = Math.max(0.2, fw - insetX * 2);
  const h = Math.max(0.16, fh - insetY * 2);
  return {
    x,
    y,
    w: clamp(w, 0.2, 1 - x),
    h: clamp(h, 0.16, 1 - y),
  };
}

function getZoneGridColumns(zoneCount) {
  if (zoneCount <= 1) return 1;
  if (zoneCount <= 2) return 2;
  if (zoneCount <= 5) return 3;
  if (zoneCount <= 7) return 4;
  return 5;
}

function computeZoneRowMetadata(zoneCount) {
  const cols = getZoneGridColumns(zoneCount);
  const fullRows = Math.floor(zoneCount / cols);
  const remainder = zoneCount % cols;
  const rowCounts = [];
  if (remainder > 0 && fullRows > 0) rowCounts.push(remainder);
  for (let i = 0; i < fullRows; i += 1) rowCounts.push(cols);
  if (!rowCounts.length && zoneCount > 0) rowCounts.push(zoneCount);
  return { cols, rows: rowCounts.length, rowCounts };
}

function mapZoneOrderToDisplayIndex(index, zoneCount, cols) {
  const fullRows = Math.floor(zoneCount / cols);
  const remainder = zoneCount % cols;
  if (remainder <= 0 || fullRows <= 0) return index;
  const fullBlockCount = zoneCount - remainder;
  if (index < fullBlockCount) return index + remainder;
  return index - fullBlockCount;
}

function indexToRowCol(index, rowCounts) {
  let row = 0;
  let offset = index;
  while (row < rowCounts.length && offset >= rowCounts[row]) {
    offset -= rowCounts[row];
    row += 1;
  }
  return { row, col: Math.max(0, offset) };
}

function computeZoneCellSizeForRow(itemsInRow, rows, bounds) {
  const startX = bounds.x;
  const startY = bounds.y;
  const gapX = 0.02;
  const gapY = 0.03;
  const safeItems = Math.max(1, itemsInRow);
  const maxFitW = (bounds.w - gapX * (safeItems - 1)) / safeItems;
  const maxFitH = (bounds.h - gapY * (rows - 1)) / rows;
  return {
    startX,
    startY,
    gapX,
    gapY,
    w: clamp(maxFitW, 0.1, maxFitW),
    h: clamp(maxFitH, 0.08, maxFitH),
  };
}

function reflowZonesAndContainedElements(elements) {
  const all = Array.isArray(elements) ? elements : [];
  const zones = all.filter((e) => e?.type === ELEMENT_TYPES.ZONE);
  if (zones.length <= 1) return all;

  const bounds = getZoneLayoutBounds(all);
  const ordered = zones;
  const zoneCount = ordered.length;
  const { cols, rows, rowCounts } = computeZoneRowMetadata(zoneCount);
  const newZoneById = new Map();
  for (let i = 0; i < ordered.length; i += 1) {
    const z = ordered[i];
    const displayIndex = mapZoneOrderToDisplayIndex(i, zoneCount, cols);
    const { row, col } = indexToRowCol(displayIndex, rowCounts);
    const itemsInRow = rowCounts[row] || 1;
    const { startX, startY, gapX, gapY, w, h } = computeZoneCellSizeForRow(
      itemsInRow,
      rows,
      bounds,
    );
    newZoneById.set(String(z.id), {
      ...z,
      x: clamp(
        startX + col * (w + gapX),
        bounds.x,
        Math.max(bounds.x, bounds.x + bounds.w - w),
      ),
      y: clamp(
        startY + row * (h + gapY),
        bounds.y,
        Math.max(bounds.y, bounds.y + bounds.h - h),
      ),
      w,
      h,
    });
  }

  return all.map((el) => {
    if (!el) return el;
    if (el.type === ELEMENT_TYPES.ZONE) {
      return newZoneById.get(String(el.id)) || el;
    }
    if (
      el.type !== ELEMENT_TYPES.MACHINE &&
      el.type !== ELEMENT_TYPES.TRANSPORTER
    ) {
      return el;
    }
    const oldZone = zoneForElement(el, ordered);
    if (!oldZone) return el;
    const newZone = newZoneById.get(String(oldZone.id));
    if (!newZone) return el;
    return remapRectIntoZone(el, oldZone, newZone);
  });
}

function clampZonesAndContainedElementsToFloor(elements) {
  const all = Array.isArray(elements) ? elements : [];
  const zones = all.filter((e) => e?.type === ELEMENT_TYPES.ZONE);
  if (!zones.length) return all;
  const bounds = getZoneLayoutBounds(all);
  const nextZoneById = new Map();

  for (const z of zones) {
    const zx = Number(z?.x) || 0;
    const zy = Number(z?.y) || 0;
    const zw = Math.max(0.02, Number(z?.w) || 0.12);
    const zh = Math.max(0.02, Number(z?.h) || 0.1);
    const w = clamp(zw, 0.02, bounds.w);
    const h = clamp(zh, 0.02, bounds.h);
    const x = clamp(zx, bounds.x, Math.max(bounds.x, bounds.x + bounds.w - w));
    const y = clamp(zy, bounds.y, Math.max(bounds.y, bounds.y + bounds.h - h));
    nextZoneById.set(String(z?.id || ""), { ...z, x, y, w, h });
  }

  return all.map((el) => {
    if (!el) return el;
    if (el.type === ELEMENT_TYPES.ZONE) {
      return nextZoneById.get(String(el.id)) || el;
    }
    if (
      el.type !== ELEMENT_TYPES.MACHINE &&
      el.type !== ELEMENT_TYPES.TRANSPORTER
    ) {
      return el;
    }
    const oldZone = zoneForElement(el, zones);
    if (!oldZone) return el;
    const newZone = nextZoneById.get(String(oldZone.id));
    if (!newZone) return el;
    return remapRectIntoZone(el, oldZone, newZone);
  });
}

function zoneForElement(el, zones) {
  const ex = Number(el?.x) || 0;
  const ey = Number(el?.y) || 0;
  const ew = Number(el?.w) || 0;
  const eh = Number(el?.h) || 0;
  const cx = ex + ew / 2;
  const cy = ey + eh / 2;
  return (zones || []).find((z) => {
    const zx = Number(z?.x) || 0;
    const zy = Number(z?.y) || 0;
    const zw = Number(z?.w) || 0;
    const zh = Number(z?.h) || 0;
    return cx >= zx && cx <= zx + zw && cy >= zy && cy <= zy + zh;
  });
}

function remapRectIntoZone(el, fromZone, toZone) {
  if (!el || !fromZone || !toZone) return el;
  const fx = Number(fromZone?.x) || 0;
  const fy = Number(fromZone?.y) || 0;
  const fw = Math.max(0.0001, Number(fromZone?.w) || 1);
  const fh = Math.max(0.0001, Number(fromZone?.h) || 1);
  const tx = Number(toZone?.x) || 0;
  const ty = Number(toZone?.y) || 0;
  const tw = Math.max(0.0001, Number(toZone?.w) || 1);
  const th = Math.max(0.0001, Number(toZone?.h) || 1);

  const ex = Number(el?.x) || 0;
  const ey = Number(el?.y) || 0;
  const ew = Number(el?.w) || 0;
  const eh = Number(el?.h) || 0;

  const relX = (ex - fx) / fw;
  const relY = (ey - fy) / fh;
  const relW = ew / fw;
  const relH = eh / fh;

  const nw = clamp(relW * tw, 0.01, 1);
  const nh = clamp(relH * th, 0.01, 1);
  const nx = clamp(tx + relX * tw, 0, 1 - nw);
  const ny = clamp(ty + relY * th, 0, 1 - nh);
  return { ...el, x: nx, y: ny, w: nw, h: nh };
}

function zoneForMachineByMeta(machine, zones) {
  const zid = String(machine?.meta?.zoneId || "").trim();
  if (zid) {
    const byId = (zones || []).find((z) => String(z?.id) === zid);
    if (byId) return byId;
  }
  const zname = String(machine?.meta?.zoneName || "").trim();
  if (zname) {
    const byName = (zones || []).find(
      (z) => String(z?.label || "").trim() === zname,
    );
    if (byName) return byName;
  }
  return zoneForElement(machine, zones);
}

function machineOrderIndex(machine) {
  const raw = Number(machine?.meta?.slotIndex);
  return Number.isFinite(raw) ? raw : Number.POSITIVE_INFINITY;
}

function sortMachinesForZone(a, b) {
  const ai = machineOrderIndex(a);
  const bi = machineOrderIndex(b);
  if (ai !== bi) return ai - bi;
  return String(a?.label || "").localeCompare(
    String(b?.label || ""),
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );
}

function relayoutMachinesInZones(elements) {
  const all = Array.isArray(elements) ? elements : [];
  const zones = all.filter((e) => e?.type === ELEMENT_TYPES.ZONE);
  if (!zones.length) return all;
  const machines = all.filter((e) => e?.type === ELEMENT_TYPES.MACHINE);
  if (!machines.length) return all;

  const grouped = new Map();
  for (const z of zones) grouped.set(String(z.id), []);
  for (const m of machines) {
    const z = zoneForMachineByMeta(m, zones);
    if (!z) continue;
    const zid = String(z.id);
    if (!grouped.has(zid)) grouped.set(zid, []);
    grouped.get(zid).push(m);
  }

  const nextMachineById = new Map();
  for (const z of zones) {
    const zid = String(z.id);
    const list = grouped.get(zid) || [];
    if (!list.length) continue;

    list.sort(sortMachinesForZone);

    const zx = Number(z?.x) || 0;
    const zy = Number(z?.y) || 0;
    const zw = Number(z?.w) || 0;
    const zh = Number(z?.h) || 0;
    const total = list.length;
    const cols = 10;
    const rows = Math.max(3, Math.ceil(total / cols));

    const headerH = Math.min(0.08, Math.max(0.035, zh * 0.15));
    const bodyPad = Math.max(0.004, zw * 0.01);
    const bodyX = zx + bodyPad;
    const bodyY = zy + headerH + bodyPad;
    const bodyW = Math.max(0.02, zw - bodyPad * 2);
    const bodyH = Math.max(0.02, zh - headerH - bodyPad * 2);
    const gapX = Math.max(0.002, bodyW * 0.01);
    const gapY = Math.max(0.002, bodyH * 0.02);
    const cellW = Math.max(0.01, (bodyW - gapX * (cols - 1)) / cols);
    const cellH = Math.max(0.01, (bodyH - gapY * (rows - 1)) / rows);
    const itemPad = Math.max(0.001, Math.min(cellW, cellH) * 0.08);

    for (let i = 0; i < list.length; i += 1) {
      const m = list[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const mw = clamp(cellW - itemPad * 2, 0.01, 1);
      const mh = clamp(cellH - itemPad * 2, 0.01, 1);
      const mx = clamp(bodyX + col * (cellW + gapX) + itemPad, 0, 1 - mw);
      const my = clamp(bodyY + row * (cellH + gapY) + itemPad, 0, 1 - mh);
      nextMachineById.set(String(m.id), {
        ...m,
        x: mx,
        y: my,
        w: mw,
        h: mh,
        meta: {
          ...(m?.meta || {}),
          zoneId: zid,
          zoneName: String(z?.label || ""),
          slotIndex: i,
        },
      });
    }
  }

  return all.map((el) => {
    if (el?.type !== ELEMENT_TYPES.MACHINE) return el;
    return nextMachineById.get(String(el.id)) || el;
  });
}

function normalizeLayoutForEditing(layoutLike) {
  const base = withThreeDDefaults(layoutLike);
  const clamped = clampZonesAndContainedElementsToFloor(base.elements || []);
  const withMachines = relayoutMachinesInZones(clamped);
  const zones = withMachines.filter((e) => e?.type === ELEMENT_TYPES.ZONE);
  const floors = withMachines.filter((e) => e?.type === ELEMENT_TYPES.FLOOR);
  const updatedFloors = expandFloorForZones(floors, zones);
  const floorById = new Map(updatedFloors.map((f) => [String(f.id), f]));
  const rebuilt = withMachines.map((e) => {
    if (e?.type !== ELEMENT_TYPES.FLOOR) return e;
    return floorById.get(String(e.id)) || e;
  });
  const hadFloor = withMachines.some((e) => e?.type === ELEMENT_TYPES.FLOOR);
  if (!hadFloor && updatedFloors.length) rebuilt.push(updatedFloors[0]);
  const nextPlaneScale = computePlaneScaleFromElements(rebuilt);
  return {
    ...base,
    threeD: {
      ...(base?.threeD || {}),
      planeScale: Math.max(1, nextPlaneScale),
    },
    elements: rebuilt,
  };
}

function withThreeDDefaults(layout) {
  const normalized = normalizeLayout(layout);
  const threeD =
    normalized.threeD && typeof normalized.threeD === "object"
      ? normalized.threeD
      : {};
  const planeScale = Number.isFinite(Number(threeD.planeScale))
    ? Number(threeD.planeScale)
    : 1;

  return {
    ...normalized,
    threeD: {
      ...threeD,
      floorModelUrl: threeD.floorModelUrl || "/models/floor-model.glb",
      floorModelScale: Number.isFinite(Number(threeD.floorModelScale))
        ? Number(threeD.floorModelScale)
        : 1,
      floorModelAutoRotate: !!threeD.floorModelAutoRotate,
      planeScale,
    },
  };
}

function mergeLayoutWithDepartment(layout, department) {
  const dept = department && typeof department === "object" ? department : null;
  const base = withThreeDDefaults(layout);

  // If we don't have department data, nothing to sync against.
  if (!dept) return base;

  const baseElements = Array.isArray(base.elements) ? base.elements : [];

  // Check if user has a custom/saved layout with predefined floor
  const hasFloor = baseElements.some((e) => e?.type === ELEMENT_TYPES.FLOOR);
  const hasPredefinedFloor = baseElements.some(
    (e) =>
      e?.type === ELEMENT_TYPES.FLOOR &&
      e?.modelUrl &&
      (e.modelUrl.includes("/models/pre-defined-models/") ||
        e.modelUrl.includes("?predef=true")),
  );

  // IMPORTANT: If user has a predefined floor, don't add ANY auto-generated content
  // Only render what the user explicitly added/saved
  // This prevents auto-layout zones/machines from appearing with custom floor plans
  if (hasPredefinedFloor) {
    return base;
  }

  // If there are ANY saved elements beyond just a default floor, respect the user's layout
  // and don't auto-add zones/machines (user is customizing)
  const hasCustomElements = baseElements.some(
    (e) =>
      e?.type === ELEMENT_TYPES.ZONE ||
      e?.type === ELEMENT_TYPES.MACHINE ||
      e?.type === ELEMENT_TYPES.WALKWAY ||
      e?.type === ELEMENT_TYPES.TRANSPORTER,
  );

  // Generate the current auto-layout from the department so we can borrow positions
  // for any newly-added zones/machines (only for default/auto-layout mode).
  const auto = withThreeDDefaults(createDefaultLayoutForDepartment(dept));
  const autoElements = Array.isArray(auto.elements) ? auto.elements : [];
  const autoById = new Map(autoElements.map((e) => [String(e.id), e]));
  const autoMachineById = new Map(
    autoElements
      .filter((e) => e?.type === ELEMENT_TYPES.MACHINE && e?.machineId)
      .map((e) => [String(e.machineId), e]),
  );

  const existingZoneElementIds = new Set(
    baseElements
      .filter((e) => e?.type === ELEMENT_TYPES.ZONE)
      .map((e) => String(e.id)),
  );
  const existingMachineIds = new Set(
    baseElements
      .filter((e) => e?.type === ELEMENT_TYPES.MACHINE && e?.machineId)
      .map((e) => String(e.machineId)),
  );

  const toAdd = [];

  // Only add auto-generated floor if user hasn't customized
  if (!hasFloor) {
    const floor =
      autoElements.find((e) => e?.type === ELEMENT_TYPES.FLOOR) ||
      autoById.get("floor-1");
    if (floor) toAdd.push(floor);
  }

  // If user has started customizing (has any zones, machines, walkways),
  // DON'T auto-add zones to respect their custom layout
  // Only auto-add zones if this is a completely fresh/default layout
  const shouldAutoAddZones = !hasCustomElements && baseElements.length === 0;

  if (shouldAutoAddZones) {
    const zones = Array.isArray(dept?.zones) ? dept.zones : [];
    for (let zi = 0; zi < zones.length; zi += 1) {
      const z = zones[zi];
      const zoneId = String(z?.id || "").trim();
      if (!zoneId) continue;

      // Our default layout uses ids like: `zone-${zone.id}`.
      const zoneElementId = `zone-${zoneId}`;
      if (!existingZoneElementIds.has(zoneElementId)) {
        const fromAuto = autoById.get(zoneElementId);
        toAdd.push(
          fromAuto || {
            id: zoneElementId,
            type: ELEMENT_TYPES.ZONE,
            label: z?.name || `Zone ${zi + 1}`,
            x: 0.12,
            y: 0.12,
            w: 0.22,
            h: 0.18,
            rotationDeg: 0,
            color: "dark-green",
          },
        );
      }
    }
  }

  // For machines: only auto-add if this is a completely fresh layout
  // This prevents auto-adding machines when user has a custom/predefined floor
  const shouldAutoAddMachines = !hasCustomElements && baseElements.length === 0;

  if (shouldAutoAddMachines) {
    const zones = Array.isArray(dept?.zones) ? dept.zones : [];
    for (const z of zones) {
      const machines = Array.isArray(z?.machines) ? z.machines : [];
      for (const m of machines) {
        const mid = String(m?.id || "").trim();
        if (!mid) continue;
        if (existingMachineIds.has(mid)) continue;

        const fromAuto = autoMachineById.get(mid);
        toAdd.push(
          fromAuto || {
            id: `machine-${mid}`,
            type: ELEMENT_TYPES.MACHINE,
            machineId: mid,
            x: 0.16,
            y: 0.16,
            w: 0.06,
            h: 0.06,
            rotationDeg: 0,
          },
        );
      }
    }
  }

  if (!toAdd.length) return base;

  // Normalize again to ensure any synthesized elements match expected shape.
  return withThreeDDefaults({
    ...base,
    elements: [...baseElements, ...toAdd],
  });
}

export default function Department3DLayoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { departmentId } = useParams();

  const fullscreenRef = useRef(null);
  const lastPointerRef = useRef({ x: 0.5, y: 0.5 });
  const lastCursorRef = useRef({ x: 0, y: 0 });
  const toastTimerRef = useRef(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deptResult, setDeptResult] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showMachineMarkers, setShowMachineMarkers] = useState(true);
  const [showMachineLabels, setShowMachineLabels] = useState(false);
  const [machineStatusVisibility, setMachineStatusVisibility] = useState({
    RUNNING: true,
    IDLE: true,
    DOWN: true,
    // MAINTENANCE: true, // TEMP commented
    // OFF: true, // TEMP commented
    ALL: true,
  });
  const [machineForm, setMachineForm] = useState({
    zoneName: "",
    machineName: "",
  });
  const [machineFormError, setMachineFormError] = useState("");
  const [pendingMachinePlacement, setPendingMachinePlacement] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null); // { id, position: { x, y } }
  const [nameInputDialog, setNameInputDialog] = useState(null); // { type: 'floor'|'zone'|'walkway', pending: true }
  const [nameInput, setNameInput] = useState("");
  const [selectedFloorModelUrl, setSelectedFloorModelUrl] = useState("");
  const [selectedFloorModelLabel, setSelectedFloorModelLabel] = useState("");
  const defaultFloorModelUrl = FLOOR_MODEL_OPTIONS[0]?.url || "";
  const defaultFloorModelLabel = FLOOR_MODEL_OPTIONS[0]?.label || "";
  const [showFloorPicker, setShowFloorPicker] = useState(false);

  const [activeTool, setActiveTool] = useState("select");
  const [selectedId, setSelectedId] = useState("");
  const [focusedZoneId, setFocusedZoneId] = useState("");
  const [zoneRearrangeMode, setZoneRearrangeMode] = useState(false);
  const [zoneSwapSourceId, setZoneSwapSourceId] = useState("");
  const [zoneMergeMode, setZoneMergeMode] = useState(false);
  const [zoneMergeSelectedIds, setZoneMergeSelectedIds] = useState([]);
  const [zoneMergeName, setZoneMergeName] = useState("");
  const [machineRearrangeMode, setMachineRearrangeMode] = useState(false);
  const [machineSwapSourceId, setMachineSwapSourceId] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  // TEMP: feature switches for staged rollout. Set to false to re-enable.
  const TEMP_DISABLE_ADD_MACHINE = true;
  const TEMP_DISABLE_ADD_TRANSPORTER = true;
  const TEMP_DISABLE_ADD_ZONE = true;
  const TEMP_DISABLE_COMBINE_ZONES = true;
  const TEMP_DISABLE_LAYOUT_HISTORY = true;

  const requestedLayoutView = location.state?.layoutView;
  const handlePointerPositionChange = useCallback((pos) => {
    if (!pos) return;
    const x = clamp(pos.x, 0, 1);
    const y = clamp(pos.y, 0, 1);
    lastPointerRef.current = { x, y };
  }, []);

  const handleCursorMove = useCallback((e) => {
    if (!e) return;
    lastCursorRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const navToast = location.state?.toast;

  const [toast, setToast] = useState(null);
  const pushToast = useCallback((payload) => {
    if (!payload) return;
    setToast(payload);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const [layoutVersions, setLayoutVersions] = useState({
    current: null,
    previous: null,
  });
  const [layoutView, setLayoutView] = useState("current");

  const plantName = location.state?.plantName || "";

  const openFloorDialog = () => {
    setNameInput("");
    setNameInputDialog({ type: "floor" });
    setSelectedFloorModelUrl(defaultFloorModelUrl);
    setSelectedFloorModelLabel(defaultFloorModelLabel);
    setShowFloorPicker(false);
  };

  const applyFloorSelection = useCallback(
    ({ modelUrl, label }) => {
      const floorModelUrl = String(
        modelUrl || defaultFloorModelUrl || "",
      ).trim();
      if (!floorModelUrl) return;
      const floorLabel = String(
        label || defaultFloorModelLabel || "Floor",
      ).trim();
      const nextFloorId = `floor-${nanoid(6)}`;

      setDraft((prev) => {
        if (!prev) return prev;
        const list = Array.isArray(prev.elements) ? prev.elements : [];
        const existingFloors = list.filter(
          (e) => e?.type === ELEMENT_TYPES.FLOOR,
        );
        const zones = list.filter((e) => e?.type === ELEMENT_TYPES.ZONE);
        const withoutFloors = list.filter(
          (e) => e?.type !== ELEMENT_TYPES.FLOOR,
        );

        const baseFloor = existingFloors[0]
          ? {
              ...existingFloors[0],
              label: floorLabel || existingFloors[0].label || "Floor",
              modelUrl: floorModelUrl,
            }
          : {
              id: nextFloorId,
              type: ELEMENT_TYPES.FLOOR,
              label: floorLabel || "Floor",
              modelUrl: floorModelUrl,
              rotationDeg: 0,
              x: 0.02,
              y: 0.02,
              w: 0.96,
              h: 0.96,
            };

        const sizedFloors = expandFloorForZones([baseFloor], zones);
        const singleFloor = sizedFloors[0] || baseFloor;
        return {
          ...prev,
          elements: [singleFloor, ...withoutFloors],
        };
      });

      setActiveTool("select");
      setNameInputDialog(null);
      setNameInput("");
      setShowFloorPicker(false);
      setSelectedFloorModelUrl(floorModelUrl);
      setSelectedFloorModelLabel(floorLabel);
      pushToast({
        kind: "success",
        message: `Floor applied: ${floorLabel}.`,
        ts: Date.now(),
      });
    },
    [defaultFloorModelLabel, defaultFloorModelUrl, pushToast],
  );

  const layoutCtx = useMemo(() => {
    return {
      factoryId: deptResult?.factory?.id || "",
      plantId: deptResult?.plant?.id || "",
      departmentId: departmentId || "",
    };
  }, [deptResult, departmentId]);

  useEffect(() => {
    if (TEMP_DISABLE_LAYOUT_HISTORY) {
      setLayoutView("current");
      return;
    }
    const v = location.state?.layoutView;
    if (v === "previous" || v === "current") setLayoutView(v);
  }, [location.state?.layoutView, TEMP_DISABLE_LAYOUT_HISTORY]);

  useEffect(() => {
    if (!departmentId) return;
    let cancelled = false;

    (async () => {
      try {
        setError("");
        setLoading(true);
        const result = await getDepartmentLayout(departmentId);
        if (cancelled) return;

        setDeptResult(result);

        const versions = await fetchDepartmentCustomLayoutVersions({
          factoryId: result?.factory?.id || "",
          plantId: result?.plant?.id || "",
          departmentId: departmentId || "",
        });
        setLayoutVersions(versions);

        const initialView =
          !TEMP_DISABLE_LAYOUT_HISTORY && requestedLayoutView === "previous"
            ? "previous"
            : "current";
        setLayoutView(initialView);

        const base =
          (initialView === "previous"
            ? versions?.previous
            : versions?.current) ||
          result?.customLayout ||
          createDefaultLayoutForDepartment(result?.department);
        setDraft(
          normalizeLayoutForEditing(
            mergeLayoutWithDepartment(base, result?.department),
          ),
        );
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load department");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [departmentId, requestedLayoutView, TEMP_DISABLE_LAYOUT_HISTORY]);

  useEffect(() => {
    if (!layoutCtx?.departmentId) return;
    let cancelled = false;
    (async () => {
      const versions = await fetchDepartmentCustomLayoutVersions(layoutCtx);
      if (!cancelled) setLayoutVersions(versions);
    })();
    return () => {
      cancelled = true;
    };
  }, [layoutCtx]);

  useEffect(() => {
    const onFsChange = () => {
      const isFs =
        typeof document !== "undefined" && !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (!isFs) {
        setActiveTool("select");
      }
      // Clear toast when transitioning between fullscreen modes
      setToast(null);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = 0;
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    onFsChange();
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!pendingMachinePlacement) return;
    if (activeTool === "add:machine") return;
    setPendingMachinePlacement(null);
  }, [activeTool, pendingMachinePlacement]);

  useEffect(() => {
    if (activeTool === "add:machine") return;
    setFocusedZoneId("");
  }, [activeTool]);

  useEffect(() => {
    if (!draft) return;
    const walkways = (draft.elements || []).filter(
      (e) =>
        e?.type === ELEMENT_TYPES.WALKWAY && e?.meta?.source !== "left-panel",
    );
    if (!walkways.length) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            elements: (prev.elements || []).filter(
              (e) =>
                !(
                  e?.type === ELEMENT_TYPES.WALKWAY &&
                  e?.meta?.source !== "left-panel"
                ),
            ),
          }
        : prev,
    );
  }, [draft]);

  useEffect(() => {
    if (!pendingMachinePlacement) return;
    if (isFullscreen) return;
    setPendingMachinePlacement(null);
  }, [isFullscreen, pendingMachinePlacement]);

  useEffect(() => {
    if (!navToast?.ts) return;
    pushToast({
      kind: navToast.kind || "success",
      message: navToast.message || "Saved",
      ts: navToast.ts,
    });
  }, [navToast, pushToast]);

  // Auto-save disabled - only save when user clicks Save button
  // useEffect(() => {
  //   if (!draft || !layoutCtx?.departmentId) return;
  //   if (!isFullscreen) return; // Only auto-save in fullscreen edit mode
  //
  //   const timeoutId = setTimeout(() => {
  //     saveDepartmentCustomLayout(layoutCtx, draft);
  //   }, 1000); // Debounce by 1 second
  //
  //   return () => clearTimeout(timeoutId);
  // }, [draft, layoutCtx, isFullscreen]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const machineMetaById = useMemo(() => {
    const zones = deptResult?.department?.zones || [];
    const out = {};
    for (const z of zones) {
      for (const m of z?.machines || []) {
        if (!m) continue;
        const id = String(m.id || "");
        if (!id) continue;
        out[id] = {
          ...m,
          id,
          name: m?.name || id,
          status: m?.status || "RUNNING",
          zoneName: z?.name || "",
        };
      }
    }

    const fallbackPlantId = layoutCtx?.plantId || "";
    const fallbackDepartmentId = layoutCtx?.departmentId || "";
    for (const el of draft?.elements || []) {
      if (!el || el.type !== ELEMENT_TYPES.MACHINE) continue;
      const machineId = String(el.machineId || "").trim();
      if (!machineId || out[machineId]) continue;

      const meta = el.meta && typeof el.meta === "object" ? el.meta : {};
      out[machineId] = {
        id: machineId,
        name: meta.machineName || el.label || machineId,
        status: meta.status || "RUNNING",
        zoneName: meta.zoneName || "",
        plantId: meta.plantId || fallbackPlantId,
        departmentId: meta.departmentId || fallbackDepartmentId,
      };
    }

    return out;
  }, [deptResult, draft, layoutCtx]);

  const onOpenMachineDetails = (machineId) => {
    const mid = String(machineId || "");
    if (!mid) return;
    const m = machineMetaById?.[mid] || null;
    if (!m?.id) return;

    navigate(`/departments/${departmentId}/machines/${m.id}`, {
      state: {
        backgroundLocation: location,
        machine: m,
        context: {
          department:
            deptResult?.department?.name || `Department ${departmentId}`,
          plant: deptResult?.plant?.name || plantName,
        },
        fetchedAt: deptResult?.meta?.fetchedAt || "",
      },
    });
  };

  const onCancel = () => {
    // With the 2D department page removed, prefer going back to where the user came from.
    // If this page was opened directly, fall back to the dashboard.
    if (location.state?.fromDashboard) {
      navigate(-1);
      return;
    }

    navigate("/dashboard");
  };

  // Delete element handler
  const handleDeleteElement = (elementId) => {
    if (!elementId || !draft) return;

    setDraft((prev) =>
      prev
        ? {
            ...prev,
            elements: (prev.elements || []).filter(
              (e) => String(e.id) !== String(elementId),
            ),
          }
        : prev,
    );
    setSelectedId("");
    setDeleteConfirmation(null);
    pushToast({
      kind: "success",
      message: "Element deleted",
      ts: Date.now(),
    });
  };

  // Keyboard event handler for delete
  useEffect(() => {
    if (!isFullscreen || !selectedId) return;

    const handleKeyDown = (e) => {
      // Check if 'x' or 'X' or 'Delete' key is pressed
      if (
        (e.key === "x" || e.key === "X" || e.key === "Delete") &&
        selectedId
      ) {
        e.preventDefault();

        // Get cursor position for popup
        const container = fullscreenRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const lastCursor = lastCursorRef.current || {};
        const x = Number.isFinite(lastCursor.x)
          ? lastCursor.x
          : rect.left + rect.width / 2;
        const y = Number.isFinite(lastCursor.y)
          ? lastCursor.y
          : rect.top + rect.height / 2;

        setDeleteConfirmation({
          id: selectedId,
          position: { x, y },
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, selectedId]);

  const toggleFullscreen = async () => {
    try {
      const el = fullscreenRef.current;
      if (!el || typeof document === "undefined") return;

      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (typeof el.requestFullscreen === "function") {
        await el.requestFullscreen();
      }
    } catch {
      // ignore (fullscreen may be blocked by browser settings)
    }
  };

  const onSave = async () => {
    if (!draft) return;
    const payload = normalizeLayoutForEditing(draft);
    setDraft(payload);
    try {
      const saved = await saveDepartmentCustomLayout(layoutCtx, payload);
      if (saved && typeof saved === "object") {
        setLayoutVersions({
          current: saved.current || payload,
          previous: saved.previous || null,
        });
        setDeptResult((prev) =>
          prev
            ? {
                ...prev,
                customLayout: saved.current || payload,
              }
            : prev,
        );
      }
    } catch {
      pushToast({
        kind: "error",
        message: "Save failed. Check login/session and try again.",
        ts: Date.now(),
      });
      return;
    }
    setLayoutView("current");
    // Show toast immediately when saving
    pushToast({
      kind: "success",
      message: "Department layout saved",
      ts: Date.now(),
    });
  };

  const onReset = () => {
    deleteDepartmentCustomLayout(layoutCtx);
    const base = createDefaultLayoutForDepartment(deptResult?.department);
    setDraft(normalizeLayoutForEditing(base));
    setLayoutVersions({ current: null, previous: null });
    setLayoutView("current");
    setZoneRearrangeMode(false);
    setZoneSwapSourceId("");
    setZoneMergeMode(false);
    setZoneMergeSelectedIds([]);
    setZoneMergeName("");
    setMachineRearrangeMode(false);
    setMachineSwapSourceId("");
  };

  const handleZoneSwapPick = useCallback(
    (pickedZoneId) => {
      const targetId = String(pickedZoneId || "").trim();
      if (!targetId) return;

      if (!zoneSwapSourceId) {
        setZoneSwapSourceId(targetId);
        pushToast({
          kind: "info",
          message: "Zone selected. Click another zone to swap positions.",
          ts: Date.now(),
        });
        return;
      }

      if (zoneSwapSourceId === targetId) {
        setZoneSwapSourceId("");
        pushToast({
          kind: "info",
          message: "Zone swap canceled.",
          ts: Date.now(),
        });
        return;
      }

      setDraft((prev) => {
        if (!prev) return prev;
        const list = Array.isArray(prev.elements) ? prev.elements : [];
        const src = list.find(
          (e) =>
            e?.type === ELEMENT_TYPES.ZONE &&
            String(e?.id) === String(zoneSwapSourceId),
        );
        const dst = list.find(
          (e) =>
            e?.type === ELEMENT_TYPES.ZONE &&
            String(e?.id) === String(targetId),
        );
        if (!src || !dst) return prev;

        const srcRect = {
          x: Number(src?.x) || 0,
          y: Number(src?.y) || 0,
          w: Math.max(0.02, Number(src?.w) || 0.2),
          h: Math.max(0.02, Number(src?.h) || 0.16),
        };
        const dstRect = {
          x: Number(dst?.x) || 0,
          y: Number(dst?.y) || 0,
          w: Math.max(0.02, Number(dst?.w) || 0.2),
          h: Math.max(0.02, Number(dst?.h) || 0.16),
        };

        const centerInside = (el, r) => {
          const ex = Number(el?.x) || 0;
          const ey = Number(el?.y) || 0;
          const ew = Number(el?.w) || 0;
          const eh = Number(el?.h) || 0;
          const cx = ex + ew / 2;
          const cy = ey + eh / 2;
          return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
        };

        const belongsToZone = (el, zone, zoneRect) => {
          if (
            !el ||
            el?.type === ELEMENT_TYPES.FLOOR ||
            el?.type === ELEMENT_TYPES.ZONE
          )
            return false;
          const zoneId = String(zone?.id || "");
          const zoneName = String(zone?.label || "").trim();
          const metaZoneId = String(el?.meta?.zoneId || "").trim();
          const metaZoneName = String(el?.meta?.zoneName || "").trim();
          if (metaZoneId) return metaZoneId === zoneId;
          if (metaZoneName) return metaZoneName === zoneName;
          return centerInside(el, zoneRect);
        };

        const moveElementBetweenZones = (el, fromRect, toRect) => {
          const ex = Number(el?.x) || 0;
          const ey = Number(el?.y) || 0;
          const ew = Math.max(0.01, Number(el?.w) || 0.08);
          const eh = Math.max(0.01, Number(el?.h) || 0.08);

          const relX = (ex - fromRect.x) / Math.max(0.0001, fromRect.w);
          const relY = (ey - fromRect.y) / Math.max(0.0001, fromRect.h);
          const relW = ew / Math.max(0.0001, fromRect.w);
          const relH = eh / Math.max(0.0001, fromRect.h);

          const nw = clamp(relW * toRect.w, 0.01, 0.5);
          const nh = clamp(relH * toRect.h, 0.01, 0.5);
          const nx = clamp(toRect.x + relX * toRect.w, 0, 1 - nw);
          const ny = clamp(toRect.y + relY * toRect.h, 0, 1 - nh);

          const next = {
            ...el,
            x: nx,
            y: ny,
            w: nw,
            h: nh,
          };
          return next;
        };

        let swapped = list.map((el) => {
          if (el?.type === ELEMENT_TYPES.ZONE) {
            const id = String(el?.id);
            if (id === String(src.id)) {
              return { ...el, ...dstRect };
            }
            if (id === String(dst.id)) {
              return { ...el, ...srcRect };
            }
            return el;
          }

          if (belongsToZone(el, src, srcRect)) {
            return moveElementBetweenZones(el, srcRect, dstRect);
          }
          if (belongsToZone(el, dst, dstRect)) {
            return moveElementBetweenZones(el, dstRect, srcRect);
          }
          return el;
        });
        const srcZoneIndex = swapped.findIndex(
          (e) =>
            e?.type === ELEMENT_TYPES.ZONE &&
            String(e?.id || "") === String(src?.id || ""),
        );
        const dstZoneIndex = swapped.findIndex(
          (e) =>
            e?.type === ELEMENT_TYPES.ZONE &&
            String(e?.id || "") === String(dst?.id || ""),
        );
        if (
          srcZoneIndex >= 0 &&
          dstZoneIndex >= 0 &&
          srcZoneIndex !== dstZoneIndex
        ) {
          const next = [...swapped];
          const tmp = next[srcZoneIndex];
          next[srcZoneIndex] = next[dstZoneIndex];
          next[dstZoneIndex] = tmp;
          swapped = next;
        }
        const normalized = relayoutMachinesInZones(swapped);
        return { ...prev, elements: normalized };
      });

      setZoneSwapSourceId("");
      setSelectedId(targetId);
      setFocusedZoneId("");
      pushToast({
        kind: "success",
        message: "Zones swapped successfully. Click Save to DB to persist.",
        ts: Date.now(),
      });
    },
    [zoneSwapSourceId, pushToast],
  );

  const handleMachineSwapPick = useCallback(
    (pickedMachineId) => {
      const targetId = String(pickedMachineId || "").trim();
      if (!targetId) return;

      if (!focusedZoneId) {
        pushToast({
          kind: "info",
          message: "Open a zone first, then rearrange machines in that zone.",
          ts: Date.now(),
        });
        return;
      }

      if (!machineSwapSourceId) {
        setMachineSwapSourceId(targetId);
        pushToast({
          kind: "info",
          message:
            "Machine selected. Click another machine in this zone to swap.",
          ts: Date.now(),
        });
        return;
      }

      if (machineSwapSourceId === targetId) {
        setMachineSwapSourceId("");
        pushToast({
          kind: "info",
          message: "Machine swap canceled.",
          ts: Date.now(),
        });
        return;
      }

      setDraft((prev) => {
        if (!prev) return prev;
        const list = Array.isArray(prev.elements) ? prev.elements : [];
        const zones = list.filter((e) => e?.type === ELEMENT_TYPES.ZONE);
        const focusZone = zones.find(
          (z) => String(z?.id) === String(focusedZoneId),
        );
        if (!focusZone) return prev;

        const src = list.find(
          (e) =>
            e?.type === ELEMENT_TYPES.MACHINE &&
            String(e?.id) === String(machineSwapSourceId),
        );
        const dst = list.find(
          (e) =>
            e?.type === ELEMENT_TYPES.MACHINE &&
            String(e?.id) === String(targetId),
        );
        if (!src || !dst) return prev;

        const srcZone = zoneForMachineByMeta(src, zones);
        const dstZone = zoneForMachineByMeta(dst, zones);
        const sameFocusedZone =
          srcZone &&
          dstZone &&
          String(srcZone?.id) === String(focusZone?.id) &&
          String(dstZone?.id) === String(focusZone?.id);
        if (!sameFocusedZone) {
          pushToast({
            kind: "info",
            message: "Swap is allowed only inside the opened zone.",
            ts: Date.now(),
          });
          return prev;
        }

        const zoneMachines = list
          .filter((e) => e?.type === ELEMENT_TYPES.MACHINE)
          .filter(
            (e) =>
              String(zoneForMachineByMeta(e, zones)?.id || "") ===
              String(focusZone?.id || ""),
          )
          .sort(sortMachinesForZone);

        const indexById = new Map(
          zoneMachines.map((m, i) => [String(m?.id || ""), i]),
        );
        const srcIdx = indexById.get(String(src?.id || ""));
        const dstIdx = indexById.get(String(dst?.id || ""));
        if (!Number.isFinite(srcIdx) || !Number.isFinite(dstIdx)) return prev;

        const swapped = list.map((el) => {
          if (el?.type !== ELEMENT_TYPES.MACHINE) return el;
          const id = String(el?.id || "");
          if (!indexById.has(id)) return el;

          const currentIndex = indexById.get(id);
          let nextIndex = currentIndex;
          if (id === String(src?.id || "")) nextIndex = dstIdx;
          if (id === String(dst?.id || "")) nextIndex = srcIdx;

          return {
            ...el,
            meta: {
              ...(el?.meta || {}),
              zoneId: String(focusZone?.id || ""),
              zoneName: String(focusZone?.label || ""),
              slotIndex: nextIndex,
            },
          };
        });
        return { ...prev, elements: swapped };
      });

      setMachineSwapSourceId("");
      pushToast({
        kind: "success",
        message: "Machines swapped in zone. Click Save to DB to persist.",
        ts: Date.now(),
      });
    },
    [focusedZoneId, machineSwapSourceId, pushToast],
  );

  const handleZoneMergePick = useCallback(
    (pickedZoneId) => {
      if (TEMP_DISABLE_COMBINE_ZONES) return;
      const zoneId = String(pickedZoneId || "").trim();
      if (!zoneId) return;
      setZoneMergeSelectedIds((prev) => {
        const exists = prev.some((id) => String(id) === zoneId);
        if (exists) return prev.filter((id) => String(id) !== zoneId);
        return [...prev, zoneId];
      });
    },
    [TEMP_DISABLE_COMBINE_ZONES],
  );

  const handleMergeSelectedZones = useCallback(() => {
    if (TEMP_DISABLE_COMBINE_ZONES) {
      pushToast({
        kind: "info",
        message: "Combine zones is temporarily disabled.",
        ts: Date.now(),
      });
      return;
    }
    if (!draft) return;
    const elements = Array.isArray(draft.elements) ? draft.elements : [];
    const zones = elements.filter((e) => e?.type === ELEMENT_TYPES.ZONE);
    const selectedZones = zones.filter((z) =>
      zoneMergeSelectedIds.some((id) => String(id) === String(z?.id)),
    );
    if (selectedZones.length < 2) {
      pushToast({
        kind: "info",
        message: "Select at least 2 zones to combine.",
        ts: Date.now(),
      });
      return;
    }

    const trimmedName = String(zoneMergeName || "").trim();
    const fallbackName = `Zone ${nanoid(4).toUpperCase()}`;
    const mergedLabel = trimmedName || fallbackName;
    const nameTaken = zones.some(
      (z) =>
        !zoneMergeSelectedIds.some((id) => String(id) === String(z?.id)) &&
        String(z?.label || "")
          .trim()
          .toLowerCase() === mergedLabel.toLowerCase(),
    );
    if (nameTaken) {
      pushToast({
        kind: "info",
        message: "Merged zone name already exists. Use a unique name.",
        ts: Date.now(),
      });
      return;
    }

    const selectedIds = new Set(selectedZones.map((z) => String(z?.id || "")));
    const selectedNames = new Set(
      selectedZones.map((z) => String(z?.label || "").trim()),
    );
    const mergedZoneId = `zone-${nanoid(8)}`;

    const minX = Math.max(
      0,
      Math.min(...selectedZones.map((z) => Number(z?.x) || 0)),
    );
    const minY = Math.max(
      0,
      Math.min(...selectedZones.map((z) => Number(z?.y) || 0)),
    );
    const maxX = Math.min(
      1,
      Math.max(
        ...selectedZones.map((z) => (Number(z?.x) || 0) + (Number(z?.w) || 0)),
      ),
    );
    const maxY = Math.min(
      1,
      Math.max(
        ...selectedZones.map((z) => (Number(z?.y) || 0) + (Number(z?.h) || 0)),
      ),
    );

    const isInsideZone = (el, zone) => {
      const ex = Number(el?.x) || 0;
      const ey = Number(el?.y) || 0;
      const ew = Number(el?.w) || 0;
      const eh = Number(el?.h) || 0;
      const cx = ex + ew / 2;
      const cy = ey + eh / 2;
      const zx = Number(zone?.x) || 0;
      const zy = Number(zone?.y) || 0;
      const zw = Number(zone?.w) || 0;
      const zh = Number(zone?.h) || 0;
      return cx >= zx && cx <= zx + zw && cy >= zy && cy <= zy + zh;
    };

    const shouldMoveIntoMergedZone = (el) => {
      if (
        !el ||
        el?.type === ELEMENT_TYPES.FLOOR ||
        el?.type === ELEMENT_TYPES.ZONE
      ) {
        return false;
      }
      const metaZoneId = String(el?.meta?.zoneId || "").trim();
      if (metaZoneId && selectedIds.has(metaZoneId)) return true;
      const metaZoneName = String(el?.meta?.zoneName || "").trim();
      if (metaZoneName && selectedNames.has(metaZoneName)) return true;
      return selectedZones.some((z) => isInsideZone(el, z));
    };

    const updatedElements = [];
    for (const el of elements) {
      if (
        el?.type === ELEMENT_TYPES.ZONE &&
        selectedIds.has(String(el?.id || ""))
      ) {
        continue;
      }
      if (shouldMoveIntoMergedZone(el)) {
        const meta = el?.meta || {};
        const restMeta = { ...meta };
        delete restMeta.slotIndex;
        updatedElements.push({
          ...el,
          meta: {
            ...restMeta,
            zoneId: mergedZoneId,
            zoneName: mergedLabel,
          },
        });
      } else {
        updatedElements.push(el);
      }
    }

    updatedElements.push({
      id: mergedZoneId,
      type: ELEMENT_TYPES.ZONE,
      label: mergedLabel,
      x: minX,
      y: minY,
      w: Math.max(0.12, maxX - minX),
      h: Math.max(0.1, maxY - minY),
      rotationDeg: 0,
      color: selectedZones[0]?.color || "dark-green",
      modelUrl: selectedZones[0]?.modelUrl || "/models/zone-green.glb",
      scale: Number(selectedZones[0]?.scale) || 1,
    });

    const reflowed = reflowZonesAndContainedElements(updatedElements);
    const relayout = relayoutMachinesInZones(reflowed);
    const nextZones = relayout.filter((e) => e?.type === ELEMENT_TYPES.ZONE);
    const nextFloors = relayout.filter((e) => e?.type === ELEMENT_TYPES.FLOOR);
    const resizedFloors = expandFloorForZones(nextFloors, nextZones);
    const floorById = new Map(
      resizedFloors.map((f) => [String(f?.id || ""), f]),
    );
    const normalizedElements = relayout.map((e) => {
      if (e?.type !== ELEMENT_TYPES.FLOOR) return e;
      return floorById.get(String(e?.id || "")) || e;
    });

    setDraft((prev) =>
      prev
        ? {
            ...prev,
            elements: normalizedElements,
          }
        : prev,
    );
    setFocusedZoneId(mergedZoneId);
    setSelectedId(mergedZoneId);
    setZoneMergeMode(false);
    setZoneMergeSelectedIds([]);
    setZoneMergeName("");
    setActiveTool("select");
    setPendingMachinePlacement(null);
    pushToast({
      kind: "success",
      message: "Zones combined. Click Save to DB to persist.",
      ts: Date.now(),
    });
  }, [
    draft,
    zoneMergeName,
    zoneMergeSelectedIds,
    pushToast,
    TEMP_DISABLE_COMBINE_ZONES,
  ]);

  const addMachineFromSidebar = () => {
    if (TEMP_DISABLE_ADD_MACHINE) {
      pushToast({
        kind: "info",
        message: "Add machine is temporarily disabled.",
        ts: Date.now(),
      });
      return;
    }
    if (!draft) {
      setMachineFormError(
        "Layout is still loading. Please try again in a second.",
      );
      return;
    }

    const chosenZone =
      (draft?.elements || []).find(
        (e) =>
          e?.type === ELEMENT_TYPES.ZONE &&
          String(e?.id) === String(focusedZoneId || selectedId || ""),
      ) || null;
    if (!chosenZone) {
      setMachineFormError("Select a zone first, then add machine.");
      return;
    }

    const zoneName = String(chosenZone?.label || "").trim();
    const machineName = machineForm.machineName.trim();
    if (!machineName) {
      setMachineFormError("Enter machine name.");
      return;
    }

    const normalized = machineName.toLowerCase();
    const existingNames = new Set();
    for (const m of Object.values(machineMetaById || {})) {
      const n = String(m?.name || "")
        .trim()
        .toLowerCase();
      if (n) existingNames.add(n);
    }
    for (const el of draft?.elements || []) {
      if (el?.type !== ELEMENT_TYPES.MACHINE) continue;
      const n1 = String(el?.label || "")
        .trim()
        .toLowerCase();
      const n2 = String(el?.meta?.machineName || "")
        .trim()
        .toLowerCase();
      if (n1) existingNames.add(n1);
      if (n2) existingNames.add(n2);
    }
    if (existingNames.has(normalized)) {
      setMachineFormError("Machine name already exists. Use a unique name.");
      return;
    }

    const machineId = `${layoutCtx?.departmentId || "dept"}-${nanoid(6)}`;
    const defaultModelUrl =
      MODEL_LIBRARY[ELEMENT_TYPES.MACHINE]?.[0]?.url || "/models/machine.glb";
    const zx = Number(chosenZone?.x) || 0;
    const zy = Number(chosenZone?.y) || 0;
    const zw = Number(chosenZone?.w) || 0.2;
    const zh = Number(chosenZone?.h) || 0.16;
    const zoneId = String(chosenZone?.id || "");
    const zoneMachines = (draft?.elements || []).filter((el) => {
      if (el?.type !== ELEMENT_TYPES.MACHINE) return false;
      const zid = String(el?.meta?.zoneId || "").trim();
      const zname = String(el?.meta?.zoneName || "").trim();
      if (zid) return zid === zoneId;
      if (zname) return zname === zoneName;
      return false;
    });
    const idx = zoneMachines.length;
    const cols = 10;
    const rows = Math.max(3, Math.ceil((idx + 1) / cols));
    const padX = Math.max(0.004, zw * 0.02);
    const padY = Math.max(0.01, zh * 0.1);
    const usableW = Math.max(0.02, zw - padX * 2);
    const usableH = Math.max(0.02, zh - padY * 2);
    const cellW = usableW / cols;
    const cellH = usableH / rows;
    const mw = clamp(cellW * 0.72, 0.01, 0.08);
    const mh = clamp(cellH * 0.72, 0.01, 0.08);
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = clamp(zx + padX + col * cellW + (cellW - mw) / 2, 0, 1 - mw);
    const y = clamp(zy + padY + row * cellH + (cellH - mh) / 2, 0, 1 - mh);

    const newId = nanoid(8);
    const machineEl = {
      id: newId,
      type: ELEMENT_TYPES.MACHINE,
      label: machineName,
      x,
      y,
      w: mw,
      h: mh,
      rotationDeg: 0,
      scale: 1,
      modelUrl: defaultModelUrl,
      machineId,
      meta: {
        plantId: layoutCtx?.plantId || "",
        departmentId: layoutCtx?.departmentId || "",
        zoneName,
        machineName,
        zoneId,
        slotIndex: idx,
        createdAt: new Date().toISOString(),
      },
    };

    setDraft((prev) => {
      if (!prev) return prev;
      const withAdded = [...(prev.elements || []), machineEl];
      const nextElements = relayoutMachinesInZones(withAdded);
      const zones = nextElements.filter((e) => e?.type === ELEMENT_TYPES.ZONE);
      const floors = nextElements.filter(
        (e) => e?.type === ELEMENT_TYPES.FLOOR,
      );
      const updatedFloors = expandFloorForZones(floors, zones);
      const floorById = new Map(updatedFloors.map((f) => [String(f.id), f]));
      const rebuilt = nextElements.map((e) => {
        if (e?.type !== ELEMENT_TYPES.FLOOR) return e;
        const nextFloor = floorById.get(String(e.id));
        return nextFloor || e;
      });
      const hadFloor = nextElements.some(
        (e) => e?.type === ELEMENT_TYPES.FLOOR,
      );
      if (!hadFloor && updatedFloors.length) rebuilt.push(updatedFloors[0]);
      const nextPlaneScale = computePlaneScaleFromElements(rebuilt);
      return {
        ...prev,
        threeD: {
          ...(prev.threeD || {}),
          planeScale: Math.max(1, nextPlaneScale),
        },
        elements: rebuilt,
      };
    });

    setSelectedId(newId);
    setMachineForm((prev) => ({ ...prev, machineName: "" }));
    setMachineFormError("");
    setPendingMachinePlacement(null);
    setFocusedZoneId(String(chosenZone?.id || ""));
    setActiveTool("add:machine");
    pushToast({
      kind: "success",
      message: `${machineName} added to ${zoneName}.`,
      ts: Date.now(),
    });
  };

  const applyLayoutView = (next) => {
    if (TEMP_DISABLE_LAYOUT_HISTORY) {
      pushToast({
        kind: "info",
        message: "Current/Previous layout switch is temporarily disabled.",
        ts: Date.now(),
      });
      return;
    }
    const v = next === "previous" ? "previous" : "current";
    setLayoutView(v);
    const chosen =
      v === "previous" ? layoutVersions?.previous : layoutVersions?.current;
    const base =
      chosen ||
      deptResult?.customLayout ||
      createDefaultLayoutForDepartment(deptResult?.department);
    setDraft(
      normalizeLayoutForEditing(
        mergeLayoutWithDepartment(base, deptResult?.department),
      ),
    );
    setSelectedId("");
    setActiveTool("select");
  };

  if (loading && !draft) {
    return (
      <div className="rounded border bg-white p-4 text-sm text-slate-600">
        Loading 2D editor…
      </div>
    );
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
    );
  }

  if (!draft) return null;

  const neutralBtnClass = isFullscreen
    ? "rounded-lg bg-yellow-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-yellow-700"
    : "rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-900";
  const floorScale = Number(draft?.threeD?.floorModelScale) || 1;

  const placeableElements = (draft?.elements || []).filter((e) =>
    [
      ELEMENT_TYPES.FLOOR,
      ELEMENT_TYPES.MACHINE,
      ELEMENT_TYPES.ZONE,
      ELEMENT_TYPES.TRANSPORTER,
    ].includes(e?.type),
  );
  const selectedElement = selectedId
    ? (draft?.elements || []).find((e) => String(e?.id) === String(selectedId))
    : null;
  const focusedZone = (draft?.elements || []).find(
    (e) =>
      e?.type === ELEMENT_TYPES.ZONE &&
      String(e?.id) === String(focusedZoneId || ""),
  );
  const activeFloor = (draft?.elements || []).find(
    (e) => e?.type === ELEMENT_TYPES.FLOOR,
  );
  const activeFloorModeLabel = floorModeLabelFromModelUrl(
    activeFloor?.modelUrl,
  );
  const zoneMergeSelectedCount = (draft?.elements || []).filter(
    (e) =>
      e?.type === ELEMENT_TYPES.ZONE &&
      zoneMergeSelectedIds.some((id) => String(id) === String(e?.id)),
  ).length;
  const machinePlacementArmed =
    isFullscreen &&
    !TEMP_DISABLE_ADD_MACHINE &&
    activeTool === "add:machine" &&
    !!pendingMachinePlacement;
  const blockedAddTool =
    (TEMP_DISABLE_ADD_MACHINE && activeTool === "add:machine") ||
    (TEMP_DISABLE_ADD_ZONE && activeTool === "add:zone") ||
    (TEMP_DISABLE_ADD_TRANSPORTER && activeTool === "add:transporter");
  const effectiveActiveTool = blockedAddTool ? "select" : activeTool;
  const viewerActiveTool = isFullscreen
    ? machinePlacementArmed
      ? "add:machine"
      : effectiveActiveTool === "add:machine"
        ? "select"
        : effectiveActiveTool
    : "select";
  const isTwoDEditor = isFullscreen;

  return (
    <div className="space-y-3 h-full flex flex-col">
      <div
        ref={fullscreenRef}
        onPointerMove={handleCursorMove}
        className={
          isFullscreen
            ? "relative h-screen w-screen bg-white p-4 flex flex-col"
            : "relative h-full w-full bg-slate-950 p-4 flex flex-col"
        }
      >
        {toast ? (
          <div className="absolute left-1/2 top-20 z-[9999] -translate-x-1/2">
            <div
              className={
                toast.kind === "success"
                  ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-lg"
                  : "rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-lg"
              }
              role="status"
              aria-live="polite"
            >
              {toast.message}
            </div>
          </div>
        ) : null}

        {/* Delete Confirmation Popup */}
        {deleteConfirmation && isFullscreen ? (
          <div
            className="fixed z-[9999]"
            style={{
              left: `${Math.min(Math.max(deleteConfirmation.position.x, 20), window.innerWidth - 20)}px`,
              top: `${Math.min(Math.max(deleteConfirmation.position.y, 20), window.innerHeight - 20)}px`,
              transform: "translate(-25%, -75%)",
            }}
          >
            <div className="rounded-lg border-2 border-red-500 bg-white p-4 shadow-2xl">
              <div className="text-sm font-semibold text-slate-900 mb-3">
                Delete this object?
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                  onClick={() => handleDeleteElement(deleteConfirmation.id)}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setDeleteConfirmation(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Name Input Dialog moved to left sidebar */}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div
              className={
                isFullscreen
                  ? "text-2xl font-semibold text-slate-900"
                  : "text-2xl font-semibold text-slate-100"
              }
            >
              {isFullscreen ? "2D Layout" : "3D Layout"} —{" "}
              {deptResult?.department?.name || `Department ${departmentId}`}
            </div>
            <div
              className={
                isFullscreen
                  ? "mt-1 text-sm text-slate-500"
                  : "mt-1 text-sm text-slate-400"
              }
            >
              Plant: {deptResult?.plant?.name || plantName || "—"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isFullscreen ? (
              // Fullscreen mode: Reset, Save to DB, Current, Previous, Exit
              <>
                <button
                  type="button"
                  className={neutralBtnClass}
                  onClick={onReset}
                >
                  Reset
                </button>
                {isTwoDEditor ? (
                  <>
                    {!TEMP_DISABLE_COMBINE_ZONES ? (
                      <button
                        type="button"
                        className={
                          zoneMergeMode
                            ? "rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
                            : "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        }
                        onClick={() => {
                          const next = !zoneMergeMode;
                          setZoneMergeMode(next);
                          setZoneMergeSelectedIds([]);
                          setZoneMergeName("");
                          setZoneRearrangeMode(false);
                          setZoneSwapSourceId("");
                          setMachineRearrangeMode(false);
                          setMachineSwapSourceId("");
                          setFocusedZoneId("");
                          setSelectedId("");
                          setPendingMachinePlacement(null);
                          setActiveTool("select");
                          pushToast({
                            kind: "info",
                            message: next
                              ? "Combine mode on. Click zones to select, then click Merge selected zones in left panel."
                              : "Combine mode off.",
                            ts: Date.now(),
                          });
                        }}
                        title="Combine multiple zones into one"
                      >
                        Combine zones
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={
                        zoneRearrangeMode
                          ? "rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
                          : "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      }
                      onClick={() => {
                        const next = !zoneRearrangeMode;
                        setZoneRearrangeMode(next);
                        setZoneSwapSourceId("");
                        setZoneMergeMode(false);
                        setZoneMergeSelectedIds([]);
                        setZoneMergeName("");
                        setMachineRearrangeMode(false);
                        setMachineSwapSourceId("");
                        setPendingMachinePlacement(null);
                        setActiveTool("select");
                        if (next) setFocusedZoneId("");
                        pushToast({
                          kind: "info",
                          message: next
                            ? "Rearrange mode on. Click two zones to swap."
                            : "Rearrange mode off.",
                          ts: Date.now(),
                        });
                      }}
                      title="Swap positions of any two zones"
                    >
                      Rearrange zones
                    </button>
                    <button
                      type="button"
                      className={
                        machineRearrangeMode
                          ? "rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
                          : "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      }
                      onClick={() => {
                        if (!focusedZoneId) {
                          pushToast({
                            kind: "info",
                            message:
                              "Open a zone first to rearrange machines inside it.",
                            ts: Date.now(),
                          });
                          return;
                        }
                        const next = !machineRearrangeMode;
                        setMachineRearrangeMode(next);
                        setMachineSwapSourceId("");
                        setZoneMergeMode(false);
                        setZoneMergeSelectedIds([]);
                        setZoneMergeName("");
                        setZoneRearrangeMode(false);
                        setZoneSwapSourceId("");
                        setPendingMachinePlacement(null);
                        setActiveTool("select");
                        pushToast({
                          kind: "info",
                          message: next
                            ? "Machine rearrange on. Click two machines in this zone to swap."
                            : "Machine rearrange off.",
                          ts: Date.now(),
                        });
                      }}
                      title="Swap two machines inside opened zone"
                    >
                      Rearrange machines
                    </button>
                    <button
                      type="button"
                      className={neutralBtnClass}
                      onClick={() => {
                        setFocusedZoneId("");
                        setPendingMachinePlacement(null);
                        pushToast({
                          kind: "info",
                          message: "Back to all zones view",
                          ts: Date.now(),
                        });
                      }}
                      disabled={!focusedZone}
                      title={
                        focusedZone
                          ? "Return to all zones canvas"
                          : "Already in all zones view"
                      }
                    >
                      Back to all zones
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800"
                  onClick={onSave}
                >
                  Save to DB
                </button>
                {!TEMP_DISABLE_LAYOUT_HISTORY ? (
                  <div
                    className="mr-1 inline-flex items-center gap-1 rounded-lg border bg-white px-1 py-1"
                    title="Switch between saved layouts"
                  >
                    <button
                      type="button"
                      className={
                        layoutView === "current"
                          ? "rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white"
                          : "rounded-md px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      }
                      onClick={() => applyLayoutView("current")}
                    >
                      Current
                    </button>
                    <button
                      type="button"
                      className={
                        layoutView === "previous"
                          ? "rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white"
                          : "rounded-md px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      }
                      onClick={() => applyLayoutView("previous")}
                      disabled={!layoutVersions?.previous}
                      title={
                        layoutVersions?.previous
                          ? "View previous saved layout"
                          : "No previous saved layout yet"
                      }
                    >
                      Previous
                    </button>
                  </div>
                ) : null}
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800"
                    onClick={toggleFullscreen}
                    title="Exit fullscreen"
                  >
                    Exit
                  </button>
                  <div className="rounded-md border border-slate-300 bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm">
                    Floor: {activeFloorModeLabel}
                  </div>
                </div>
              </>
            ) : (
              // Non-fullscreen mode: Back to Dashboard, Current, Previous, Full Screen
              <>
                <button
                  type="button"
                  className={neutralBtnClass}
                  onClick={onCancel}
                >
                  Back to Dashboard
                </button>
                {!TEMP_DISABLE_LAYOUT_HISTORY ? (
                  <div
                    className="mr-1 inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950/40 px-1 py-1"
                    title="Switch between saved layouts"
                  >
                    <button
                      type="button"
                      className={
                        layoutView === "current"
                          ? "rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
                          : "rounded-md px-2.5 py-1 text-xs text-slate-200 hover:bg-white/5"
                      }
                      onClick={() => applyLayoutView("current")}
                    >
                      Current
                    </button>
                    <button
                      type="button"
                      className={
                        layoutView === "previous"
                          ? "rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
                          : "rounded-md px-2.5 py-1 text-xs text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                      }
                      onClick={() => applyLayoutView("previous")}
                      disabled={!layoutVersions?.previous}
                      title={
                        layoutVersions?.previous
                          ? "View previous saved layout"
                          : "No previous saved layout yet"
                      }
                    >
                      Previous
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className={neutralBtnClass}
                  onClick={toggleFullscreen}
                  title="Open 2D layout editor"
                >
                  Customize Layout (2D)
                </button>
              </>
            )}
          </div>
        </div>

        <div
          className={
            isFullscreen
              ? "relative mt-4 flex-1 min-h-0"
              : "mt-4 flex-1 flex flex-col justify-center min-h-0"
          }
        >
          {isTwoDEditor ? (
            <div className="absolute left-0 top-0 z-20 flex h-full w-[266px] overflow-hidden border-r bg-white/95">
              <div className="flex w-14 flex-col items-center gap-2 border-r bg-slate-50/80 py-3">
                <button
                  type="button"
                  className={
                    activeTool === "select"
                      ? "grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white"
                      : "grid h-10 w-10 place-items-center rounded-lg border bg-white text-slate-700 hover:bg-slate-50"
                  }
                  title="Select / Move"
                  onClick={() => setActiveTool("select")}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 3l6.5 15 1.9-5.1L18 11 5 3z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {!TEMP_DISABLE_ADD_MACHINE ? (
                  <button
                    type="button"
                    className={
                      activeTool === "add:machine"
                        ? "grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white"
                        : "grid h-10 w-10 place-items-center rounded-lg border bg-white text-slate-700 hover:bg-slate-50"
                    }
                    title="Add machine"
                    onClick={() => setActiveTool("add:machine")}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M4 8h16v10H4V8z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M8 8V5h8v3"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                ) : null}

                <button
                  type="button"
                  className={
                    activeTool === "add:floor"
                      ? "grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white"
                      : "grid h-10 w-10 place-items-center rounded-lg border bg-white text-slate-700 hover:bg-slate-50"
                  }
                  title="Add floor"
                  onClick={() => {
                    openFloorDialog();
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 6h16v12H4V6z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M7 9h10M7 12h10M7 15h10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>

                {!TEMP_DISABLE_ADD_ZONE ? (
                <button
                  type="button"
                  className={
                    activeTool === "add:zone"
                      ? "grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white"
                      : "grid h-10 w-10 place-items-center rounded-lg border bg-white text-slate-700 hover:bg-slate-50"
                  }
                  title="Add zone"
                  onClick={() => {
                    setNameInput("");
                    setNameInputDialog({ type: "zone" });
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 6h16v12H4V6z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8 10h8M8 14h6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                ) : null}

                {!TEMP_DISABLE_ADD_TRANSPORTER ? (
                  <button
                    type="button"
                    className={
                      activeTool === "add:transporter"
                        ? "grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white"
                        : "grid h-10 w-10 place-items-center rounded-lg border bg-white text-slate-700 hover:bg-slate-50"
                    }
                    title="Add transporter"
                    onClick={() => setActiveTool("add:transporter")}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 16V8h11v8H3z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14 11h4l3 3v2h-7v-5z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>

              <div className="h-full flex-1 overflow-auto p-3">
                <div className="text-sm font-semibold text-slate-900">
                  Tools
                </div>

                {nameInputDialog ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold text-slate-800">
                      {nameInputDialog.type === "floor"
                        ? "Add Floor"
                        : "Add Zone"}
                    </div>
                    <label className="mt-2 block text-xs text-slate-600">
                      Name
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border px-2 py-1 text-xs"
                        placeholder={`Enter ${nameInputDialog.type} name...`}
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (nameInputDialog.type === "floor") {
                              applyFloorSelection({
                                modelUrl:
                                  selectedFloorModelUrl || defaultFloorModelUrl,
                                label:
                                  nameInput.trim() ||
                                  selectedFloorModelLabel ||
                                  defaultFloorModelLabel,
                              });
                              return;
                            }
                            if (!nameInput.trim()) return;
                            if (nameInputDialog.type === "zone") {
                              const normalized = nameInput.trim().toLowerCase();
                              const exists = (draft?.elements || []).some(
                                (el) =>
                                  el?.type === ELEMENT_TYPES.ZONE &&
                                  String(el?.label || "")
                                    .trim()
                                    .toLowerCase() === normalized,
                              );
                              if (exists) {
                                pushToast({
                                  kind: "info",
                                  message:
                                    "Zone name already exists. Please use a unique zone name.",
                                  ts: Date.now(),
                                });
                                return;
                              }
                            }
                            setActiveTool(`add:${nameInputDialog.type}`);
                            setNameInputDialog(null);
                          } else if (e.key === "Escape") {
                            setNameInputDialog(null);
                            setNameInput("");
                          }
                        }}
                        autoFocus
                      />
                    </label>

                    {nameInputDialog.type === "floor" ? (
                      <div className="mt-3">
                        <div className="text-[11px] font-semibold text-slate-700">
                          Floor model
                        </div>
                        <button
                          type="button"
                          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => setShowFloorPicker((prev) => !prev)}
                        >
                          Select from DB
                        </button>
                        {showFloorPicker ? (
                          <div className="mt-2 max-h-[280px] space-y-2 overflow-y-auto">
                            {FLOOR_MODEL_OPTIONS.map((opt) => (
                              <button
                                key={opt.url}
                                type="button"
                                className={
                                  (selectedFloorModelUrl ||
                                    defaultFloorModelUrl) === opt.url
                                    ? "w-full rounded-md border border-sky-300 bg-sky-50 p-2 text-left"
                                    : "w-full rounded-md border border-slate-200 bg-white p-2 text-left hover:bg-slate-50"
                                }
                                onClick={() => {
                                  applyFloorSelection({
                                    modelUrl: opt.url,
                                    label: opt.label || opt.url,
                                  });
                                }}
                              >
                                <div className="text-xs font-semibold text-slate-800">
                                  {opt.label}
                                </div>
                                <div className="mt-1 h-24 w-full overflow-hidden rounded-md border bg-white">
                                  <Canvas
                                    camera={{
                                      position: [0, 0.9, 1.6],
                                      fov: 40,
                                    }}
                                  >
                                    <ambientLight intensity={0.8} />
                                    <directionalLight
                                      position={[2, 3, 2]}
                                      intensity={1.1}
                                    />
                                    <Suspense fallback={null}>
                                      <FloorModelPreview url={opt.url} />
                                    </Suspense>
                                    <OrbitControls
                                      enablePan={false}
                                      enableZoom={false}
                                      enableRotate={true}
                                      autoRotate
                                      autoRotateSpeed={1.2}
                                    />
                                  </Canvas>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 rounded-md border bg-slate-50 p-2">
                            <div className="text-[11px] text-slate-600">
                              Selected:{" "}
                              {selectedFloorModelLabel ||
                                defaultFloorModelLabel}
                            </div>
                            {selectedFloorModelUrl || defaultFloorModelUrl ? (
                              <div className="mt-2 h-32 w-full overflow-hidden rounded-md border bg-white">
                                <Canvas
                                  camera={{ position: [0, 0.9, 1.6], fov: 40 }}
                                >
                                  <ambientLight intensity={0.8} />
                                  <directionalLight
                                    position={[2, 3, 2]}
                                    intensity={1.1}
                                  />
                                  <Suspense fallback={null}>
                                    <FloorModelPreview
                                      url={
                                        selectedFloorModelUrl ||
                                        defaultFloorModelUrl
                                      }
                                    />
                                  </Suspense>
                                  <OrbitControls
                                    enablePan={false}
                                    enableZoom={false}
                                    enableRotate={true}
                                    autoRotate
                                    autoRotateSpeed={1.2}
                                  />
                                </Canvas>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          setNameInputDialog(null);
                          setNameInput("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        disabled={
                          nameInputDialog.type === "floor"
                            ? false
                            : !nameInput.trim()
                        }
                        onClick={() => {
                          if (nameInputDialog.type === "floor") {
                            applyFloorSelection({
                              modelUrl:
                                selectedFloorModelUrl || defaultFloorModelUrl,
                              label:
                                nameInput.trim() ||
                                selectedFloorModelLabel ||
                                defaultFloorModelLabel,
                            });
                            return;
                          }
                          if (nameInput.trim()) {
                            if (nameInputDialog.type === "zone") {
                              const normalized = nameInput.trim().toLowerCase();
                              const exists = (draft?.elements || []).some(
                                (el) =>
                                  el?.type === ELEMENT_TYPES.ZONE &&
                                  String(el?.label || "")
                                    .trim()
                                    .toLowerCase() === normalized,
                              );
                              if (exists) {
                                pushToast({
                                  kind: "info",
                                  message:
                                    "Zone name already exists. Please use a unique zone name.",
                                  ts: Date.now(),
                                });
                                return;
                              }
                            }
                            setActiveTool(`add:${nameInputDialog.type}`);
                            pushToast({
                              kind: "info",
                              message:
                                nameInputDialog.type === "zone"
                                  ? "Zone name accepted. Draw on canvas to place; it will auto-align in the grid."
                                  : nameInputDialog.type === "floor"
                                    ? "Floor applied."
                                    : "Walkway name accepted. Draw on canvas to place walkway.",
                              ts: Date.now(),
                            });
                            setNameInputDialog(null);
                          }
                        }}
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                ) : null}

                {isFullscreen &&
                (activeTool === "add:floor" ||
                  activeTool === "add:zone" ||
                  activeTool === "add:walkway") ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
                    Placement: click and drag on the canvas to draw the
                    {activeTool === "add:floor"
                      ? " floor"
                      : activeTool === "add:zone"
                        ? " zone"
                        : " walkway"}
                    . Release to place.
                  </div>
                ) : null}

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={
                      activeTool === "select"
                        ? "rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                        : "rounded-lg border px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                    }
                    onClick={() => setActiveTool("select")}
                  >
                    Select / Move
                  </button>
                  {!TEMP_DISABLE_ADD_MACHINE ? (
                    <button
                      type="button"
                      className={
                        activeTool === "add:machine"
                          ? "rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                          : "rounded-lg border px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                      }
                      onClick={() => {
                        setActiveTool("add:machine");
                        if (selectedElement?.type === ELEMENT_TYPES.ZONE) {
                          setFocusedZoneId(String(selectedElement.id));
                        }
                      }}
                    >
                      Add machine
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className={
                      activeTool === "add:floor"
                        ? "rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                        : "rounded-lg border px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                    }
                    onClick={() => {
                      openFloorDialog();
                    }}
                  >
                    Add floor
                  </button>

                  {!TEMP_DISABLE_ADD_ZONE ? (
                  <button
                    type="button"
                    className={
                      activeTool === "add:zone"
                        ? "rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                        : "rounded-lg border px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                    }
                    onClick={() => {
                      setNameInput("");
                      setNameInputDialog({ type: "zone" });
                    }}
                  >
                    Add zone
                  </button>
                  ) : null}

                  <button
                    type="button"
                    className={
                      activeTool === "add:walkway"
                        ? "rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                        : "rounded-lg border px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                    }
                    onClick={() => {
                      setNameInput("");
                      setActiveTool("add:walkway");
                    }}
                  >
                    Add walkway
                  </button>

                  {!TEMP_DISABLE_ADD_TRANSPORTER ? (
                    <button
                      type="button"
                      className={
                        activeTool === "add:transporter"
                          ? "rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                          : "rounded-lg border px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                      }
                      onClick={() => setActiveTool("add:transporter")}
                    >
                      Add transporter
                    </button>
                  ) : null}
                </div>

                {zoneMergeMode ? (
                  <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3">
                    <div className="text-xs font-semibold text-violet-900">
                      Combine zones
                    </div>
                    <div className="mt-1 text-[11px] text-violet-700">
                      Click zones on canvas to select, then merge.
                    </div>
                    <div className="mt-2 rounded-md bg-white px-2 py-1 text-xs text-slate-700">
                      <span className="font-semibold">Selected zones:</span>{" "}
                      {zoneMergeSelectedCount}
                    </div>
                    <label className="mt-2 block text-xs text-slate-600">
                      New merged zone name
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-xs"
                        value={zoneMergeName}
                        onChange={(e) => setZoneMergeName(e.target.value)}
                        placeholder="e.g. Production Block A"
                      />
                    </label>
                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                      onClick={handleMergeSelectedZones}
                      disabled={zoneMergeSelectedCount < 2}
                    >
                      Merge selected zones
                    </button>
                  </div>
                ) : null}

                {activeTool === "add:machine" ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold text-slate-800">
                      Enter machine details
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Select a zone first, then add machines inside that zone.
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                      <div className="rounded-md bg-slate-50 px-2 py-1">
                        <span className="font-semibold">Plant ID:</span>{" "}
                        {layoutCtx?.plantId || "—"}
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-1">
                        <span className="font-semibold">Department ID:</span>{" "}
                        {layoutCtx?.departmentId || "—"}
                      </div>
                    </div>

                    <div className="mt-3 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">
                      <span className="font-semibold">Selected zone:</span>{" "}
                      {focusedZone?.label || "Select a zone from canvas/list"}
                    </div>
                    <div className="mt-2">
                      <button
                        type="button"
                        className="w-full rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        onClick={() => {
                          if (!focusedZone) return;
                          pushToast({
                            kind: "success",
                            message: `Saved machine changes for ${focusedZone.label || "selected zone"}. Click Save to DB to persist.`,
                            ts: Date.now(),
                          });
                        }}
                        disabled={!focusedZone}
                      >
                        Save this zone
                      </button>
                    </div>

                    <label className="mt-2 block text-xs text-slate-600">
                      Machine name
                      <input
                        className="mt-1 w-full rounded-md border px-2 py-1 text-xs"
                        value={machineForm.machineName}
                        onChange={(e) => {
                          const value = e.target.value;
                          setMachineForm((prev) => ({
                            ...prev,
                            machineName: value,
                          }));
                          if (machineFormError) setMachineFormError("");
                        }}
                        placeholder="e.g. CNC-07"
                      />
                    </label>

                    {machineFormError ? (
                      <div className="mt-2 text-[11px] text-red-600">
                        {machineFormError}
                      </div>
                    ) : pendingMachinePlacement ? (
                      <div className="mt-2 text-[11px] text-emerald-600">
                        Placement armed for{" "}
                        <span className="font-semibold">
                          {pendingMachinePlacement.machineName || "Machine"}
                        </span>
                        . Move the cursor inside the 2D canvas and click when
                        the cyan preview is exactly where you want it.
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Enter machine name and click "Add machine to zone". It
                        will be added automatically to the selected zone.
                      </div>
                    )}

                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      onClick={addMachineFromSidebar}
                      disabled={
                        TEMP_DISABLE_ADD_MACHINE ||
                        !machineForm.machineName.trim() ||
                        !focusedZone
                      }
                    >
                      Add machine to zone
                    </button>
                  </div>
                ) : null}

                <div className="mt-3 rounded-lg border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-700">
                      Placed items
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={showMachineMarkers}
                        onChange={(e) =>
                          setShowMachineMarkers(e.target.checked)
                        }
                      />
                      Show
                    </label>
                  </div>

                  <div className="mt-2 max-h-[180px] space-y-1 overflow-auto">
                    {placeableElements.length ? (
                      placeableElements.map((el) => {
                        // Get actual machine name from JSON data if it's a machine
                        let displayName =
                          el.label ||
                          `${typeLabel(el.type)} ${String(el.id).slice(0, 4)}`;
                        if (
                          el.type === ELEMENT_TYPES.MACHINE &&
                          el.machineId &&
                          machineMetaById?.[el.machineId]
                        ) {
                          displayName =
                            machineMetaById[el.machineId].name || displayName;
                        }

                        return (
                          <button
                            key={String(el.id)}
                            type="button"
                            className={
                              String(selectedId) === String(el.id)
                                ? "w-full rounded-md bg-sky-50 px-2 py-1 text-left text-xs text-sky-800"
                                : "w-full rounded-md px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                            }
                            onClick={() => {
                              setSelectedId(String(el.id));
                              if (
                                activeTool === "add:machine" &&
                                el?.type === ELEMENT_TYPES.ZONE
                              ) {
                                setFocusedZoneId(String(el.id));
                              } else {
                                setActiveTool("select");
                              }
                            }}
                          >
                            <div className="font-medium">{displayName}</div>
                            <div className="text-[11px] text-slate-500">
                              {el?.type === ELEMENT_TYPES.MACHINE
                                ? `${typeLabel(el.type)} • ${machineMetaById?.[el.machineId]?.zoneName || el?.meta?.zoneName || "Unassigned zone"}`
                                : typeLabel(el.type)}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="text-[11px] text-slate-500">
                        No items yet. Use Add buttons above.
                      </div>
                    )}
                  </div>
                </div>

                {selectedElement ? (
                  <div className="mt-3 rounded-lg border p-2">
                    <div className="text-xs font-semibold text-slate-700">
                      Selected
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {typeLabel(selectedElement.type)}
                    </div>

                    <label className="mt-2 block text-xs text-slate-600">
                      Name
                      <input
                        className="mt-1 w-full rounded-lg border px-2 py-1 text-xs"
                        value={selectedElement.label || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  elements: (prev.elements || []).map((x) =>
                                    String(x.id) === String(selectedElement.id)
                                      ? { ...x, label: value }
                                      : x,
                                  ),
                                }
                              : prev,
                          );
                        }}
                      />
                    </label>

                    <div className="mt-3 rounded-lg border bg-slate-50 p-2">
                      <div className="text-[11px] font-semibold text-slate-700">
                        Rotation
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {[
                          { label: "Top", deg: 0 },
                          { label: "Right", deg: 90 },
                          { label: "Down", deg: 180 },
                          { label: "Left", deg: 270 },
                        ].map((r) => (
                          <button
                            key={r.label}
                            type="button"
                            className={
                              Number(selectedElement.rotationDeg || 0) === r.deg
                                ? "rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white"
                                : "rounded-md border bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
                            }
                            onClick={() => {
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      elements: (prev.elements || []).map(
                                        (x) =>
                                          String(x.id) ===
                                          String(selectedElement.id)
                                            ? { ...x, rotationDeg: r.deg }
                                            : x,
                                      ),
                                    }
                                  : prev,
                              );
                            }}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                      <label className="mt-2 block text-[11px] text-slate-600">
                        Degrees
                        <input
                          className="mt-1 w-full rounded-md border bg-white px-2 py-1 text-xs"
                          inputMode="numeric"
                          value={String(
                            Number(selectedElement.rotationDeg || 0),
                          )}
                          onChange={(e) => {
                            const value = clamp(e.target.value, -360, 360);
                            setDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    elements: (prev.elements || []).map((x) =>
                                      String(x.id) ===
                                      String(selectedElement.id)
                                        ? { ...x, rotationDeg: value }
                                        : x,
                                    ),
                                  }
                                : prev,
                            );
                          }}
                        />
                      </label>
                    </div>

                    {selectedElement.type === ELEMENT_TYPES.FLOOR ? (
                      <>
                        <label className="mt-2 block text-xs text-slate-600">
                          Floor model
                          <select
                            className="mt-1 w-full rounded-lg border px-2 py-1 text-xs text-slate-700"
                            value={
                              selectedElement.modelUrl || defaultFloorModelUrl
                            }
                            onChange={(e) => {
                              const value = e.target.value;
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      elements: (prev.elements || []).map(
                                        (x) =>
                                          String(x.id) ===
                                          String(selectedElement.id)
                                            ? { ...x, modelUrl: value }
                                            : x,
                                      ),
                                    }
                                  : prev,
                              );
                            }}
                          >
                            {FLOOR_MODEL_OPTIONS.map((opt) => (
                              <option key={opt.url} value={opt.url}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="block text-xs text-slate-600">
                            Length (1-100 units)
                            <input
                              type="number"
                              min="1"
                              max="100"
                              step="1"
                              className="mt-1 w-full rounded-lg border px-2 py-1 text-xs"
                              inputMode="decimal"
                              value={String(
                                Math.round(
                                  Number(selectedElement.w ?? 0.9) * 100,
                                ),
                              )}
                              onChange={(e) => {
                                const displayValue = Math.max(
                                  1,
                                  Math.min(100, Number(e.target.value) || 1),
                                );
                                const normalizedValue = displayValue / 100;
                                setDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        elements: (prev.elements || []).map(
                                          (x) =>
                                            String(x.id) ===
                                            String(selectedElement.id)
                                              ? { ...x, w: normalizedValue }
                                              : x,
                                        ),
                                      }
                                    : prev,
                                );
                              }}
                            />
                          </label>
                          <label className="block text-xs text-slate-600">
                            Breadth (1-100 units)
                            <input
                              type="number"
                              min="1"
                              max="100"
                              step="1"
                              className="mt-1 w-full rounded-lg border px-2 py-1 text-xs"
                              inputMode="decimal"
                              value={String(
                                Math.round(
                                  Number(selectedElement.h ?? 0.9) * 100,
                                ),
                              )}
                              onChange={(e) => {
                                const displayValue = Math.max(
                                  1,
                                  Math.min(100, Number(e.target.value) || 1),
                                );
                                const normalizedValue = displayValue / 100;
                                setDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        elements: (prev.elements || []).map(
                                          (x) =>
                                            String(x.id) ===
                                            String(selectedElement.id)
                                              ? { ...x, h: normalizedValue }
                                              : x,
                                        ),
                                      }
                                    : prev,
                                );
                              }}
                            />
                          </label>
                        </div>
                      </>
                    ) : selectedElement.type === ELEMENT_TYPES.ZONE ? (
                      <>
                        <label className="mt-2 block text-xs text-slate-600">
                          Fill color
                          <select
                            className="mt-1 w-full rounded-lg border px-2 py-1 text-xs text-slate-700"
                            value={selectedElement.color || "dark-green"}
                            onChange={(e) => {
                              const value = e.target.value;
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      elements: (prev.elements || []).map(
                                        (x) =>
                                          String(x.id) ===
                                          String(selectedElement.id)
                                            ? { ...x, color: value }
                                            : x,
                                      ),
                                    }
                                  : prev,
                              );
                            }}
                          >
                            <option value="dark-green">Dark green</option>
                            <option value="orange">Orange</option>
                            <option value="yellow">Yellow</option>
                          </select>
                        </label>

                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="block text-xs text-slate-600">
                            Length (1-100 units)
                            <input
                              type="number"
                              min="1"
                              max="100"
                              step="1"
                              className="mt-1 w-full rounded-lg border px-2 py-1 text-xs"
                              inputMode="decimal"
                              value={String(
                                Math.round(
                                  Number(selectedElement.w ?? 0.2) * 100,
                                ),
                              )}
                              onChange={(e) => {
                                const displayValue = Math.max(
                                  1,
                                  Math.min(100, Number(e.target.value) || 1),
                                );
                                const normalizedValue = displayValue / 100;
                                setDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        elements: (prev.elements || []).map(
                                          (x) =>
                                            String(x.id) ===
                                            String(selectedElement.id)
                                              ? { ...x, w: normalizedValue }
                                              : x,
                                        ),
                                      }
                                    : prev,
                                );
                              }}
                            />
                          </label>
                          <label className="block text-xs text-slate-600">
                            Breadth (1-100 units)
                            <input
                              type="number"
                              min="1"
                              max="100"
                              step="1"
                              className="mt-1 w-full rounded-lg border px-2 py-1 text-xs"
                              inputMode="decimal"
                              value={String(
                                Math.round(
                                  Number(selectedElement.h ?? 0.12) * 100,
                                ),
                              )}
                              onChange={(e) => {
                                const displayValue = Math.max(
                                  1,
                                  Math.min(100, Number(e.target.value) || 1),
                                );
                                const normalizedValue = displayValue / 100;
                                setDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        elements: (prev.elements || []).map(
                                          (x) =>
                                            String(x.id) ===
                                            String(selectedElement.id)
                                              ? { ...x, h: normalizedValue }
                                              : x,
                                        ),
                                      }
                                    : prev,
                                );
                              }}
                            />
                          </label>
                        </div>
                      </>
                    ) : selectedElement.type === ELEMENT_TYPES.WALKWAY ? (
                      <>
                        <div className="mt-2 text-xs text-slate-600">
                          Walkway overlay (black fill)
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="block text-xs text-slate-600">
                            Length (1-100 units)
                            <input
                              type="number"
                              min="1"
                              max="100"
                              step="1"
                              className="mt-1 w-full rounded-lg border px-2 py-1 text-xs"
                              inputMode="decimal"
                              value={String(
                                Math.round(
                                  Number(selectedElement.w ?? 0.25) * 100,
                                ),
                              )}
                              onChange={(e) => {
                                const displayValue = Math.max(
                                  1,
                                  Math.min(100, Number(e.target.value) || 1),
                                );
                                const normalizedValue = displayValue / 100;
                                setDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        elements: (prev.elements || []).map(
                                          (x) =>
                                            String(x.id) ===
                                            String(selectedElement.id)
                                              ? { ...x, w: normalizedValue }
                                              : x,
                                        ),
                                      }
                                    : prev,
                                );
                              }}
                            />
                          </label>
                          <label className="block text-xs text-slate-600">
                            Breadth (1-100 units)
                            <input
                              type="number"
                              min="1"
                              max="100"
                              step="1"
                              className="mt-1 w-full rounded-lg border px-2 py-1 text-xs"
                              inputMode="decimal"
                              value={String(
                                Math.round(
                                  Number(selectedElement.h ?? 0.06) * 100,
                                ),
                              )}
                              onChange={(e) => {
                                const displayValue = Math.max(
                                  1,
                                  Math.min(100, Number(e.target.value) || 1),
                                );
                                const normalizedValue = displayValue / 100;
                                setDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        elements: (prev.elements || []).map(
                                          (x) =>
                                            String(x.id) ===
                                            String(selectedElement.id)
                                              ? { ...x, h: normalizedValue }
                                              : x,
                                        ),
                                      }
                                    : prev,
                                );
                              }}
                            />
                          </label>
                        </div>
                      </>
                    ) : (
                      <>
                        <label className="mt-2 block text-xs text-slate-600">
                          Model
                          <select
                            className="mt-1 w-full rounded-lg border px-2 py-1 text-xs text-slate-700"
                            value={
                              selectedElement.modelUrl ||
                              MODEL_LIBRARY[selectedElement.type]?.[0]?.url ||
                              ""
                            }
                            onChange={(e) => {
                              const value = e.target.value;
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      elements: (prev.elements || []).map(
                                        (x) =>
                                          String(x.id) ===
                                          String(selectedElement.id)
                                            ? { ...x, modelUrl: value }
                                            : x,
                                      ),
                                    }
                                  : prev,
                              );
                            }}
                          >
                            {(MODEL_LIBRARY[selectedElement.type] || []).map(
                              (m) => (
                                <option key={m.url} value={m.url}>
                                  {m.label} ({m.url})
                                </option>
                              ),
                            )}
                          </select>
                        </label>

                        <label className="mt-2 block text-xs text-slate-600">
                          Scale
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              className="w-full"
                              type="range"
                              min="0.1"
                              max="10"
                              step="0.05"
                              value={String(
                                clamp(selectedElement.scale ?? 1, 0.1, 10),
                              )}
                              onChange={(e) => {
                                const value = clamp(e.target.value, 0.01, 50);
                                setDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        elements: (prev.elements || []).map(
                                          (x) =>
                                            String(x.id) ===
                                            String(selectedElement.id)
                                              ? { ...x, scale: value }
                                              : x,
                                        ),
                                      }
                                    : prev,
                                );
                              }}
                            />
                            <input
                              className="w-20 rounded-lg border px-2 py-1 text-xs"
                              inputMode="decimal"
                              value={String(
                                Number(selectedElement.scale ?? 1).toFixed(2),
                              )}
                              onChange={(e) => {
                                const value = clamp(e.target.value, 0.01, 50);
                                setDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        elements: (prev.elements || []).map(
                                          (x) =>
                                            String(x.id) ===
                                            String(selectedElement.id)
                                              ? { ...x, scale: value }
                                              : x,
                                        ),
                                      }
                                    : prev,
                                );
                              }}
                            />
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            Tip: you can resize from the left panel size inputs.
                          </div>
                        </label>
                      </>
                    )}

                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg border px-3 py-2 text-xs text-red-700 hover:bg-red-50"
                      onClick={() => {
                        const id = String(selectedElement.id);
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                elements: (prev.elements || []).filter(
                                  (x) => String(x.id) !== id,
                                ),
                              }
                            : prev,
                        );
                        setSelectedId("");
                        setActiveTool("select");
                      }}
                    >
                      Delete selected
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            style={
              isTwoDEditor ? { paddingLeft: 278, height: "100%" } : undefined
            }
            className={isFullscreen ? "h-full" : "h-full w-full"}
          >
            {!isFullscreen ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={showMachineMarkers}
                      onChange={(e) => setShowMachineMarkers(e.target.checked)}
                    />
                    Show machines
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={showMachineLabels}
                      onChange={(e) => setShowMachineLabels(e.target.checked)}
                    />
                    Show labels
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {STATUS_FILTER_BUTTONS.map(
                    (s) => (
                      <button
                        key={s}
                        type="button"
                        className={
                          machineStatusVisibility?.[s]
                            ? "rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-100"
                            : "rounded-full border border-slate-800 bg-transparent px-3 py-1 text-xs text-slate-400"
                        }
                        onClick={() => {
                          if (s === "ALL") {
                            setMachineStatusVisibility({
                              RUNNING: true,
                              IDLE: true,
                              DOWN: true,
                              // MAINTENANCE: true, // TEMP commented
                              // OFF: true, // TEMP commented
                              ALL: true,
                            });
                          } else {
                            setMachineStatusVisibility({
                              RUNNING: false,
                              IDLE: false,
                              DOWN: false,
                              // MAINTENANCE: false, // TEMP commented
                              // OFF: false, // TEMP commented
                              [s]: true,
                            });
                          }
                        }}
                      >
                        {s}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ) : null}

            {isFullscreen ? (
              <DepartmentFloor2DViewer
                elements={draft?.elements || []}
                showMachineMarkers={showMachineMarkers}
                showMachineLabels={showMachineLabels}
                machineMetaById={machineMetaById}
                onOpenMachineDetails={
                  !isFullscreen ? onOpenMachineDetails : undefined
                }
                machineStatusVisibility={machineStatusVisibility}
                onPointerPositionChange={
                  isFullscreen ? handlePointerPositionChange : undefined
                }
                fullScreen={isFullscreen}
                activeTool={viewerActiveTool}
                selectedId={isFullscreen ? selectedId : ""}
                onSelectElement={
                  isFullscreen
                    ? (id) => {
                        setSelectedId(String(id || ""));
                        const next = (draft?.elements || []).find(
                          (e) => String(e?.id) === String(id || ""),
                        );
                        if (
                          activeTool === "add:machine" &&
                          next?.type === ELEMENT_TYPES.ZONE
                        ) {
                          setFocusedZoneId(String(next.id));
                        } else if (!id) {
                          setFocusedZoneId("");
                        } else if (activeTool !== "add:machine") {
                          setActiveTool("select");
                        }
                      }
                    : undefined
                }
                focusedZoneId={
                  isFullscreen
                    ? zoneRearrangeMode || zoneMergeMode
                      ? ""
                      : focusedZoneId
                    : ""
                }
                onFocusZoneChange={
                  isFullscreen
                    ? zoneRearrangeMode || zoneMergeMode
                      ? undefined
                      : (id) => setFocusedZoneId(String(id || ""))
                    : undefined
                }
                onAddElement={
                  isFullscreen
                  ? (type, pos) => {
                      const t = String(type);
                      if (
                        TEMP_DISABLE_ADD_ZONE &&
                        t === ELEMENT_TYPES.ZONE
                      ) {
                        pushToast({
                          kind: "info",
                          message: "Add zone is temporarily disabled.",
                          ts: Date.now(),
                        });
                        setActiveTool("select");
                        return;
                      }
                      if (
                        TEMP_DISABLE_ADD_MACHINE &&
                        t === ELEMENT_TYPES.MACHINE
                        ) {
                          pushToast({
                            kind: "info",
                            message: "Add machine is temporarily disabled.",
                            ts: Date.now(),
                          });
                          setActiveTool("select");
                          setPendingMachinePlacement(null);
                          return;
                        }
                        if (
                          TEMP_DISABLE_ADD_TRANSPORTER &&
                          t === ELEMENT_TYPES.TRANSPORTER
                        ) {
                          pushToast({
                            kind: "info",
                            message: "Add transporter is temporarily disabled.",
                            ts: Date.now(),
                          });
                          setActiveTool("select");
                          return;
                        }
                        const newId = nanoid(8);
                        const defaultModelUrl = MODEL_LIBRARY[t]?.[0]?.url;
                        const machineSeed =
                          t === ELEMENT_TYPES.MACHINE && pendingMachinePlacement
                            ? pendingMachinePlacement
                            : null;

                        // Use custom name from dialog for floor/zone/walkway, or machine name, or default
                        const label =
                          (t === ELEMENT_TYPES.FLOOR ||
                            t === ELEMENT_TYPES.ZONE ||
                            t === ELEMENT_TYPES.WALKWAY) &&
                          nameInput.trim()
                            ? nameInput.trim()
                            : machineSeed?.machineName
                              ? machineSeed.machineName
                              : `${typeLabel(t)} ${newId.slice(0, 4)}`;

                        const defaultsForType = () => {
                          if (t === ELEMENT_TYPES.FLOOR) {
                            const floorModelUrl =
                              selectedFloorModelUrl ||
                              defaultFloorModelUrl ||
                              "/models/floor-model.glb";
                            return {
                              w: 0.95,
                              h: 0.95,
                              modelUrl: floorModelUrl,
                            };
                          }
                          if (t === ELEMENT_TYPES.ZONE) {
                            return {
                              w: 0.35,
                              h: 0.22,
                              color: "dark-green",
                              modelUrl: "/models/zone-green.glb",
                              scale: 1,
                            };
                          }
                          if (t === ELEMENT_TYPES.MACHINE) {
                            return {
                              w: machineSeed?.w ?? 0.12,
                              h: machineSeed?.h ?? 0.12,
                              scale: machineSeed?.scale ?? 1,
                              modelUrl:
                                machineSeed?.modelUrl ?? defaultModelUrl,
                            };
                          }
                          if (t === ELEMENT_TYPES.WALKWAY) {
                            return {
                              w: 0.3,
                              h: 0.06,
                              modelUrl: "/models/zone-green.glb",
                              scale: 1,
                            };
                          }
                          if (t === ELEMENT_TYPES.TRANSPORTER) {
                            return {
                              w: 0.18,
                              h: 0.08,
                              scale: 1,
                              modelUrl: defaultModelUrl,
                            };
                          }
                          return {
                            w: 0.12,
                            h: 0.12,
                            scale: 1,
                            modelUrl: defaultModelUrl,
                          };
                        };

                        const defaults = defaultsForType();

                        const isDragRect =
                          pos &&
                          typeof pos === "object" &&
                          Number.isFinite(Number(pos.w)) &&
                          Number.isFinite(Number(pos.h));
                        const rawX = clamp(pos?.x ?? 0.5, 0, 1);
                        const rawY = clamp(pos?.y ?? 0.5, 0, 1);

                        const baseW = Number(defaults.w);
                        const baseH = Number(defaults.h);
                        const fallbackW =
                          Number.isFinite(baseW) && baseW > 0 ? baseW : 0.12;
                        const fallbackH =
                          Number.isFinite(baseH) && baseH > 0 ? baseH : 0.12;

                        const finalW = clamp(
                          isDragRect ? Number(pos?.w) : fallbackW,
                          0.02,
                          1,
                        );
                        const finalH = clamp(
                          isDragRect ? Number(pos?.h) : fallbackH,
                          0.02,
                          1,
                        );

                        const shouldCenter =
                          !isDragRect &&
                          (t === ELEMENT_TYPES.FLOOR ||
                            t === ELEMENT_TYPES.ZONE ||
                            t === ELEMENT_TYPES.WALKWAY ||
                            t === ELEMENT_TYPES.MACHINE ||
                            t === ELEMENT_TYPES.TRANSPORTER);

                        const finalX = isDragRect
                          ? clamp(rawX, 0, 1 - finalW)
                          : shouldCenter
                            ? clamp(rawX - finalW / 2, 0, 1 - finalW)
                            : clamp(rawX, 0, 1 - finalW);

                        const finalY = isDragRect
                          ? clamp(rawY, 0, 1 - finalH)
                          : shouldCenter
                            ? clamp(rawY - finalH / 2, 0, 1 - finalH)
                            : clamp(rawY, 0, 1 - finalH);

                        const color =
                          t === ELEMENT_TYPES.ZONE
                            ? pos?.color || defaults.color || "dark-green"
                            : undefined;
                        const rotationDeg = Number.isFinite(
                          Number(pos?.rotationDeg),
                        )
                          ? Number(pos.rotationDeg)
                          : 0;

                        const machineId =
                          t === ELEMENT_TYPES.MACHINE
                            ? machineSeed?.machineId ||
                              `${layoutCtx?.departmentId || "dept"}-${nanoid(6)}`
                            : undefined;
                        const machineMeta =
                          t === ELEMENT_TYPES.MACHINE
                            ? {
                                plantId:
                                  machineSeed?.meta?.plantId ||
                                  layoutCtx?.plantId ||
                                  "",
                                departmentId:
                                  machineSeed?.meta?.departmentId ||
                                  layoutCtx?.departmentId ||
                                  "",
                                zoneId:
                                  machineSeed?.meta?.zoneId ||
                                  focusedZoneId ||
                                  "",
                                zoneName:
                                  machineSeed?.meta?.zoneName ||
                                  machineSeed?.zoneName ||
                                  "",
                                machineName:
                                  machineSeed?.meta?.machineName ||
                                  machineSeed?.machineName ||
                                  label,
                                createdAt:
                                  machineSeed?.meta?.createdAt ||
                                  new Date().toISOString(),
                              }
                            : null;

                        setDraft((prev) =>
                          prev
                            ? (() => {
                                const focusZone =
                                  t === ELEMENT_TYPES.MACHINE
                                    ? (prev.elements || []).find(
                                        (e) =>
                                          e?.type === ELEMENT_TYPES.ZONE &&
                                          String(e?.id) ===
                                            String(
                                              focusedZoneId ||
                                                machineSeed?.meta?.zoneId ||
                                                selectedId ||
                                                "",
                                            ),
                                      ) || null
                                    : null;
                                const resolvedZoneName =
                                  t === ELEMENT_TYPES.MACHINE
                                    ? focusZone?.label ||
                                      machineSeed?.meta?.zoneName ||
                                      machineSeed?.zoneName ||
                                      ""
                                    : "";
                                const resolvedZoneId =
                                  t === ELEMENT_TYPES.MACHINE
                                    ? String(
                                        focusZone?.id ||
                                          machineSeed?.meta?.zoneId ||
                                          focusedZoneId ||
                                          "",
                                      )
                                    : "";

                                const machineW =
                                  t === ELEMENT_TYPES.MACHINE
                                    ? finalW
                                    : undefined;
                                const machineH =
                                  t === ELEMENT_TYPES.MACHINE
                                    ? finalH
                                    : undefined;
                                const machineXInZone = focusZone
                                  ? clamp(
                                      (Number(pos?.x) || 0.5) - machineW / 2,
                                      Number(focusZone.x) || 0,
                                      (Number(focusZone.x) || 0) +
                                        (Number(focusZone.w) || 0) -
                                        machineW,
                                    )
                                  : finalX;
                                const machineYInZone = focusZone
                                  ? clamp(
                                      (Number(pos?.y) || 0.5) - machineH / 2,
                                      Number(focusZone.y) || 0,
                                      (Number(focusZone.y) || 0) +
                                        (Number(focusZone.h) || 0) -
                                        machineH,
                                    )
                                  : finalY;
                                const zoneBounds = getZoneLayoutBounds(
                                  prev.elements || [],
                                );
                                const zoneWClamped = clamp(
                                  finalW,
                                  0.02,
                                  zoneBounds.w,
                                );
                                const zoneHClamped = clamp(
                                  finalH,
                                  0.02,
                                  zoneBounds.h,
                                );
                                const zoneXClamped = clamp(
                                  finalX,
                                  zoneBounds.x,
                                  Math.max(
                                    zoneBounds.x,
                                    zoneBounds.x + zoneBounds.w - zoneWClamped,
                                  ),
                                );
                                const zoneYClamped = clamp(
                                  finalY,
                                  zoneBounds.y,
                                  Math.max(
                                    zoneBounds.y,
                                    zoneBounds.y + zoneBounds.h - zoneHClamped,
                                  ),
                                );

                                const addedElement = {
                                  id: newId,
                                  type: t,
                                  label,
                                  x:
                                    t === ELEMENT_TYPES.ZONE
                                      ? zoneXClamped
                                      : t === ELEMENT_TYPES.MACHINE
                                        ? machineXInZone
                                        : finalX,
                                  y:
                                    t === ELEMENT_TYPES.ZONE
                                      ? zoneYClamped
                                      : t === ELEMENT_TYPES.MACHINE
                                        ? machineYInZone
                                        : finalY,
                                  ...defaults,
                                  w:
                                    t === ELEMENT_TYPES.ZONE
                                      ? zoneWClamped
                                      : finalW,
                                  h:
                                    t === ELEMENT_TYPES.ZONE
                                      ? zoneHClamped
                                      : finalH,
                                  rotationDeg,
                                  ...(color ? { color } : null),
                                  ...(machineId ? { machineId } : null),
                                  ...(machineId
                                    ? {
                                        meta: {
                                          ...(machineMeta || {}),
                                          zoneId: resolvedZoneId,
                                          zoneName: resolvedZoneName,
                                        },
                                      }
                                    : null),
                                  ...(t === ELEMENT_TYPES.WALKWAY
                                    ? { meta: { source: "left-panel" } }
                                    : null),
                                };

                                let nextElements = (() => {
                                  const list = [...(prev.elements || [])];
                                  if (t === ELEMENT_TYPES.FLOOR) {
                                    const withoutFloors = list.filter(
                                      (e) => e?.type !== ELEMENT_TYPES.FLOOR,
                                    );
                                    return [addedElement, ...withoutFloors];
                                  }
                                  if (t !== ELEMENT_TYPES.ZONE) {
                                    list.push(addedElement);
                                    return list;
                                  }
                                  const beforeZoneId = String(
                                    pos?.insertBeforeZoneId || "",
                                  ).trim();
                                  if (beforeZoneId) {
                                    const idx = list.findIndex(
                                      (e) =>
                                        e?.type === ELEMENT_TYPES.ZONE &&
                                        String(e?.id || "") === beforeZoneId,
                                    );
                                    if (idx >= 0) {
                                      list.splice(idx, 0, addedElement);
                                      return list;
                                    }
                                  }
                                  let lastZoneIdx = -1;
                                  for (let i = 0; i < list.length; i += 1) {
                                    if (list[i]?.type === ELEMENT_TYPES.ZONE) {
                                      lastZoneIdx = i;
                                    }
                                  }
                                  if (lastZoneIdx >= 0) {
                                    list.splice(
                                      lastZoneIdx + 1,
                                      0,
                                      addedElement,
                                    );
                                  } else {
                                    list.push(addedElement);
                                  }
                                  return list;
                                })();

                                if (t === ELEMENT_TYPES.ZONE)
                                  nextElements =
                                    clampZonesAndContainedElementsToFloor(
                                      nextElements,
                                    );

                                const zones = nextElements.filter(
                                  (e) => e?.type === ELEMENT_TYPES.ZONE,
                                );
                                const machines = nextElements.filter(
                                  (e) => e?.type === ELEMENT_TYPES.MACHINE,
                                );
                                const floors = nextElements.filter(
                                  (e) => e?.type === ELEMENT_TYPES.FLOOR,
                                );
                                let updatedZones = zones;
                                let updatedFloors = floors;

                                if (t === ELEMENT_TYPES.ZONE) {
                                  updatedFloors = expandFloorForZones(
                                    floors,
                                    zones,
                                  );
                                }

                                if (t === ELEMENT_TYPES.MACHINE) {
                                  const mcx = finalX + finalW / 2;
                                  const mcy = finalY + finalH / 2;
                                  const hitZone = zones.find(
                                    (z) =>
                                      mcx >= (Number(z?.x) || 0) &&
                                      mcx <=
                                        (Number(z?.x) || 0) +
                                          (Number(z?.w) || 0) &&
                                      mcy >= (Number(z?.y) || 0) &&
                                      mcy <=
                                        (Number(z?.y) || 0) +
                                          (Number(z?.h) || 0),
                                  );
                                  const targetZoneId =
                                    focusZone?.id || hitZone?.id || "";
                                  if (targetZoneId) {
                                    const targetZone = zones.find(
                                      (z) =>
                                        String(z.id) === String(targetZoneId),
                                    );
                                    const machineCount =
                                      countMachinesInsideZone(
                                        machines,
                                        targetZone,
                                      );
                                    updatedZones = resizeZoneByMachineCount(
                                      zones,
                                      targetZoneId,
                                      machineCount,
                                    );
                                  }
                                }

                                const floorById = new Map(
                                  updatedFloors.map((f) => [String(f.id), f]),
                                );
                                const zoneById = new Map(
                                  updatedZones.map((z) => [String(z.id), z]),
                                );
                                const rebuilt = nextElements.map((e) => {
                                  const id = String(e?.id || "");
                                  if (
                                    e?.type === ELEMENT_TYPES.FLOOR &&
                                    floorById.has(id)
                                  )
                                    return floorById.get(id);
                                  if (
                                    e?.type === ELEMENT_TYPES.ZONE &&
                                    zoneById.has(id)
                                  )
                                    return zoneById.get(id);
                                  return e;
                                });

                                const hadFloor = nextElements.some(
                                  (e) => e?.type === ELEMENT_TYPES.FLOOR,
                                );
                                if (!hadFloor && updatedFloors.length) {
                                  rebuilt.push(updatedFloors[0]);
                                }
                                const normalizedElements =
                                  t === ELEMENT_TYPES.ZONE ||
                                  t === ELEMENT_TYPES.MACHINE
                                    ? relayoutMachinesInZones(rebuilt)
                                    : rebuilt;

                                const shouldResize =
                                  t === ELEMENT_TYPES.ZONE ||
                                  t === ELEMENT_TYPES.MACHINE;
                                const nextPlaneScale = shouldResize
                                  ? computePlaneScaleFromElements(
                                      normalizedElements,
                                    )
                                  : (prev?.threeD?.planeScale ?? 1);
                                const planeScale = Math.max(1, nextPlaneScale);

                                return {
                                  ...prev,
                                  threeD: {
                                    ...(prev.threeD || {}),
                                    planeScale,
                                  },
                                  elements: normalizedElements,
                                };
                              })()
                            : prev,
                        );
                        setSelectedId(newId);
                        setActiveTool("select");

                        // Clear name input after adding floor/zone/walkway
                        if (
                          t === ELEMENT_TYPES.FLOOR ||
                          t === ELEMENT_TYPES.ZONE ||
                          t === ELEMENT_TYPES.WALKWAY
                        ) {
                          setNameInput("");
                        }

                        if (machineSeed) {
                          setPendingMachinePlacement(null);
                          pushToast({
                            kind: "success",
                            message:
                              "Machine placed on the highlighted preview mark.",
                            ts: Date.now(),
                          });
                        } else if (t === ELEMENT_TYPES.ZONE) {
                          pushToast({
                            kind: "success",
                            message:
                              "Zone added and auto-aligned. Layout condensed to fit all zones.",
                            ts: Date.now(),
                          });
                        } else if (t === ELEMENT_TYPES.WALKWAY) {
                          pushToast({
                            kind: "success",
                            message: "Walkway added.",
                            ts: Date.now(),
                          });
                        } else if (t === ELEMENT_TYPES.FLOOR) {
                          pushToast({
                            kind: "success",
                            message: "Floor added.",
                            ts: Date.now(),
                          });
                        } else if (t === ELEMENT_TYPES.TRANSPORTER) {
                          pushToast({
                            kind: "success",
                            message: "Transporter added.",
                            ts: Date.now(),
                          });
                        }
                      }
                    : undefined
                }
                zoneRearrangeMode={isFullscreen ? zoneRearrangeMode : false}
                zoneSwapSourceId={isFullscreen ? zoneSwapSourceId : ""}
                onZoneSwapPick={isFullscreen ? handleZoneSwapPick : undefined}
                zoneMergeMode={isFullscreen ? zoneMergeMode : false}
                zoneMergeSelectedIds={isFullscreen ? zoneMergeSelectedIds : []}
                onZoneMergePick={isFullscreen ? handleZoneMergePick : undefined}
                machineRearrangeMode={
                  isFullscreen ? machineRearrangeMode : false
                }
                machineSwapSourceId={isFullscreen ? machineSwapSourceId : ""}
                onMachineSwapPick={
                  isFullscreen ? handleMachineSwapPick : undefined
                }
                onMoveElement={
                  isFullscreen
                    ? (id, patch) => {
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                elements: (prev.elements || []).map((e) => {
                                  if (String(e.id) !== String(id)) return e;
                                  return { ...e, ...patch };
                                }),
                              }
                            : prev,
                        );
                      }
                    : undefined
                }
                onUpdateElement={
                  isFullscreen
                    ? (id, patch) => {
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                elements: (prev.elements || []).map((e) =>
                                  String(e.id) === String(id)
                                    ? { ...e, ...patch }
                                    : e,
                                ),
                              }
                            : prev,
                        );
                      }
                    : undefined
                }
              />
            ) : (
              <DepartmentFloor3DViewer
                modelUrl={
                  draft?.threeD?.floorModelUrl || "/models/floor-model.glb"
                }
                scale={floorScale}
                planeScale={draft?.threeD?.planeScale}
                autoRotate={!!draft?.threeD?.floorModelAutoRotate}
                elements={draft?.elements || []}
                showMachineMarkers={showMachineMarkers}
                showMachineLabels={showMachineLabels}
                machineMetaById={machineMetaById}
                onOpenMachineDetails={onOpenMachineDetails}
                machineStatusVisibility={machineStatusVisibility}
                fullScreen={false}
                activeTool="select"
                selectedId=""
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
