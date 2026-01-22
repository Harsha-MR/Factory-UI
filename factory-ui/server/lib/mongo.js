import { MongoClient } from 'mongodb'

let clientPromise = null

export async function getMongoClient(mongoUri) {
  const uri = String(mongoUri || '').trim()
  if (!uri) throw new Error('Missing MongoDB connection string (MONGODB_URI)')

  if (!clientPromise) {
    const client = new MongoClient(uri)
    clientPromise = client.connect()
  }

  return clientPromise
}
