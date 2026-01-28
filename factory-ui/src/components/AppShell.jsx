import { Outlet } from "react-router-dom";
import Header from "./header.jsx";
import Footer from "./footer.jsx";
import GlobalDownMachineAlerts from "./alerts/GlobalDownMachineAlerts.jsx";

export default function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-gray-900">
      <GlobalDownMachineAlerts />
      <Header />

      {/* REMOVE TOP/BOTTOM PADDING HERE */}
      <main className="flex-1 pt-0 pb-0">
        <div className="app-container">
          <Outlet />
        </div>
      </main>

      <Footer />
    </div>
  );
}
