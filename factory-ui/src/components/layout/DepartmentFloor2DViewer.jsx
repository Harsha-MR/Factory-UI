import { useEffect, useMemo, useRef, useState } from "react";
import { ELEMENT_TYPES } from "./layoutTypes";
import { computeMachineOeePct } from "../dashboard/utils";
import { MachineGlyph, TransporterIcon } from "./icons";

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
  if (s === "DOWN") return "bg-red-500/35";
  if (s === "IDLE") return "bg-amber-500/35";
  if (s === "MAINTENANCE") return "bg-purple-500/35";
  if (s === "OFF" || s === "OFFLINE") return "bg-slate-400/35";
  return "bg-emerald-500/35";
}

function isVisibleByStatus(status, machineStatusVisibility) {
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
        return isVisibleByStatus(meta?.status || "RUNNING", machineStatusVisibility);
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
      const machineZoneName = String(
        machineMetaById?.[String(el?.machineId || "")]?.zoneName ||
          el?.meta?.zoneName ||
          "",
      ).trim();
      if (machineZoneName && zoneByName.has(machineZoneName)) {
        return zoneByName.get(machineZoneName);
      }
    }
    for (const z of zoneElements) {
      if (isInsideZone(el, z)) return z;
    }
    return nearestZoneForElement(el);
  };

  const machinesByZone = (() => {
    const grouped = new Map();
    const machines = renderElements.filter((e) => e?.type === ELEMENT_TYPES.MACHINE);
    for (const m of machines) {
      const z = findZoneForElement(m);
      if (!z) continue;
      const zid = String(z.id);
      if (!grouped.has(zid)) grouped.set(zid, []);
      grouped.get(zid).push(m);
    }
    for (const [zid, arr] of grouped.entries()) {
      arr.sort((a, b) =>
        machineDisplayName(a, machineMetaById).localeCompare(
          machineDisplayName(b, machineMetaById),
          undefined,
          { numeric: true, sensitivity: "base" },
        ),
      );
      grouped.set(zid, arr);
    }
    return grouped;
  })();

  const toViewRect = (el) => {
    if (!focusedZone) {
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

  const onCanvasPointerMove = (e) => {
    const n = normFromClient(e.clientX, e.clientY);
    if (!n) return;
    setHoverNorm({ x: n.x, y: n.y });
    if (typeof onPointerPositionChange === "function") {
      onPointerPositionChange({ x: n.x, y: n.y });
    }

    if (drawState) {
      setDrawState((prev) => (prev ? { ...prev, current: { x: n.x, y: n.y } } : prev));
    }

    if (dragState) {
      const nextX = n.x - dragState.offsetX;
      const nextY = n.y - dragState.offsetY;
      patchMove(
        dragState.id,
        Math.max(0, Math.min(1 - dragState.w, nextX)),
        Math.max(0, Math.min(1 - dragState.h, nextY)),
        dragState.w,
        dragState.h,
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

      const mapped = fromViewRect(
        x,
        y,
        clamp01(w),
        clamp01(h),
      );

      onAddElement(drawState.type, {
        x: mapped.x,
        y: mapped.y,
        w: mapped.w,
        h: mapped.h,
        rotationDeg: 0,
        ...(drawState.type === ELEMENT_TYPES.ZONE ? { color: "dark-green" } : null),
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
          fullScreen
            ? "relative h-full w-full"
            : "relative h-full w-full"
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
          if (!fullScreen || !addType || typeof onAddElement !== "function") return;
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
            onAddElement(addType, {
              x: mapped.x,
              y: mapped.y,
              rotationDeg: 0,
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
        if (
          containerZone &&
          el?.type === ELEMENT_TYPES.MACHINE
        ) {
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
          const cols = 10;
          const rows = Math.max(3, Math.ceil(total / cols));
          const gapX = Math.max(0.002, bodyW * 0.01);
          const gapY = Math.max(0.002, bodyH * 0.02);
          const cellW = Math.max(0.01, (bodyW - gapX * (cols - 1)) / cols);
          const cellH = Math.max(0.01, (bodyH - gapY * (rows - 1)) / rows);
          const col = Math.max(0, machineIndex) % cols;
          const row = Math.floor(Math.max(0, machineIndex) / cols);
          const itemPad = Math.max(0.001, Math.min(cellW, cellH) * 0.08);
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
          if (zoneCount > 0) return null;
          return (
            <div
              key={String(el.id)}
              className="pointer-events-none absolute rounded-md border border-slate-400 bg-gradient-to-br from-slate-100 to-slate-200"
              style={{ left, top, width, height, transform: `rotate(${rotation}deg)` }}
            />
          );
        }

        if (el?.type === ELEMENT_TYPES.ZONE) {
          return (
            <button
              key={String(el.id)}
              type="button"
              className={
                isSelected
                  ? `absolute z-[5] overflow-hidden rounded-lg border-2 border-sky-500 bg-emerald-100/10 text-left ${isAddMode && !isMachineAddMode ? "pointer-events-none" : ""}`
                  : `absolute z-[5] overflow-hidden rounded-lg border border-emerald-400/70 bg-emerald-100/10 text-left ${isAddMode && !isMachineAddMode ? "pointer-events-none" : ""}`
              }
              style={{ left, top, width, height, transform: `rotate(${rotation}deg)` }}
              onPointerDown={(e) => {
                if (!fullScreen) return;
                e.stopPropagation();
                if (isMachineAddMode) {
                  onFocusZoneChange?.(String(el.id));
                  onSelectElement?.(String(el.id));
                  return;
                }
                if (isAddMode) return;
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
              style={{ left, top, width, height, transform: `rotate(${rotation}deg)` }}
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
          const oee = meta ? computeMachineOeePct(meta) : null;
          return (
            <button
              key={String(el.id)}
              type="button"
              className={
                isSelected
                  ? `absolute z-[20] rounded-lg border-2 border-sky-500 bg-white/95 shadow-sm ${isAddMode ? "pointer-events-none" : ""}`
                  : `absolute z-[20] rounded-lg border border-slate-300 bg-white/95 shadow-sm ${isAddMode ? "pointer-events-none" : ""}`
              }
              style={{ left, top, width, height, transform: `rotate(${rotation}deg)` }}
              onPointerDown={(e) => {
                if (isAddMode) return;
                e.stopPropagation();
                if (fullScreen) {
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
                    ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top }
                    : prev,
                );
              }}
              onMouseLeave={() => setHover(null)}
            >
              <div className="relative h-full w-full overflow-hidden rounded-md border border-slate-500/50 bg-gradient-to-b from-slate-100 to-slate-200">
                <div className="absolute inset-x-0 top-0 min-h-7 bg-slate-900/95 px-1.5 py-0.5">
                  <div
                    className="whitespace-normal break-words text-[9px] font-semibold leading-tight text-white"
                    title={name}
                  >
                    {name}
                  </div>
                </div>

                <div className="absolute inset-x-0 top-7 h-1">
                  <div className={`h-full w-full ${statusTint(status)}`} />
                </div>

                <div className="absolute inset-x-0 bottom-0 top-8 flex items-center justify-center">
                  <div className="grid h-full w-full grid-cols-2 gap-1 px-1.5 py-1.5">
                    <div className="rounded border border-slate-400 bg-white/85 shadow-inner" />
                    <div className="rounded border border-slate-400 bg-white/85 shadow-inner" />
                    <div className="rounded border border-slate-400 bg-white/85 shadow-inner" />
                    <div className="rounded border border-slate-400 bg-white/85 shadow-inner" />
                  </div>
                  <img
                    src="/icons/machine.svg"
                    alt="Machine"
                    className="pointer-events-none absolute h-5 w-5 opacity-75"
                  />
                </div>
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
          style={{ left: `${hoverNorm.x * 100}%`, top: `${hoverNorm.y * 100}%` }}
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
