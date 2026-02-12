import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import Dashboard from './pages/Dashboard.jsx'
import FactoryPage from './pages/FactoryPage.jsx'
import PlantPage from './pages/PlantPage.jsx'
import Department3DLayoutPage from './pages/Department3DLayoutPage.jsx'
import MachineModalRoutePage from './pages/MachineModalRoutePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import HomePage from './pages/HomePage.jsx'
import DepartmentFloorLayoutEditor from './components/layout/DepartmentFloorLayoutEditor.jsx'
import { isAuthenticated } from './utils/auth.js'
import DepartmentLayoutPage from './pages/DepartmentLayoutPage.jsx'

export default function App() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;

  // Check if user is authenticated with valid, non-expired token
  const isAuth = isAuthenticated();
  const isAuthRoute = ['/login', '/register'].includes(location.pathname);

  // Redirect to login if not authenticated (including expired tokens)
  if (!isAuth && !isAuthRoute) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Routes location={backgroundLocation || location}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/abc" element={<DepartmentLayoutPage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/factories/:factoryId" element={<FactoryPage />} />
          <Route path="/plants/:plantId" element={<PlantPage />} />
          <Route path="/departments/:departmentId" element={<Navigate to="layout-3d" replace />} />
          <Route path="/departments/:departmentId/layout-3d" element={<Department3DLayoutPage />} />
          <Route
            path="/departments/:departmentId/machines/:machineId"
            element={<MachineModalRoutePage />}
          />
          <Route path="/2d" element={<DepartmentFloorLayoutEditor />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {backgroundLocation ? (
        <Routes>
          <Route
            path="/departments/:departmentId/machines/:machineId"
            element={<MachineModalRoutePage />}
          />
        </Routes>
      ) : null}
    </>
  );
}
