import { Link, useParams } from 'react-router-dom'

export default function PlantPage() {
  const { plantId } = useParams()

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Plant: {plantId}</h1>

      <div className="rounded border bg-white p-4">
        <div className="mb-2 text-sm text-gray-500">Mock departments</div>
        <Link
          className="text-blue-600 hover:underline"
          to="/departments/d1"
        >
          Go to Department d1 Layout
        </Link>
      </div>
    </div>
  )
}
