import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import Dashboard from './pages/Dashboard.jsx'
import FactoryPage from './pages/FactoryPage.jsx'
import PlantPage from './pages/PlantPage.jsx'
import DepartmentLayoutPage from './pages/DepartmentLayoutPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/factories/:factoryId" element={<FactoryPage />} />
        <Route path="/plants/:plantId" element={<PlantPage />} />
        <Route
          path="/departments/:departmentId/layout"
          element={<DepartmentLayoutPage />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
