function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export function getDepartmentMachines(department) {
  const machines = []
  for (const z of department?.zones || []) {
    for (const m of z?.machines || []) machines.push(m)
  }
  return machines
}

export function computeDepartmentSummary(department) {
  const machines = getDepartmentMachines(department)

  const counts = {
    total: machines.length,
    running: 0,
    down: 0,
    idle: 0,
    warning: 0,
    offline: 0,
    maintenance: 0,
    critical: 0,
  }

  let plannedProductionTime = 0
  let runTime = 0
  let idealTimeForOutput = 0

  let totalParts = 0
  let goodParts = 0

  let latestUpdatedAtMs = 0
  for (const m of machines) {
    switch (m.status) {
      case 'RUNNING':
        counts.running++
        break
      case 'DOWN':
        counts.down++
        counts.critical++
        break
      case 'IDLE':
        counts.idle++
        break
      case 'WARNING':
        counts.warning++
        break
      case 'OFFLINE':
        counts.offline++
        counts.critical++
        break
      case 'MAINTENANCE':
        counts.maintenance++
        counts.critical++
        break
      default:
        break
    }

    const tm = m.timeMetrics
    const pm = m.productionMetrics

    const mPlanned = Number(tm?.plannedProductionTime || 0)
    const mRun = Number(tm?.runTime || 0)
    plannedProductionTime += mPlanned
    runTime += mRun

    const idealCycleTime = Number(pm?.idealCycleTime || 0)
    const parts = Number(pm?.totalPartsProduced || 0)
    const good = Number(pm?.goodParts || 0)
    totalParts += parts
    goodParts += good

    idealTimeForOutput += idealCycleTime * parts

    if (m.updatedAt) {
      const t = new Date(m.updatedAt).getTime()
      if (Number.isFinite(t)) latestUpdatedAtMs = Math.max(latestUpdatedAtMs, t)
    }
  }

  const availability = plannedProductionTime > 0 ? runTime / plannedProductionTime : 0
  const performance = runTime > 0 ? idealTimeForOutput / runTime : 0
  const quality = totalParts > 0 ? goodParts / totalParts : 0
  const oee = clamp01(availability) * clamp01(performance) * clamp01(quality)

  const oeePct = clamp01(oee) * 100
  const severity = oeePct < 60 ? 'CRITICAL' : oeePct <= 80 ? 'ACTION_REQUIRED' : 'OK'

  return {
    severity,
    oeePct,
    availabilityPct: clamp01(availability) * 100,
    performancePct: clamp01(performance) * 100,
    qualityPct: clamp01(quality) * 100,
    machines: counts,
    production: {
      goodParts,
      totalParts,
      delta: goodParts - totalParts,
    },
    updatedAt: latestUpdatedAtMs ? new Date(latestUpdatedAtMs).toISOString() : null,
  }
}

export function normalizeHierarchy(root) {
  if (!root?.factories) return
  for (const f of root.factories) {
    for (const p of f.plants || []) {
      for (const d of p.departments || []) {
        if (d?.layout?.zones && !d.zones) d.zones = d.layout.zones
        if (d?.layout) delete d.layout
      }
    }
  }
}

export function coerceSeedToHierarchyShape(seed) {
  if (!seed?.factories) return { factories: [] }

  const firstFactory = seed.factories[0]
  const looksLikeEfficiency =
    !!firstFactory && ('factoryId' in firstFactory || 'factoryName' in firstFactory || 'plants' in firstFactory)

  if (!looksLikeEfficiency) return seed

  const generatedAt = seed.generatedAt || new Date().toISOString()

  function ensureZones(departmentId, zones, machinesFlat) {
    const z = Array.isArray(zones) ? zones.filter(Boolean) : []
    if (z.length) {
      return z.map((zone, idx) => ({
        ...zone,
        id: zone.id ?? `${departmentId}-z-${idx + 1}`,
        name: zone.name ?? `Zone ${idx + 1}`,
        machines: Array.isArray(zone.machines) ? zone.machines : [],
      }))
    }

    const ms = Array.isArray(machinesFlat) ? machinesFlat : []
    if (!ms.length) return []

    return [{ id: `${departmentId}-z-1`, name: 'Zone A', machines: ms }]
  }

  return {
    ...seed,
    generatedAt,
    factories: (seed.factories || []).map((f) => ({
      id: f.factoryId ?? f.id,
      name: f.factoryName ?? f.name,
      plants: (f.plants || []).map((p) => ({
        id: p.plantId ?? p.id,
        name: p.plantName ?? p.name,
        departments: (p.departments || []).map((d) => {
          const departmentId = d.departmentId ?? d.id
          const coerceMachine = (m) => ({
            ...m,
            id: m.machineId ?? m.id,
            name: m.machineName ?? m.name,
            status: m.status ?? 'RUNNING',
            updatedAt: m.updatedAt ?? generatedAt,
          })

          const machines = (d.machines || []).map(coerceMachine)

          const zonesRaw = d.zones || d.layout?.zones
          const zonesNormalized = Array.isArray(zonesRaw)
            ? zonesRaw.map((z, idx) => ({
                ...z,
                id: z.id ?? `${departmentId}-z-${idx}`,
                name: z.name ?? `Zone ${idx + 1}`,
                machines: (z.machines || []).map(coerceMachine),
              }))
            : null

          const machinesFromZones = zonesNormalized ? zonesNormalized.flatMap((z) => z.machines || []) : []

          const zones = ensureZones(departmentId, zonesNormalized, machines.length ? machines : machinesFromZones)

          return {
            id: departmentId,
            name: d.departmentName ?? d.name,
            zones,
          }
        }),
      })),
    })),
  }
}
