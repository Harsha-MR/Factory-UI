import { Link, Outlet } from 'react-router-dom'
import GlobalDownMachineAlerts from './alerts/GlobalDownMachineAlerts.jsx'

function Crumb({ children, to }) {
  return to ? (
    <Link className="text-blue-600 hover:underline" to={to}>
      {children}
    </Link>
  ) : (
    <span className="text-gray-700">{children}</span>
  )
}

import { useNavigate } from 'react-router-dom'

export default function AppShell() {
  const navigate = useNavigate();
  const userId = typeof localStorage !== 'undefined' ? localStorage.getItem('factory-ui:userId') : '';

  const handleLogout = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('factory-ui:userId');
    }
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <GlobalDownMachineAlerts />
      <header className="border-b bg-white">
        <div className="app-container flex items-center justify-between py-3">
          <div className="font-semibold">Factory Name</div>
          {userId && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600">User: <span className="font-semibold">{userId}</span></span>
              <button
                className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          )}
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
