import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import Dashboard from './pages/Dashboard.jsx'
import FactoryPage from './pages/FactoryPage.jsx'
import PlantPage from './pages/PlantPage.jsx'
import Department3DLayoutPage from './pages/Department3DLayoutPage.jsx'
import MachineModalRoutePage from './pages/MachineModalRoutePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'

function isLoggedIn() {
  if (typeof localStorage === 'undefined') return false;
  const userId = localStorage.getItem('factory-ui:userId');
  return !!userId;
}

export default function App() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;

  // If not logged in, always redirect to login except for /login and /register
  const isAuth = isLoggedIn();
  const isAuthRoute = ['/login', '/register'].includes(location.pathname);

  if (!isAuth && !isAuthRoute) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Routes location={backgroundLocation || location}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/factories/:factoryId" element={<FactoryPage />} />
          <Route path="/plants/:plantId" element={<PlantPage />} />
          <Route path="/departments/:departmentId" element={<Navigate to="layout-3d" replace />} />
          <Route path="/departments/:departmentId/layout-3d" element={<Department3DLayoutPage />} />
          <Route
            path="/departments/:departmentId/machines/:machineId"
            element={<MachineModalRoutePage />}
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
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
