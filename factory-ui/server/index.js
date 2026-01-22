import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

import { getMongoClient } from './lib/mongo.js'
import {
  coerceSeedToHierarchyShape,
  computeDepartmentSummary,
  getDepartmentMachines,
  normalizeHierarchy,
} from './lib/hierarchy.js'

dotenv.config()

const PORT = Number(process.env.PORT || 5174)
const MONGODB_URI = process.env.MONGODB_URI
const DB_NAME = process.env.DB_NAME || 'factory'
const COLLECTION = process.env.COLLECTION || 'hierarchy'
const DOC_KEY = process.env.DOC_KEY || 'default'

const app = express()
app.use(express.json({ limit: '2mb' }))

// In dev, Vite will proxy /api -> this server, so CORS isn't required.
// Keeping permissive CORS helps if you hit the API directly.
app.use(cors())

async function loadHierarchyDoc() {
  const client = await getMongoClient(MONGODB_URI)
  const col = client.db(DB_NAME).collection(COLLECTION)
  const doc = await col.findOne({ key: DOC_KEY })
  if (!doc) {
    throw new Error(
      `No hierarchy seed found in Mongo (db=${DB_NAME}, collection=${COLLECTION}, key=${DOC_KEY}). Run the seed script.`,
    )
  }

  const seed = doc.data || doc
  const live = coerceSeedToHierarchyShape(seed)
  normalizeHierarchy(live)
  return live
}

function findFactory(live, factoryId) {
  return (live?.factories || []).find((f) => String(f.id) === String(factoryId)) || null
}

function findPlant(live, plantId) {
  for (const f of live?.factories || []) {
    const p = (f.plants || []).find((x) => String(x.id) === String(plantId))
    if (p) return { factory: f, plant: p }
  }
  return null
}

function findDepartment(live, departmentId) {
  for (const f of live?.factories || []) {
    for (const p of f.plants || []) {
      const d = (p.departments || []).find((x) => String(x.id) === String(departmentId))
      if (d) return { factory: f, plant: p, department: d }
    }
  }
  return null
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'factory-api', time: new Date().toISOString() })
})

app.get('/api/factories', async (_req, res) => {
  try {
    const live = await loadHierarchyDoc()
    res.json((live?.factories || []).map(({ id, name }) => ({ id, name })))
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Failed to load factories' })
  }
})

app.get('/api/factories/:factoryId/plants', async (req, res) => {
  try {
    const live = await loadHierarchyDoc()
    const f = findFactory(live, req.params.factoryId)
    if (!f) return res.json([])
    res.json((f.plants || []).map(({ id, name }) => ({ id, name })))
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Failed to load plants' })
  }
})

app.get('/api/plants/:plantId/departments', async (req, res) => {
  try {
    const live = await loadHierarchyDoc()
    const found = findPlant(live, req.params.plantId)
    if (!found) return res.json([])

    res.json(
      (found.plant.departments || []).map((d) => ({
        id: d.id,
        name: d.name,
        summary: computeDepartmentSummary(d),
        machines: getDepartmentMachines(d),
        zones: d.zones || [],
      })),
    )
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Failed to load departments' })
  }
})

app.get('/api/departments/:departmentId/layout', async (req, res) => {
  try {
    const live = await loadHierarchyDoc()
    const found = findDepartment(live, req.params.departmentId)
    if (!found) return res.status(404).json({ error: `Department not found: ${req.params.departmentId}` })

    const summary = computeDepartmentSummary(found.department)

    res.json({
      department: {
        id: found.department.id,
        name: found.department.name,
        zones: found.department.zones || [],
      },
      summary,
      meta: { simulated: false, fetchedAt: new Date().toISOString() },
    })
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Failed to load department layout' })
  }
})

app.get('/api/machines/snapshot', async (_req, res) => {
  try {
    const live = await loadHierarchyDoc()
    const out = []

    for (const f of live?.factories || []) {
      for (const p of f.plants || []) {
        for (const d of p.departments || []) {
          const zones = d?.zones || []
          for (const z of zones) {
            for (const m of z?.machines || []) {
              out.push({
                factory: { id: f.id, name: f.name },
                plant: { id: p.id, name: p.name },
                department: { id: d.id, name: d.name },
                zone: { id: z?.id, name: z?.name },
                machine: m,
              })
            }
          }
        }
      }
    }

    res.json(out)
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Failed to load machines snapshot' })
  }
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`factory-api listening on http://localhost:${PORT}`)
})
