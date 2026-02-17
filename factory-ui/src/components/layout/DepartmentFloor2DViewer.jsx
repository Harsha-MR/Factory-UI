import { useEffect, useMemo, useRef, useState } from "react";
import { ELEMENT_TYPES } from "./layoutTypes";
import { computeMachineOeePct } from "../dashboard/utils";
import { MachineGlyph, TransporterIcon } from "./icons";

const MIN_ZONE_SIZE = 0.18;

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function asType(activeTool) {
  if (activeTool === "add:machine") return ELEMENT_TYPES.MACHINE;
  if (activeTool === "add:zone") return ELEMENT_TYPES.ZONE;
  if (activeTool === "add:walkway") return ELEMENT_TYPES.WALKWAY;
  if (activeTool === "add:transporter") return ELEMENT_TYPES.TRANSPORTER;
  if (activeTool === "add:floor") return ELEMENT_TYPES.FLOOR;
  return "";
}

function statusTint(status) {
  const s = String(status || "").toUpperCase();
  if (s === "DOWN") return "bg-red-500/40";
  if (s === "IDLE") return "bg-yellow-400/45";
  // if (s === "MAINTENANCE") return "bg-purple-500/40"; // TEMP commented
  if (s === "OFF" || s === "OFFLINE") return "bg-gray-500/42";
  return "bg-green-500/40";
}

function statusTone(status) {
  const s = String(status || "").toUpperCase();
  if (s === "DOWN") {
    return {
      glow: "bg-red-500/34",
      badge: "bg-red-500",
      nameBg: "bg-red-900/85",
      border: "border-red-500/70",
    };
  }
  if (s === "IDLE") {
    return {
      glow: "bg-yellow-400/36",
      badge: "bg-yellow-400",
      nameBg: "bg-yellow-900/85",
      border: "border-yellow-500/75",
    };
  }
  if (s === "WARNING") {
    return {
      glow: "bg-orange-500/34",
      badge: "bg-orange-500",
      nameBg: "bg-orange-900/85",
      border: "border-orange-500/75",
    };
  }
  // if (s === "MAINTENANCE") {
  //   return {
  //     glow: "bg-purple-500/34",
  //     badge: "bg-purple-500",
  //     nameBg: "bg-purple-900/85",
  //     border: "border-purple-500/75",
  //   };
  // }
  if (s === "OFF" || s === "OFFLINE") {
    return {
      glow: "bg-gray-500/36",
      badge: "bg-gray-500",
      nameBg: "bg-gray-800/85",
      border: "border-gray-500/80",
    };
  }
  return {
    glow: "bg-green-500/36",
    badge: "bg-green-500",
    nameBg: "bg-green-900/85",
    border: "border-green-500/75",
  };
}

// TEMP: hide status color visibility in 2D editor without affecting data/logic.
const HIDE_STATUS_COLOR_VISIBILITY = true;

function neutralTone() {
  return {
    border: "border-slate-300/90",
    glow: "bg-transparent",
    badge: "bg-transparent",
    nameBg: "bg-slate-800/85",
  };
}

function compactMachineLabel(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const m = raw.match(/\d+/);
  if (m) return `M-${m[0]}`;
  return raw.length > 6 ? raw.slice(0, 6) : raw;
}

function machineImageByStatus() {
  return "/icons/machine-cnc.svg";
}

function isVisibleByStatus(status, machineStatusVisibility) {
  if (String(status || "").toUpperCase() === "MAINTENANCE") return false;
  if (!machineStatusVisibility || machineStatusVisibility.ALL) return true;
  const key = String(status || "RUNNING").toUpperCase();
  if (key === "OFFLINE") return !!machineStatusVisibility.OFF;
  return !!machineStatusVisibility[key];
}

function machineDisplayName(el, machineMetaById) {
  const mid = String(el?.machineId || "");
  return (
    machineMetaById?.[mid]?.name ||
    el?.label ||
    (mid ? `Machine ${mid}` : "Machine")
  );
}

function machineOrderIndex(machine) {
  const raw = Number(machine?.meta?.slotIndex);
  return Number.isFinite(raw) ? raw : Number.POSITIVE_INFINITY;
}

function sortMachinesForZone(a, b, machineMetaById) {
  const ai = machineOrderIndex(a);
  const bi = machineOrderIndex(b);
  if (ai !== bi) return ai - bi;
  return machineDisplayName(a, machineMetaById).localeCompare(
    machineDisplayName(b, machineMetaById),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
}

export default function DepartmentFloor2DViewer({
  elements = [],
  showMachineMarkers = true,
  showMachineLabels = true,
  machineMetaById = {},
  onOpenMachineDetails,
  machineStatusVisibility,
  onPointerPositionChange,
  fullScreen = false,
  activeTool = "select",
  selectedId = "",
  onSelectElement,
  onAddElement,
  onMoveElement,
  onUpdateElement,
  focusedZoneId = "",
  onFocusZoneChange,
  zoneRearrangeMode = false,
  zoneSwapSourceId = "",
  onZoneSwapPick,
  zoneMergeMode = false,
  zoneMergeSelectedIds = [],
  onZoneMergePick,
  machineRearrangeMode = false,
  machineSwapSourceId = "",
  onMachineSwapPick,
}) {
  const containerRef = useRef(null);
  const boardRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [hoverNorm, setHoverNorm] = useState(null);
  const [dragState, setDragState] = useState(null);
  const [drawState, setDrawState] = useState(null);
  const [pointerCaptureId, setPointerCaptureId] = useState(null);

  const addType = asType(activeTool);
  const isAddRectTool =
    fullScreen &&
    (addType === ELEMENT_TYPES.FLOOR || addType === ELEMENT_TYPES.WALKWAY);
  const isAddPointTool =
    fullScreen &&
    (addType === ELEMENT_TYPES.MACHINE ||
      addType === ELEMENT_TYPES.TRANSPORTER ||
      addType === ELEMENT_TYPES.ZONE);
  const isAddMode = fullScreen && !!addType;
  const isMachineAddMode = isAddMode && addType === ELEMENT_TYPES.MACHINE;

  const renderElements = useMemo(
    () =>
      (Array.isArray(elements) ? elements : []).filter((el) => {
        if (el?.type !== ELEMENT_TYPES.MACHINE) return true;
        const meta = machineMetaById?.[String(el.machineId || "")];
        return isVisibleByStatus(
          meta?.status || "RUNNING",
          machineStatusVisibility,
        );
      }),
    [elements, machineMetaById, machineStatusVisibility],
  );

  const focusedZone = useMemo(() => {
    if (!focusedZoneId) return null;
    return renderElements.find(
      (el) =>
        el?.type === ELEMENT_TYPES.ZONE &&
        String(el?.id) === String(focusedZoneId),
    );
  }, [renderElements, focusedZoneId]);
  const zoneCount = useMemo(
    () => renderElements.filter((e) => e?.type === ELEMENT_TYPES.ZONE).length,
    [renderElements],
  );
  const zoneElements = useMemo(
    () => renderElements.filter((e) => e?.type === ELEMENT_TYPES.ZONE),
    [renderElements],
  );
  const zoneSizeBaseline = useMemo(() => {
    const valuesW = zoneElements
      .map((z) => Number(z?.w) || 0)
      .filter((v) => Number.isFinite(v) && v > 0.05)
      .sort((a, b) => a - b);
    const valuesH = zoneElements
      .map((z) => Number(z?.h) || 0)
      .filter((v) => Number.isFinite(v) && v > 0.05)
      .sort((a, b) => a - b);

    const median = (arr, fallback) => {
      if (!arr.length) return fallback;
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    };

    return {
      w: Math.max(MIN_ZONE_SIZE, median(valuesW, 0.34)),
      h: Math.max(MIN_ZONE_SIZE, median(valuesH, 0.34)),
    };
  }, [zoneElements]);

  const zoneById = useMemo(() => {
    const map = new Map();
    for (const z of zoneElements) map.set(String(z.id), z);
    return map;
  }, [zoneElements]);
  const zoneByName = useMemo(() => {
    const map = new Map();
    for (const z of zoneElements) {
      const key = String(z?.label || "").trim();
      if (!key) continue;
      map.set(key, z);
    }
    return map;
  }, [zoneElements]);

  const focusPad = 0.02;
  const focusSize = 1 - focusPad * 2;
  const allZonesOrdered = useMemo(() => {
    // Row-bucket tolerance for sort in all-zones view.
    // Prevents tiny Y differences from reordering zones unexpectedly.
    const ROW_Y_TOLERANCE = 0.08;
    return [...zoneElements].sort((a, b) => {
      const ay = Number(a?.y) || 0;
      const by = Number(b?.y) || 0;
      if (Math.abs(ay - by) > ROW_Y_TOLERANCE) return ay - by;
      const ax = Number(a?.x) || 0;
      const bx = Number(b?.x) || 0;
      return ax - bx;
    });
  }, [zoneElements]);

  const allZonesRects = useMemo(() => {
    const zones = allZonesOrdered;
    const count = zones.length;
    if (!count) return new Map();

    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const pad = 0.02;
    const gap = 0.03;
    const usableW = 1 - pad * 2 - gap * (cols - 1);
    const usableH = 1 - pad * 2 - gap * (rows - 1);
    const cellW = Math.max(0.12, usableW / cols);
    const cellH = Math.max(0.12, usableH / rows);

    const map = new Map();
    zones.forEach((z, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      map.set(String(z.id), {
        x: clamp01(pad + col * (cellW + gap)),
        y: clamp01(pad + row * (cellH + gap)),
        w: clamp01(cellW),
        h: clamp01(cellH),
      });
    });
    return map;
  }, [allZonesOrdered]);

  const findInsertBeforeZoneId = (pointer) => {
    if (focusedZone || !pointer || !allZonesOrdered.length) return "";
    const items = allZonesOrdered
      .map((z) => {
        const r = allZonesRects.get(String(z?.id || ""));
        if (!r) return null;
        return { id: String(z.id), rect: r };
      })
      .filter(Boolean);
    if (!items.length) return "";

    const ROW_TOL = 0.08;
    const rows = [];
    for (const it of items) {
      const y = Number(it.rect?.y) || 0;
      const last = rows[rows.length - 1];
      if (!last || Math.abs(y - last.yRef) > ROW_TOL) {
        rows.push({ yRef: y, items: [it] });
      } else {
        last.items.push(it);
        last.yRef =
          (last.yRef * (last.items.length - 1) + y) / last.items.length;
      }
    }

    let rowIndex = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < rows.length; i += 1) {
      const d = Math.abs(pointer.y - rows[i].yRef);
      if (d < best) {
        best = d;
        rowIndex = i;
      }
    }

    const row = rows[rowIndex];
    row.items.sort(
      (a, b) => (Number(a.rect?.x) || 0) - (Number(b.rect?.x) || 0),
    );
    for (const it of row.items) {
      const centerX = (Number(it.rect?.x) || 0) + (Number(it.rect?.w) || 0) / 2;
      if (pointer.x <= centerX) return it.id;
    }

    if (rowIndex < rows.length - 1) {
      const nextRow = rows[rowIndex + 1];
      nextRow.items.sort(
        (a, b) => (Number(a.rect?.x) || 0) - (Number(b.rect?.x) || 0),
      );
      return String(nextRow.items[0]?.id || "");
    }
    return "";
  };

  const isInsideZone = (el, zone) => {
    if (!el || !zone) return false;
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

  const nearestZoneForElement = (el) => {
    if (!el || !zoneElements.length) return null;
    const ex = Number(el?.x) || 0;
    const ey = Number(el?.y) || 0;
    const ew = Number(el?.w) || 0;
    const eh = Number(el?.h) || 0;
    const cx = ex + ew / 2;
    const cy = ey + eh / 2;
    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const z of zoneElements) {
      const zx = Number(z?.x) || 0;
      const zy = Number(z?.y) || 0;
      const zw = Number(z?.w) || 0;
      const zh = Number(z?.h) || 0;
      const zcx = zx + zw / 2;
      const zcy = zy + zh / 2;
      const dx = zcx - cx;
      const dy = zcy - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        best = z;
      }
    }
    return best;
  };

  const findZoneForElement = (el) => {
    if (!el) return null;
    if (el?.type === ELEMENT_TYPES.MACHINE) {
      const explicitZoneId = String(el?.meta?.zoneId || "").trim();
      if (explicitZoneId && zoneById.has(explicitZoneId)) {
        return zoneById.get(explicitZoneId);
      }
      const elementZoneName = String(el?.meta?.zoneName || "").trim();
      if (elementZoneName && zoneByName.has(elementZoneName)) {
        return zoneByName.get(elementZoneName);
      }
    }
    for (const z of zoneElements) {
      if (isInsideZone(el, z)) return z;
    }
    if (el?.type === ELEMENT_TYPES.MACHINE) {
      const machineZoneName = String(
        machineMetaById?.[String(el?.machineId || "")]?.zoneName || "",
      ).trim();
      if (machineZoneName && zoneByName.has(machineZoneName)) {
        return zoneByName.get(machineZoneName);
      }
    }
    return nearestZoneForElement(el);
  };

  const machinesByZone = (() => {
    const grouped = new Map();
    const machines = renderElements.filter(
      (e) => e?.type === ELEMENT_TYPES.MACHINE,
    );
    for (const m of machines) {
      const z = findZoneForElement(m);
      if (!z) continue;
      const zid = String(z.id);
      if (!grouped.has(zid)) grouped.set(zid, []);
      grouped.get(zid).push(m);
    }
    for (const [zid, arr] of grouped.entries()) {
      arr.sort((a, b) => sortMachinesForZone(a, b, machineMetaById));
      grouped.set(zid, arr);
    }
    return grouped;
  })();

  const toViewRect = (el) => {
    if (!focusedZone) {
      if (el?.type === ELEMENT_TYPES.ZONE) {
        const auto = allZonesRects.get(String(el?.id));
        if (auto) return auto;
      }
      return {
        x: clamp01(Number(el?.x) || 0),
        y: clamp01(Number(el?.y) || 0),
        w: Math.max(0.02, clamp01(Number(el?.w) || 0.12)),
        h: Math.max(0.02, clamp01(Number(el?.h) || 0.12)),
      };
    }

    if (el?.type === ELEMENT_TYPES.ZONE) {
      return { x: focusPad, y: focusPad, w: focusSize, h: focusSize };
    }

    const zx = Number(focusedZone?.x) || 0;
    const zy = Number(focusedZone?.y) || 0;
    const zw = Math.max(0.0001, Number(focusedZone?.w) || 1);
    const zh = Math.max(0.0001, Number(focusedZone?.h) || 1);
    const ex = Number(el?.x) || 0;
    const ey = Number(el?.y) || 0;
    const ew = Number(el?.w) || 0;
    const eh = Number(el?.h) || 0;

    return {
      x: clamp01(focusPad + ((ex - zx) / zw) * focusSize),
      y: clamp01(focusPad + ((ey - zy) / zh) * focusSize),
      w: Math.max(0.01, clamp01((ew / zw) * focusSize)),
      h: Math.max(0.01, clamp01((eh / zh) * focusSize)),
    };
  };

  const fromViewRect = (x, y, w, h) => {
    if (!focusedZone) return { x, y, w, h };
    const zx = Number(focusedZone?.x) || 0;
    const zy = Number(focusedZone?.y) || 0;
    const zw = Math.max(0.0001, Number(focusedZone?.w) || 1);
    const zh = Math.max(0.0001, Number(focusedZone?.h) || 1);
    const localX = (x - focusPad) / focusSize;
    const localY = (y - focusPad) / focusSize;
    const localW = w / focusSize;
    const localH = h / focusSize;
    return {
      x: clamp01(zx + clamp01(localX) * zw),
      y: clamp01(zy + clamp01(localY) * zh),
      w: Math.max(0.01, clamp01(localW * zw)),
      h: Math.max(0.01, clamp01(localH * zh)),
    };
  };

  const normFromClient = (clientX, clientY) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const x = clamp01((clientX - rect.left) / rect.width);
    const y = clamp01((clientY - rect.top) / rect.height);
    return { x, y, rect };
  };

  const patchMove = (id, x, y, w, h) => {
    const mapped = fromViewRect(x, y, w, h);
    const nx = clamp01(mapped.x);
    const ny = clamp01(mapped.y);
    const nw = clamp01(mapped.w);
    const nh = clamp01(mapped.h);
    if (typeof onMoveElement === "function") {
      onMoveElement(id, { x: nx, y: ny, w: nw, h: nh });
      return;
    }
    if (typeof onUpdateElement === "function") {
      onUpdateElement(id, { x: nx, y: ny, w: nw, h: nh });
    }
  };

  // Safety: auto-recover zones that accidentally became tiny.
  useEffect(() => {
    if (!fullScreen || typeof onUpdateElement !== "function") return;
    for (const el of zoneElements) {
      if (el?.type !== ELEMENT_TYPES.ZONE) continue;
      const w = Number(el?.w) || 0;
      const h = Number(el?.h) || 0;
      const minAllowedW = Math.max(MIN_ZONE_SIZE, zoneSizeBaseline.w * 0.7);
      const minAllowedH = Math.max(MIN_ZONE_SIZE, zoneSizeBaseline.h * 0.7);
      if (w >= minAllowedW && h >= minAllowedH) continue;
      const nextW = zoneSizeBaseline.w;
      const nextH = zoneSizeBaseline.h;
      const x = clamp01(Number(el?.x) || 0);
      const y = clamp01(Number(el?.y) || 0);
      onUpdateElement(String(el.id), {
        x: Math.min(x, Math.max(0, 1 - nextW)),
        y: Math.min(y, Math.max(0, 1 - nextH)),
        w: nextW,
        h: nextH,
      });
    }
  }, [zoneElements, zoneSizeBaseline, fullScreen, onUpdateElement]);

  const onCanvasPointerMove = (e) => {
    const n = normFromClient(e.clientX, e.clientY);
    if (!n) return;
    setHoverNorm({ x: n.x, y: n.y });
    if (typeof onPointerPositionChange === "function") {
      onPointerPositionChange({ x: n.x, y: n.y });
    }

    if (drawState) {
      setDrawState((prev) =>
        prev ? { ...prev, current: { x: n.x, y: n.y } } : prev,
      );
    }

    if (dragState) {
      let nextX = n.x - dragState.offsetX;
      let nextY = n.y - dragState.offsetY;
      let moveW = dragState.w;
      let moveH = dragState.h;

      const draggedEl = renderElements.find(
        (el) => String(el?.id) === String(dragState.id),
      );

      // Disable rearrangement for zones and machines (keep legacy stable behavior).
      if (
        draggedEl?.type === ELEMENT_TYPES.ZONE ||
        draggedEl?.type === ELEMENT_TYPES.MACHINE
      ) {
        return;
      }

      // Zone drag should move position only (keep zone size from source element).
      if (draggedEl?.type === ELEMENT_TYPES.ZONE) {
        moveW = Math.max(MIN_ZONE_SIZE, Number(draggedEl?.w) || dragState.w);
        moveH = Math.max(MIN_ZONE_SIZE, Number(draggedEl?.h) || dragState.h);
      }

      // Constrain machines to remain inside their current zone body.
      if (draggedEl?.type === ELEMENT_TYPES.MACHINE) {
        const homeZone = focusedZone || findZoneForElement(draggedEl);
        if (homeZone) {
          const zoneRect = toViewRect(homeZone);
          const headerH = Math.min(0.08, Math.max(0.035, zoneRect.h * 0.15));
          const bodyPad = Math.max(0.004, zoneRect.w * 0.01);
          const bodyX = zoneRect.x + bodyPad;
          const bodyY = zoneRect.y + headerH + bodyPad;
          const bodyW = Math.max(0.02, zoneRect.w - bodyPad * 2);
          const bodyH = Math.max(0.02, zoneRect.h - headerH - bodyPad * 2);

          const minX = bodyX;
          const minY = bodyY;
          const maxX = Math.max(minX, bodyX + bodyW - dragState.w);
          const maxY = Math.max(minY, bodyY + bodyH - dragState.h);
          nextX = Math.max(minX, Math.min(maxX, nextX));
          nextY = Math.max(minY, Math.min(maxY, nextY));
        }
      }

      patchMove(
        dragState.id,
        Math.max(0, Math.min(1 - moveW, nextX)),
        Math.max(0, Math.min(1 - moveH, nextY)),
        moveW,
        moveH,
      );
    }
  };

  const onCanvasPointerUp = (e) => {
    if (drawState && typeof onAddElement === "function") {
      const start = drawState.start;
      const current = drawState.current || drawState.start;
      const x = clamp01(Math.min(start.x, current.x));
      const y = clamp01(Math.min(start.y, current.y));
      const w = Math.max(
        drawState.type === ELEMENT_TYPES.WALKWAY ? 0.01 : 0.02,
        Math.abs(start.x - current.x),
      );
      const h = Math.max(
        drawState.type === ELEMENT_TYPES.WALKWAY ? 0.006 : 0.02,
        Math.abs(start.y - current.y),
      );

      const mapped = fromViewRect(x, y, clamp01(w), clamp01(h));

      onAddElement(drawState.type, {
        x: mapped.x,
        y: mapped.y,
        w: mapped.w,
        h: mapped.h,
        rotationDeg: 0,
        ...(drawState.type === ELEMENT_TYPES.ZONE
          ? { color: "dark-green" }
          : null),
      });
    }
    setDragState(null);
    setDrawState(null);

    if (pointerCaptureId != null) {
      try {
        e.currentTarget?.releasePointerCapture(pointerCaptureId);
      } catch {
        // Ignore release errors.
      }
      setPointerCaptureId(null);
    }
  };

  useEffect(() => {
    return () => {
      setDragState(null);
      setDrawState(null);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={
        fullScreen
          ? "relative h-full w-full overflow-auto rounded-xl border border-slate-300 bg-slate-100"
          : "relative h-full w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900"
      }
    >
      <div
        ref={boardRef}
        className={
          fullScreen ? "relative h-full w-full" : "relative h-full w-full"
        }
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerLeave={onCanvasPointerUp}
        onPointerDown={(e) => {
          if (fullScreen && !addType) {
            onSelectElement?.("");
            onFocusZoneChange?.("");
            return;
          }
          if (!fullScreen || !addType || typeof onAddElement !== "function")
            return;
          const n = normFromClient(e.clientX, e.clientY);
          if (!n) return;
          setPointerCaptureId(e.pointerId);
          e.currentTarget?.setPointerCapture?.(e.pointerId);

          if (isAddRectTool) {
            setDrawState({
              type: addType,
              start: { x: n.x, y: n.y },
              current: { x: n.x, y: n.y },
            });
            return;
          }

          if (isAddPointTool) {
            const mapped = fromViewRect(n.x, n.y, 0.12, 0.12);
            const insertBeforeZoneId =
              addType === ELEMENT_TYPES.ZONE
                ? findInsertBeforeZoneId({ x: n.x, y: n.y })
                : "";
            onAddElement(addType, {
              x: mapped.x,
              y: mapped.y,
              rotationDeg: 0,
              ...(insertBeforeZoneId ? { insertBeforeZoneId } : null),
            });
          }
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.18) 1px, transparent 1px)",
            backgroundSize: fullScreen ? "48px 48px" : "36px 36px",
          }}
        />

        {renderElements.map((el) => {
          if (
            focusedZone &&
            el?.type === ELEMENT_TYPES.ZONE &&
            String(el?.id) !== String(focusedZone?.id)
          ) {
            return null;
          }
          if (
            focusedZone &&
            el?.type !== ELEMENT_TYPES.ZONE &&
            el?.type !== ELEMENT_TYPES.MACHINE &&
            el?.type !== ELEMENT_TYPES.TRANSPORTER &&
            el?.type !== ELEMENT_TYPES.WALKWAY &&
            el?.type !== ELEMENT_TYPES.FLOOR
          ) {
            return null;
          }
          if (
            focusedZone &&
            el?.type === ELEMENT_TYPES.MACHINE &&
            String(findZoneForElement(el)?.id || "") !== String(focusedZone.id)
          ) {
            return null;
          }
          if (
            focusedZone &&
            el?.type !== ELEMENT_TYPES.ZONE &&
            el?.type !== ELEMENT_TYPES.MACHINE &&
            !isInsideZone(el, focusedZone)
          ) {
            return null;
          }

          let rect = toViewRect(el);
          const containerZone = findZoneForElement(el);
          if (containerZone && el?.type === ELEMENT_TYPES.MACHINE) {
            // Reserve a top header strip in each zone and auto-grid machines in the body.
            const zoneRect = toViewRect(containerZone);
            const headerH = Math.min(0.08, Math.max(0.035, zoneRect.h * 0.15));
            const bodyPad = Math.max(0.004, zoneRect.w * 0.01);
            const bodyX = zoneRect.x + bodyPad;
            const bodyY = zoneRect.y + headerH + bodyPad;
            const bodyW = Math.max(0.02, zoneRect.w - bodyPad * 2);
            const bodyH = Math.max(0.02, zoneRect.h - headerH - bodyPad * 2);
            const zid = String(containerZone.id);
            const zoneMachines = machinesByZone.get(zid) || [];
            const machineIndex = zoneMachines.findIndex(
              (m) => String(m?.id) === String(el?.id),
            );
            const total = Math.max(1, zoneMachines.length);
            // Keep compact grid balanced in all-zones view so icon stays readable.
            const cols = focusedZone ? 10 : Math.min(8, Math.max(6, total));
            const rows = Math.max(3, Math.ceil(total / cols));
            const gapX = Math.max(0.002, bodyW * (focusedZone ? 0.01 : 0.016));
            const gapY = Math.max(0.002, bodyH * (focusedZone ? 0.02 : 0.026));
            const cellW = Math.max(0.01, (bodyW - gapX * (cols - 1)) / cols);
            const cellH = Math.max(0.01, (bodyH - gapY * (rows - 1)) / rows);
            const col = Math.max(0, machineIndex) % cols;
            const row = Math.floor(Math.max(0, machineIndex) / cols);
            const itemPad = Math.max(
              0.001,
              Math.min(cellW, cellH) * (focusedZone ? 0.08 : 0.05),
            );
            rect = {
              x: clamp01(bodyX + col * (cellW + gapX) + itemPad),
              y: clamp01(bodyY + row * (cellH + gapY) + itemPad),
              w: Math.max(0.01, clamp01(cellW - itemPad * 2)),
              h: Math.max(0.01, clamp01(cellH - itemPad * 2)),
            };
          }
          const left = `${rect.x * 100}%`;
          const top = `${rect.y * 100}%`;
          const width = `${rect.w * 100}%`;
          const height = `${rect.h * 100}%`;
          const rotation = Number(el?.rotationDeg) || 0;
          const isSelected = String(selectedId) === String(el?.id);

          if (el?.type === ELEMENT_TYPES.FLOOR) {
            return (
              <div
                key={String(el.id)}
                className={
                  zoneCount > 0
                    ? "pointer-events-none absolute rounded-md border border-slate-300/80 bg-gradient-to-br from-slate-100/55 to-slate-200/55"
                    : "pointer-events-none absolute rounded-md border border-slate-400 bg-gradient-to-br from-slate-100 to-slate-200"
                }
                style={{
                  left,
                  top,
                  width,
                  height,
                  transform: `rotate(${rotation}deg)`,
                }}
              />
            );
          }

          if (el?.type === ELEMENT_TYPES.ZONE) {
            const isMergeSelected =
              zoneMergeMode &&
              Array.isArray(zoneMergeSelectedIds) &&
              zoneMergeSelectedIds.some(
                (id) => String(id) === String(el?.id || ""),
              );
            const isSwapSource =
              zoneRearrangeMode &&
              String(zoneSwapSourceId || "") === String(el?.id || "");
            return (
              <button
                key={String(el.id)}
                type="button"
                className={
                  isMergeSelected
                    ? `absolute z-[6] overflow-hidden rounded-lg border-2 border-violet-600 bg-violet-200/35 text-left ${isAddMode && !isMachineAddMode ? "pointer-events-none" : ""}`
                    : isSwapSource
                      ? `absolute z-[6] overflow-hidden rounded-lg border-2 border-sky-600 bg-sky-100/35 text-left ${isAddMode && !isMachineAddMode ? "pointer-events-none" : ""}`
                      : isSelected
                        ? `absolute z-[5] overflow-hidden rounded-lg border-2 border-sky-500 bg-emerald-100/10 text-left ${isAddMode && !isMachineAddMode ? "pointer-events-none" : ""}`
                        : `absolute z-[5] overflow-hidden rounded-lg border border-emerald-400/70 bg-emerald-100/10 text-left ${isAddMode && !isMachineAddMode ? "pointer-events-none" : ""}`
                }
                style={{
                  left,
                  top,
                  width,
                  height,
                  transform: `rotate(${rotation}deg)`,
                }}
                onPointerDown={(e) => {
                  if (!fullScreen) return;
                  e.stopPropagation();
                  if (zoneMergeMode && typeof onZoneMergePick === "function") {
                    onZoneMergePick(String(el.id));
                    return;
                  }
                  if (
                    zoneRearrangeMode &&
                    typeof onZoneSwapPick === "function"
                  ) {
                    onZoneSwapPick(String(el.id));
                    return;
                  }
                  // Always focus the clicked zone in fullscreen editor so it opens wide.
                  if (isAddMode && !isMachineAddMode) return;
                  onFocusZoneChange?.(String(el.id));
                  onSelectElement?.(String(el.id));
                }}
              >
                <div className="absolute inset-x-0 top-0 z-[30] h-7 border-b border-emerald-400/70 bg-emerald-200/100 px-2">
                  <div className="truncate text-xs font-semibold leading-7 text-emerald-950">
                    {el.label || "Zone"}
                  </div>
                </div>
              </button>
            );
          }

          if (el?.type === ELEMENT_TYPES.WALKWAY) {
            return (
              <button
                key={String(el.id)}
                type="button"
                className={
                  isSelected
                    ? `absolute z-[2] rounded-md border-2 border-sky-500 bg-slate-800/80 ${isAddMode ? "pointer-events-none" : ""}`
                    : `absolute z-[2] rounded-md border border-slate-600 bg-slate-800/65 ${isAddMode ? "pointer-events-none" : ""}`
                }
                style={{
                  left,
                  top,
                  width,
                  height,
                  transform: `rotate(${rotation}deg)`,
                }}
                onPointerDown={(e) => {
                  if (!fullScreen || isAddMode) return;
                  e.stopPropagation();
                  onSelectElement?.(String(el.id));
                  const n = normFromClient(e.clientX, e.clientY);
                  if (!n) return;
                  const w = rect.w;
                  const h = rect.h;
                  const x = rect.x;
                  const y = rect.y;
                  setDragState({
                    id: String(el.id),
                    w,
                    h,
                    offsetX: n.x - x,
                    offsetY: n.y - y,
                  });
                }}
              />
            );
          }

          if (el?.type === ELEMENT_TYPES.TRANSPORTER) {
            return (
              <button
                key={String(el.id)}
                type="button"
                className={
                  isSelected
                    ? `absolute z-[3] flex items-center justify-center rounded-lg border-2 border-sky-500 bg-white/90 ${isAddMode ? "pointer-events-none" : ""}`
                    : `absolute z-[3] flex items-center justify-center rounded-lg border border-slate-400 bg-white/80 ${isAddMode ? "pointer-events-none" : ""}`
                }
                style={{
                  left,
                  top,
                  width,
                  height,
                  transform: `rotate(${rotation}deg)`,
                }}
                onPointerDown={(e) => {
                  if (!fullScreen || isAddMode) return;
                  e.stopPropagation();
                  onSelectElement?.(String(el.id));
                  const n = normFromClient(e.clientX, e.clientY);
                  if (!n) return;
                  const w = rect.w;
                  const h = rect.h;
                  const x = rect.x;
                  const y = rect.y;
                  setDragState({
                    id: String(el.id),
                    w,
                    h,
                    offsetX: n.x - x,
                    offsetY: n.y - y,
                  });
                }}
              >
                <TransporterIcon className="h-5 w-5 text-slate-700" />
              </button>
            );
          }

          if (el?.type === ELEMENT_TYPES.MACHINE && showMachineMarkers) {
            const machineId = String(el.machineId || "");
            const meta = machineMetaById?.[machineId];
            const status = meta?.status || "RUNNING";
            const name = machineDisplayName(el, machineMetaById);
            const compactZoneView = !focusedZone;
            const tone = HIDE_STATUS_COLOR_VISIBILITY
              ? neutralTone()
              : statusTone(status);
            const compactName = compactMachineLabel(name);
            const oee = meta ? computeMachineOeePct(meta) : null;
            return (
              <button
                key={String(el.id)}
                type="button"
                className={
                  isAddMode || zoneRearrangeMode || zoneMergeMode
                    ? "pointer-events-none absolute z-[20] rounded-md"
                    : machineRearrangeMode &&
                        String(machineSwapSourceId || "") ===
                          String(el?.id || "")
                      ? `absolute z-[20] rounded-md ring-2 ring-indigo-500/95 ${isAddMode ? "pointer-events-none" : ""}`
                      : isSelected
                        ? `absolute z-[20] rounded-md ring-2 ring-sky-500/90 ${isAddMode ? "pointer-events-none" : ""}`
                        : `absolute z-[20] rounded-md ${isAddMode ? "pointer-events-none" : ""}`
                }
                style={{
                  left,
                  top,
                  width,
                  height,
                  transform: `rotate(${rotation}deg)`,
                }}
                onPointerDown={(e) => {
                  if (isAddMode) return;
                  e.stopPropagation();
                  if (
                    machineRearrangeMode &&
                    typeof onMachineSwapPick === "function"
                  ) {
                    onMachineSwapPick(String(el.id));
                    return;
                  }
                  if (fullScreen) {
                    onSelectElement?.(String(el.id));
                    return;
                  }
                  if (typeof onOpenMachineDetails === "function" && machineId) {
                    onOpenMachineDetails(machineId);
                  }
                }}
                onMouseEnter={(e) => {
                  if (isAddMode) return;
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setHover({
                    id: String(el.id),
                    name,
                    status,
                    oee,
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                  });
                }}
                onMouseMove={(e) => {
                  if (isAddMode) return;
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setHover((prev) =>
                    prev
                      ? {
                          ...prev,
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top,
                        }
                      : prev,
                  );
                }}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className={`relative h-full w-full overflow-hidden rounded-sm border ${tone.border}`}
                >
                  {!HIDE_STATUS_COLOR_VISIBILITY ? (
                    <div
                      className={`absolute inset-[2%] rounded-md ${tone.glow}`}
                    />
                  ) : null}
                  {!HIDE_STATUS_COLOR_VISIBILITY ? (
                    <div
                      className={`absolute inset-x-0 top-0 ${compactZoneView ? "h-0.5" : "h-1"} ${statusTint(status)}`}
                    />
                  ) : null}
                  <img
                    src={machineImageByStatus()}
                    alt="Machine"
                    className={`pointer-events-none absolute inset-0 m-auto object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.32)] ${
                      compactZoneView ? "h-[95%] w-[95%]" : "h-[98%] w-[98%]"
                    }`}
                  />
                  {!HIDE_STATUS_COLOR_VISIBILITY ? (
                    <div
                      className={`absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ${tone.badge}`}
                    />
                  ) : null}
                  {compactZoneView ? (
                    <div
                      className={`absolute inset-x-0.5 bottom-0.5 truncate rounded px-0.5 py-[1px] text-center text-[6px] font-semibold leading-tight text-white ${tone.nameBg}`}
                    >
                      {compactName}
                    </div>
                  ) : (
                    <div
                      className={`absolute inset-x-1 bottom-0.5 rounded px-1 py-[1px] text-center text-[8px] font-semibold leading-tight text-white ${tone.nameBg}`}
                    >
                      {name}
                    </div>
                  )}
                </div>
                {showMachineLabels ? null : null}
              </button>
            );
          }

          return null;
        })}

        {drawState ? (
          <div
            className={
              drawState.type === ELEMENT_TYPES.WALKWAY
                ? "pointer-events-none absolute rounded-md border border-slate-700 bg-slate-700/35"
                : drawState.type === ELEMENT_TYPES.FLOOR
                  ? "pointer-events-none absolute rounded-md border border-slate-500 bg-slate-300/45"
                  : "pointer-events-none absolute rounded-lg border border-emerald-500 bg-emerald-300/35"
            }
            style={{
              left: `${Math.min(drawState.start.x, drawState.current.x) * 100}%`,
              top: `${Math.min(drawState.start.y, drawState.current.y) * 100}%`,
              width: `${Math.abs(drawState.start.x - drawState.current.x) * 100}%`,
              height: `${Math.abs(drawState.start.y - drawState.current.y) * 100}%`,
            }}
          />
        ) : null}

        {isAddPointTool && hoverNorm ? (
          <div
            className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-500 bg-cyan-300/35"
            style={{
              left: `${hoverNorm.x * 100}%`,
              top: `${hoverNorm.y * 100}%`,
            }}
          />
        ) : null}

        {hover ? (
          <div
            className="pointer-events-none absolute z-20 rounded-md border bg-white/95 px-2 py-1 text-[11px] text-slate-700 shadow"
            style={{ left: hover.x + 12, top: hover.y + 12 }}
          >
            <div className="font-semibold text-slate-900">{hover.name}</div>
            <div>
              Status: {hover.status} | OEE:{" "}
              {hover.oee == null ? "-" : `${hover.oee.toFixed(1)}%`}
            </div>
          </div>
        ) : null}

        {!renderElements.length ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-lg border bg-white/85 px-3 py-2 text-xs text-slate-600">
              No layout elements yet.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
