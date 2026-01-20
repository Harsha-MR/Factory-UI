import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import Dashboard from './pages/Dashboard.jsx'
import FactoryPage from './pages/FactoryPage.jsx'
import PlantPage from './pages/PlantPage.jsx'
import DepartmentLayoutPage from './pages/DepartmentLayoutPage.jsx'
import Department3DLayoutPage from './pages/Department3DLayoutPage.jsx'
import MachineModalRoutePage from './pages/MachineModalRoutePage.jsx'

export default function App() {
  const location = useLocation()
  const backgroundLocation = location.state?.backgroundLocation

  return (
    <>
      <Routes location={backgroundLocation || location}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/factories/:factoryId" element={<FactoryPage />} />
          <Route path="/plants/:plantId" element={<PlantPage />} />
          <Route path="/departments/:departmentId" element={<DepartmentLayoutPage />} />
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
  )
}
