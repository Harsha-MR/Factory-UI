import { Link } from 'react-router-dom'

export default function Dashboard() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="text-gray-600">Select a factory to begin.</p>

      <div className="rounded border bg-white p-4">
        <div className="mb-2 text-sm text-gray-500">Mock navigation</div>
        <Link className="text-blue-600 hover:underline" to="/factories/f1">
          Go to Factory f1
        </Link>
      </div>
    </div>
  )
}
