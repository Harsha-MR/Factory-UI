import { Link, Outlet } from 'react-router-dom'

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
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="app-container flex items-center justify-between py-3">
          <div className="font-semibold">Factory Name</div>
          {/* <div className="text-xs text-gray-500">{location.pathname}</div> */}
        </div>
      </header>

      <main className="app-container flex-1 py-4 sm:py-6">
        <nav className="mb-4 text-sm">
          {/* <Crumb to="/">Dashboard</Crumb> */}
        </nav>
        <Outlet />
      </main>

      <footer className="mt-auto border-t bg-white">
        <div className="app-container py-3 text-xs text-gray-500">
          © {new Date().getFullYear()} Factory UI
        </div>
      </footer>
    </div>
  )
}
