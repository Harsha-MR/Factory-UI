import { Link, useParams } from 'react-router-dom'

export default function FactoryPage() {
  const { factoryId } = useParams()

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Factory: {factoryId}</h1>

      <div className="rounded border bg-white p-4">
        <div className="mb-2 text-sm text-gray-500">Mock plants</div>
        <Link className="text-blue-600 hover:underline" to="/plants/p1">
          Go to Plant p1
        </Link>
      </div>
    </div>
  )
}
