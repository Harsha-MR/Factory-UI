import fs from 'node:fs/promises'
import path from 'node:path'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI
const DB_NAME = process.env.DB_NAME || 'factory'
const COLLECTION = process.env.COLLECTION || 'hierarchy'
const DOC_KEY = process.env.DOC_KEY || 'default'

const DEFAULT_JSON_PATH = path.resolve('public', 'mock', 'factory_efficiency_data.json')

async function main() {
  const jsonPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_JSON_PATH

  if (!MONGODB_URI) throw new Error('Missing MONGODB_URI in environment')

  const raw = await fs.readFile(jsonPath, 'utf-8')
  const data = JSON.parse(raw)

  const client = new MongoClient(MONGODB_URI)
  await client.connect()

  try {
    const col = client.db(DB_NAME).collection(COLLECTION)

    await col.updateOne(
      { key: DOC_KEY },
      {
        $set: {
          key: DOC_KEY,
          updatedAt: new Date(),
          data,
        },
      },
      { upsert: true },
    )

    // eslint-disable-next-line no-console
    console.log(`Seeded Mongo: db=${DB_NAME} collection=${COLLECTION} key=${DOC_KEY}`)
    // eslint-disable-next-line no-console
    console.log(`Source: ${jsonPath}`)
  } finally {
    await client.close()
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})
