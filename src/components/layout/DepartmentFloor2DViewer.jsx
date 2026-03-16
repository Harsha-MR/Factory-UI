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
  return {
    glow: "bg-green-500/36",
    badge: "bg-green-500",
    nameBg: "bg-green-900/85",
    border: "border-green-500/75",
  };
}

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
    const rowTolerance = 0.08;
    return [...zoneElements].sort((a, b) => {
      const ay = Number(a?.y) || 0;
      const by = Number(b?.y) || 0;
      if (Math.abs(ay - by) > rowTolerance) return ay - by;
      const ax = Number(a?.x) || 0;
      const bx = Number(b?.x) || 0;
      return ax - bx;
    });
  }, [zoneElements]);

  const zonesViewModel = useMemo(() => {
    if (!focusedZone) {
      return allZonesOrdered.map((z, idx) => ({
        zone: z,
        frame: {
          x: Number(z?.x) || 0,
          y: Number(z?.y) || 0,
          w: Number(z?.w) || zoneSizeBaseline.w,
          h: Number(z?.h) || zoneSizeBaseline.h,
        },
        zoneIndex: idx,
      }));
    }

    return [
      {
        zone: focusedZone,
        frame: {
          x: focusPad,
          y: focusPad,
          w: focusSize,
          h: focusSize,
        },
        zoneIndex: 0,
      },
    ];
  }, [allZonesOrdered, focusedZone, focusPad, focusSize, zoneSizeBaseline]);

  const machineElements = useMemo(
    () =>
      renderElements
        .filter((el) => el?.type === ELEMENT_TYPES.MACHINE)
        .sort((a, b) => sortMachinesForZone(a, b, machineMetaById)),
    [renderElements, machineMetaById],
  );

  const transporterElements = useMemo(
    () => renderElements.filter((el) => el?.type === ELEMENT_TYPES.TRANSPORTER),
    [renderElements],
  );

  const floorElements = useMemo(
    () => renderElements.filter((el) => el?.type === ELEMENT_TYPES.FLOOR),
    [renderElements],
  );

  const walkwayElements = useMemo(
    () => renderElements.filter((el) => el?.type === ELEMENT_TYPES.WALKWAY),
    [renderElements],
  );

  const machineByZone = useMemo(() => {
    const map = new Map();
    for (const zoneVm of zonesViewModel) {
      map.set(String(zoneVm.zone?.id), []);
    }

    for (const machine of machineElements) {
      const zoneIdFromMeta = String(machine?.meta?.zoneId || "");
      const zoneNameFromMeta = String(machine?.meta?.zoneName || "").trim();
      let zone =
        (zoneIdFromMeta && zoneById.get(zoneIdFromMeta)) ||
        (zoneNameFromMeta && zoneByName.get(zoneNameFromMeta)) ||
        null;

      if (!zone) {
        const mx = Number(machine?.x) || 0;
        const my = Number(machine?.y) || 0;
        const mw = Number(machine?.w) || 0;
        const mh = Number(machine?.h) || 0;
        const cx = mx + mw / 2;
        const cy = my + mh / 2;
        zone =
          zoneElements.find((z) => {
            const zx = Number(z?.x) || 0;
            const zy = Number(z?.y) || 0;
            const zw = Number(z?.w) || 0;
            const zh = Number(z?.h) || 0;
            return cx >= zx && cx <= zx + zw && cy >= zy && cy <= zy + zh;
          }) || null;
      }

      if (zone) {
        const key = String(zone.id);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(machine);
      }
    }

    return map;
  }, [machineElements, zoneById, zoneByName, zoneElements, zonesViewModel]);

  const boardRects = useMemo(() => {
    const out = [];
    for (const zoneVm of zonesViewModel) {
      const zone = zoneVm.zone;
      const list = machineByZone.get(String(zone?.id)) || [];
      const count = Math.max(1, list.length);
      const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
      const rows = Math.max(1, Math.ceil(count / cols));
      const pad = focusedZone ? 0.04 : 0.025;
      const labelSpace = focusedZone ? 0.09 : 0.065;
      const gap = focusedZone ? 0.03 : 0.02;
      const slotW =
        (Math.max(0.1, zoneVm.frame.w - pad * 2) - gap * (cols - 1)) / cols;
      const slotH =
        (Math.max(0.1, zoneVm.frame.h - pad * 2 - labelSpace) -
          gap * (rows - 1)) /
        rows;
      out.push({
        ...zoneVm,
        machines: list,
        slotW,
        slotH,
        rows,
        cols,
        gap,
        pad,
        labelSpace,
      });
    }
    return out;
  }, [focusedZone, machineByZone, zonesViewModel]);

  const normFromClientPoint = useCallback((clientX, clientY) => {
    const node = boardRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }, []);

  const updatePointer = useCallback(
    (clientX, clientY) => {
      const nextNorm = normFromClientPoint(clientX, clientY);
      if (!nextNorm) return null;
      setHoverNorm(nextNorm);
      onPointerPositionChange?.(nextNorm);
      return nextNorm;
    },
    [normFromClientPoint, onPointerPositionChange],
  );

  useEffect(() => {
    if (!fullScreen) {
      setDragState(null);
      setDrawState(null);
    }
  }, [fullScreen]);

  const beginDraw = useCallback(
    (event) => {
      if (!isAddRectTool && !isAddPointTool) return;
      const norm = updatePointer(event.clientX, event.clientY);
      if (!norm) return;
      if (isAddPointTool) {
        onAddElement?.(addType, norm);
        return;
      }
      setDrawState({
        start: norm,
        current: norm,
      });
    },
    [addType, isAddPointTool, isAddRectTool, onAddElement, updatePointer],
  );

  const updateDraw = useCallback(
    (event) => {
      if (!drawState) return;
      const norm = updatePointer(event.clientX, event.clientY);
      if (!norm) return;
      setDrawState((prev) => (prev ? { ...prev, current: norm } : prev));
    },
    [drawState, updatePointer],
  );

  const endDraw = useCallback(() => {
    if (!drawState) return;
    const sx = drawState.start.x;
    const sy = drawState.start.y;
    const ex = drawState.current.x;
    const ey = drawState.current.y;
    const x = Math.min(sx, ex);
    const y = Math.min(sy, ey);
    const w = Math.max(0.02, Math.abs(ex - sx));
    const h = Math.max(0.02, Math.abs(ey - sy));
    onAddElement?.(addType, { x, y, w, h });
    setDrawState(null);
  }, [addType, drawState, onAddElement]);

  const beginDrag = useCallback(
    (event, element) => {
      if (!fullScreen || activeTool !== "move") return;
      const norm = updatePointer(event.clientX, event.clientY);
      if (!norm) return;
      event.stopPropagation();
      event.preventDefault();
      setPointerCaptureId(event.pointerId);
      event.currentTarget?.setPointerCapture?.(event.pointerId);
      setDragState({
        id: String(element?.id || ""),
        startPointer: norm,
        startElement: {
          x: Number(element?.x) || 0,
          y: Number(element?.y) || 0,
        },
      });
      onSelectElement?.(String(element?.id || ""));
    },
    [activeTool, fullScreen, onSelectElement, updatePointer],
  );

  const continueDrag = useCallback(
    (event) => {
      if (!dragState) return;
      const norm = updatePointer(event.clientX, event.clientY);
      if (!norm) return;
      const dx = norm.x - dragState.startPointer.x;
      const dy = norm.y - dragState.startPointer.y;
      onMoveElement?.(dragState.id, {
        x: clamp01(dragState.startElement.x + dx),
        y: clamp01(dragState.startElement.y + dy),
      });
    },
    [dragState, onMoveElement, updatePointer],
  );

  const endDrag = useCallback(
    (event) => {
      if (!dragState) return;
      if (pointerCaptureId != null) {
        event.currentTarget?.releasePointerCapture?.(pointerCaptureId);
      }
      setDragState(null);
      setPointerCaptureId(null);
    },
    [dragState, pointerCaptureId],
  );

  const drawPreview = useMemo(() => {
    if (!drawState) return null;
    const sx = drawState.start.x;
    const sy = drawState.start.y;
    const ex = drawState.current.x;
    const ey = drawState.current.y;
    return {
      x: Math.min(sx, ex),
      y: Math.min(sy, ey),
      w: Math.abs(ex - sx),
      h: Math.abs(ey - sy),
    };
  }, [drawState]);

  return (
    <div
      ref={containerRef}
      className={
        fullScreen
          ? "relative h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
          : "relative h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
      }
    >
      <div
        ref={boardRef}
        className="relative h-full w-full overflow-hidden"
        onPointerDown={(event) => {
          updatePointer(event.clientX, event.clientY);
          if (isAddRectTool || isAddPointTool) {
            beginDraw(event);
            return;
          }
          if (fullScreen && activeTool === "select") {
            onSelectElement?.("");
            if (!focusedZone) onFocusZoneChange?.("");
          }
        }}
        onPointerMove={(event) => {
          updatePointer(event.clientX, event.clientY);
          if (drawState) updateDraw(event);
          if (dragState) continueDrag(event);
        }}
        onPointerUp={(event) => {
          if (drawState) {
            endDraw();
            return;
          }
          if (dragState) {
            endDrag(event);
          }
        }}
        onPointerLeave={() => {
          setHover(null);
          setHoverNorm(null);
        }}
      >
        {floorElements.map((floor) => (
          <div
            key={String(floor?.id || "floor")}
            className="absolute rounded-xl border border-slate-300 bg-white/40 shadow-inner"
            style={{
              left: `${(Number(floor?.x) || 0) * 100}%`,
              top: `${(Number(floor?.y) || 0) * 100}%`,
              width: `${(Number(floor?.w) || 1) * 100}%`,
              height: `${(Number(floor?.h) || 1) * 100}%`,
            }}
          />
        ))}

        {walkwayElements.map((walkway) => (
          <div
            key={String(walkway?.id || "")}
            className="absolute rounded-md border border-slate-400 bg-slate-400/25"
            style={{
              left: `${(Number(walkway?.x) || 0) * 100}%`,
              top: `${(Number(walkway?.y) || 0) * 100}%`,
              width: `${(Number(walkway?.w) || 0) * 100}%`,
              height: `${(Number(walkway?.h) || 0) * 100}%`,
            }}
          />
        ))}

        {boardRects.map((zoneVm) => {
          const zone = zoneVm.zone;
          const frame = zoneVm.frame;
          const zoneId = String(zone?.id || "");
          const zoneSelected = zoneId === String(selectedId || "");
          const zoneFocused = zoneId === String(focusedZoneId || "");
          const isSwapSource =
            zoneRearrangeMode && zoneId === String(zoneSwapSourceId || "");
          const isMergeSelected =
            zoneMergeMode &&
            zoneMergeSelectedIds.some((id) => String(id) === zoneId);

          return (
            <div
              key={zoneId}
              className={`absolute overflow-hidden rounded-2xl border transition ${
                zoneSelected || zoneFocused
                  ? "border-sky-500 shadow-lg"
                  : "border-emerald-900/15 shadow-sm"
              } ${
                isSwapSource
                  ? "ring-4 ring-amber-300"
                  : isMergeSelected
                    ? "ring-4 ring-violet-300"
                    : ""
              }`}
              style={{
                left: `${frame.x * 100}%`,
                top: `${frame.y * 100}%`,
                width: `${frame.w * 100}%`,
                height: `${frame.h * 100}%`,
                background:
                  focusedZone && zoneFocused
                    ? "linear-gradient(180deg, rgba(16,185,129,0.16), rgba(255,255,255,0.92))"
                    : "linear-gradient(180deg, rgba(15,23,42,0.04), rgba(255,255,255,0.96))",
              }}
              onPointerDown={(event) => {
                if (zoneRearrangeMode) {
                  event.stopPropagation();
                  onZoneSwapPick?.(zoneId);
                  return;
                }
                if (zoneMergeMode) {
                  event.stopPropagation();
                  onZoneMergePick?.(zoneId);
                  return;
                }
                if (machineRearrangeMode) return;
                if (activeTool === "move") {
                  beginDrag(event, zone);
                  return;
                }
                event.stopPropagation();
                onSelectElement?.(zoneId);
                onFocusZoneChange?.(zoneId);
              }}
            >
              <div className="flex items-center justify-between border-b border-slate-200/70 bg-white/70 px-3 py-2 backdrop-blur">
                <div className="truncate text-sm font-semibold text-slate-800">
                  {zone?.label || "Zone"}
                </div>
                <div className="text-[11px] font-medium text-slate-500">
                  {zoneVm.machines.length} machine
                  {zoneVm.machines.length === 1 ? "" : "s"}
                </div>
              </div>

              <div
                className="grid h-[calc(100%-44px)] content-start"
                style={{
                  gridTemplateColumns: `repeat(${zoneVm.cols}, minmax(0, 1fr))`,
                  gap: `${zoneVm.gap * 100}%`,
                  padding: `${zoneVm.pad * 100}%`,
                }}
              >
                {zoneVm.machines.map((machine) => {
                  const machineId = String(machine?.id || "");
                  const selected = machineId === String(selectedId || "");
                  const swapSource =
                    machineRearrangeMode &&
                    machineId === String(machineSwapSourceId || "");
                  const meta = machineMetaById?.[String(machine?.machineId || "")];
                  const machineInfo = meta || machine;
                  const status = machineInfo?.status || "RUNNING";
                  const oeePct = computeMachineOeePct(machineInfo);
                  const tone = HIDE_STATUS_COLOR_VISIBILITY
                    ? neutralTone()
                    : statusTone(status);
                  const machineName = machineDisplayName(machine, machineMetaById);

                  return (
                    <button
                      key={machineId}
                      type="button"
                      className={`group relative flex min-h-[94px] flex-col items-center justify-center rounded-2xl border bg-white px-2 py-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                        selected
                          ? "border-sky-500 ring-2 ring-sky-200"
                          : tone.border
                      } ${swapSource ? "ring-4 ring-amber-300" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (machineRearrangeMode) {
                          onMachineSwapPick?.(machineId);
                          return;
                        }
                        onSelectElement?.(machineId);
                        if (!fullScreen && typeof onOpenMachineDetails === "function") {
                          onOpenMachineDetails(machine?.machineId || machineId);
                        }
                      }}
                      onDoubleClick={(event) => {
                        if (!fullScreen && typeof onOpenMachineDetails === "function") {
                          event.stopPropagation();
                          onOpenMachineDetails(machine?.machineId || machineId);
                        }
                      }}
                    >
                      {showMachineMarkers ? (
                        <div
                          className={`absolute inset-2 rounded-2xl ${tone.glow}`}
                          aria-hidden="true"
                        />
                      ) : null}

                      <div className="relative z-10 flex items-center justify-center">
                        <img
                          src={machineImageByStatus(status)}
                          alt=""
                          className="h-10 w-10 object-contain"
                        />
                        {showMachineMarkers ? (
                          <div
                            className={`absolute -right-1 -top-1 h-3 w-3 rounded-full ${
                              HIDE_STATUS_COLOR_VISIBILITY
                                ? "bg-slate-300"
                                : statusTint(status)
                            }`}
                          />
                        ) : null}
                      </div>

                      {showMachineLabels ? (
                        <div className="relative z-10 mt-2 max-w-full">
                          <div
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${tone.nameBg}`}
                          >
                            {compactMachineLabel(machineName)}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {oeePct == null ? "OEE -" : `OEE ${oeePct.toFixed(0)}%`}
                          </div>
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {transporterElements.map((item) => (
          <button
            key={String(item?.id || "")}
            type="button"
            className={`absolute flex items-center justify-center rounded-xl border bg-white/90 shadow ${
              String(item?.id) === String(selectedId || "")
                ? "border-sky-500 ring-2 ring-sky-200"
                : "border-slate-300"
            }`}
            style={{
              left: `${(Number(item?.x) || 0) * 100}%`,
              top: `${(Number(item?.y) || 0) * 100}%`,
              width: `${Math.max(0.04, Number(item?.w) || 0.08) * 100}%`,
              height: `${Math.max(0.04, Number(item?.h) || 0.06) * 100}%`,
            }}
            onPointerDown={(event) => {
              if (activeTool === "move") {
                beginDrag(event, item);
                return;
              }
              event.stopPropagation();
              onSelectElement?.(String(item?.id || ""));
            }}
          >
            <TransporterIcon className="h-5 w-5 text-slate-600" />
          </button>
        ))}

        {drawPreview ? (
          <div
            className="pointer-events-none absolute rounded-xl border-2 border-dashed border-sky-500 bg-sky-500/10"
            style={{
              left: `${drawPreview.x * 100}%`,
              top: `${drawPreview.y * 100}%`,
              width: `${drawPreview.w * 100}%`,
              height: `${drawPreview.h * 100}%`,
            }}
          />
        ) : null}

        {hoverNorm && fullScreen ? (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-slate-900/85 px-2 py-1 text-[11px] font-medium text-white shadow">
            {`x ${hoverNorm.x.toFixed(3)} | y ${hoverNorm.y.toFixed(3)}`}
          </div>
        ) : null}

        {!focusedZone && zoneElements.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-slate-500">
            Add a zone or open a saved layout to start editing in 2D.
          </div>
        ) : null}
      </div>
    </div>
  );
}
