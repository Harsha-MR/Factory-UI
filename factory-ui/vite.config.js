import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import fs from 'node:fs'
import path from 'node:path'

function createLayoutStoragePlugin() {
  const layoutsPath = path.resolve(process.cwd(), 'public/mock/department_layouts.json')

  const readStore = () => {
    try {
      if (!fs.existsSync(layoutsPath)) {
        return { version: 1, updatedAt: null, departments: {} }
      }
      const raw = fs.readFileSync(layoutsPath, 'utf8')
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return { version: 1, updatedAt: null, departments: {} }
      if (!parsed.departments || typeof parsed.departments !== 'object') parsed.departments = {}
      if (typeof parsed.version !== 'number') parsed.version = 1
      if (!('updatedAt' in parsed)) parsed.updatedAt = null
      return parsed
    } catch {
      return { version: 1, updatedAt: null, departments: {} }
    }
  }

  const writeStore = (store) => {
    const next = store && typeof store === 'object' ? store : { version: 1, updatedAt: null, departments: {} }
    next.version = typeof next.version === 'number' ? next.version : 1
    next.updatedAt = new Date().toISOString()
    if (!next.departments || typeof next.departments !== 'object') next.departments = {}
    fs.mkdirSync(path.dirname(layoutsPath), { recursive: true })
    fs.writeFileSync(layoutsPath, JSON.stringify(next, null, 2) + '\n', 'utf8')
  }

  const readBodyJson = (req) => {
    return new Promise((resolve) => {
      let data = ''
      req.on('data', (chunk) => {
        data += chunk
        if (data.length > 2_000_000) {
          // Prevent runaway payloads in dev.
          resolve(null)
          try { req.destroy() } catch { /* ignore */ }
        }
      })
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : null)
        } catch {
          resolve(null)
        }
      })
    })
  }

  const sendJson = (res, status, body) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }

  return {
    name: 'factory-layout-storage',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = req.url || ''
          if (!url.startsWith('/api/layouts')) return next()

          const u = new URL(url, 'http://localhost')
          const factoryId = u.searchParams.get('factoryId') || ''
          const plantId = u.searchParams.get('plantId') || ''
          const departmentId = u.searchParams.get('departmentId') || ''
          const deptKey = `${factoryId}:${plantId}:${departmentId}`

          if (req.method === 'GET') {
            const store = readStore()
            const bundle = store.departments?.[deptKey] || { current: null, previous: null }
            return sendJson(res, 200, bundle)
          }

          if (req.method === 'POST') {
            const body = await readBodyJson(req)
            const layout = body?.layout
            if (!layout || typeof layout !== 'object') {
              return sendJson(res, 400, { error: 'Missing layout' })
            }
            const store = readStore()
            const existing = store.departments?.[deptKey] || { current: null, previous: null }
            const nextCurrent = { ...layout, updatedAt: new Date().toISOString() }
            store.departments[deptKey] = {
              current: nextCurrent,
              previous: existing.current || null,
            }
            writeStore(store)
            return sendJson(res, 200, store.departments[deptKey])
          }

          if (req.method === 'DELETE') {
            const store = readStore()
            if (store.departments && store.departments[deptKey]) {
              delete store.departments[deptKey]
              writeStore(store)
            }
            return sendJson(res, 200, { ok: true })
          }

          return sendJson(res, 405, { error: 'Method not allowed' })
        } catch (e) {
          return sendJson(res, 500, { error: e?.message || 'Server error' })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), createLayoutStoragePlugin()],
})
