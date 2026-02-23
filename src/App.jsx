import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Department3DLayoutPage from './pages/Department3DLayoutPage.jsx'
import MachineModalRoutePage from './pages/MachineModalRoutePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import HomePage from './pages/HomePage.jsx'
import { isAuthenticated } from './utils/auth.js'
import DepartmentFloorLayoutEditor from './components/layout/DepartmentFloorLayoutEditor.jsx'
import DepartmentLayoutPage from './pages/DepartmentLayoutPage.jsx'
import ZoneModal from './components/dashboard/ZoneModal.jsx'
import DepartmentFloorLayoutViewer from './components/layout/DepartmentFloorLayoutViewer.jsx'



export default function App() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;

  // Demo mode: skip authentication check
  const isAuthRoute = ['/login', '/register'].includes(location.pathname);

  // Auto-set demo user on mount if not on auth routes
  // Create a token that won't expire for 100 years (demo purpose)
  if (!isAuthRoute && !localStorage.getItem('factory-ui:token')) {
    const futureExp = Math.floor(Date.now() / 1000) + (100 * 365 * 24 * 60 * 60); // 100 years from now
    const demoPayload = { exp: futureExp, userId: 'demo', email: 'demo@company.com' };
    const demoToken = 'demo.' + btoa(JSON.stringify(demoPayload)) + '.demo';
    localStorage.setItem('factory-ui:token', demoToken);
    localStorage.setItem('user', JSON.stringify({ id: 'demo', name: 'Demo User', email: 'demo@company.com', role: 'User' }));
  }

  return (
    <>
      <Routes location={backgroundLocation || location}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/departments/:departmentId" element={<Navigate to="layout-3d" replace />} />
          <Route path="/departments/:departmentId/layout-3d" element={<Department3DLayoutPage />} />
          <Route
            path="/departments/:departmentId/machines/:machineId"
            element={<MachineModalRoutePage />}
          />
          {/* <Route path="/2d" element={<DepartmentFloorLayoutEditor />} /> */}
          {/* <Route path="/departments/2d/:departmentId" element={<DepartmentLayoutPage />} /> */}
          {/* <Route path="/dpt/:departmentId" element={<DepartmentFloorLayoutViewer />} /> */}
        </Route>
          {/* <Route path="/zone-modal" element={<ZoneModal />} /> */}
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
