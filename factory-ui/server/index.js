import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config()

const PORT = Number(process.env.PORT || process.env.API_PORT || 5174)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const MONGODB_DB = process.env.MONGODB_DB || 'factory_ui'

function mustString(v) {
  return String(v || '').trim()
}

function getUserId(req) {
  // In a real app, replace this with proper authentication.
  const header = mustString(req.header('x-user-id'))
  if (header) return header
  const q = mustString(req.query.userId)
  if (q) return q
  return 'shared'
}

async function main() {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '2mb' }))

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000 })
  try {
    await client.connect()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[factory-ui-api] Cannot connect to MongoDB.')
    // eslint-disable-next-line no-console
    console.error(`[factory-ui-api] MONGODB_URI=${MONGODB_URI}`)
    // eslint-disable-next-line no-console
    console.error('[factory-ui-api] Start MongoDB locally and try again.')
    throw e
  }

  const db = client.db(MONGODB_DB)
  const layouts = db.collection('department_layouts')

  await layouts.createIndex(
    { factoryId: 1, plantId: 1, departmentId: 1, userId: 1 },
    { unique: true, name: 'dept_user_unique' },
  )

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.get('/api/layouts', async (req, res) => {
    try {
      const factoryId = mustString(req.query.factoryId)
      const plantId = mustString(req.query.plantId)
      const departmentId = mustString(req.query.departmentId)
      const userId = getUserId(req)

      if (!departmentId) return res.status(400).json({ error: 'departmentId is required' })

      const doc = await layouts.findOne({ factoryId, plantId, departmentId, userId })
      return res.json({ current: doc?.current || null, previous: doc?.previous || null })
    } catch (e) {
      return res.status(500).json({ error: e?.message || 'Server error' })
    }
  })

  app.post('/api/layouts', async (req, res) => {
    try {
      const factoryId = mustString(req.query.factoryId)
      const plantId = mustString(req.query.plantId)
      const departmentId = mustString(req.query.departmentId)
      const userId = getUserId(req)

      if (!departmentId) return res.status(400).json({ error: 'departmentId is required' })

      const layout = req.body?.layout
      if (!layout || typeof layout !== 'object') {
        return res.status(400).json({ error: 'Missing layout' })
      }

      const existing = await layouts.findOne({ factoryId, plantId, departmentId, userId })
      const nextCurrent = { ...layout, updatedAt: new Date().toISOString() }

      const next = {
        factoryId,
        plantId,
        departmentId,
        userId,
        current: nextCurrent,
        previous: existing?.current || null,
        updatedAt: new Date().toISOString(),
      }

      await layouts.updateOne(
        { factoryId, plantId, departmentId, userId },
        { $set: next, $setOnInsert: { createdAt: new Date().toISOString() } },
        { upsert: true },
      )

      return res.json({ current: next.current, previous: next.previous })
    } catch (e) {
      return res.status(500).json({ error: e?.message || 'Server error' })
    }
  })

  app.delete('/api/layouts', async (req, res) => {
    try {
      const factoryId = mustString(req.query.factoryId)
      const plantId = mustString(req.query.plantId)
      const departmentId = mustString(req.query.departmentId)
      const userId = getUserId(req)

      if (!departmentId) return res.status(400).json({ error: 'departmentId is required' })

      await layouts.deleteOne({ factoryId, plantId, departmentId, userId })
      return res.json({ ok: true })
    } catch (e) {
      return res.status(500).json({ error: e?.message || 'Server error' })
    }
  })

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[factory-ui-api] listening on http://localhost:${PORT}`)
    // eslint-disable-next-line no-console
    console.log(`[factory-ui-api] mongodb: ${MONGODB_URI} (db: ${MONGODB_DB})`)
  })
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[factory-ui-api] failed to start', e)
  process.exitCode = 1
})
