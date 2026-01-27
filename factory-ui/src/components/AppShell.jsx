import { Outlet } from "react-router-dom";
import Header from "./header.jsx";
import Footer from "./footer.jsx";
import GlobalDownMachineAlerts from "./alerts/GlobalDownMachineAlerts.jsx";

export default function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-gray-900">
      <GlobalDownMachineAlerts />
      <Header />

      <main className="flex-1 py-4 sm:py-6">
        <div className="app-container">
          <Outlet />
        </div>
      </main>

      <Footer />
    </div>
  );
}
