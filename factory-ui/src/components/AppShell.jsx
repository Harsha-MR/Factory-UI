import { Link, Outlet, useLocation } from 'react-router-dom'

function Crumb({ children, to }) {
  return to ? (
    <Link className="text-blue-600 hover:underline" to={to}>
      {children}
    </Link>
  ) : (
    <span className="text-gray-700">{children}</span>
  )
}

export default function AppShell() {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="font-semibold">Factory Project</div>
          <div className="text-xs text-gray-500">{location.pathname}</div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <nav className="mb-4 text-sm">
          {/* <Crumb to="/">Dashboard</Crumb> */}
        </nav>
        <Outlet />
      </main>
    </div>
  )
}
