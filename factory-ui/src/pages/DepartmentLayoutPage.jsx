import { useParams } from 'react-router-dom'

export default function DepartmentLayoutPage() {
  const { departmentId } = useParams()

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Department Layout: {departmentId}</h1>
      <div className="rounded border bg-white p-4 text-gray-600">
        Next: render zones + machines here (mock data first).
      </div>
    </div>
  )
}
