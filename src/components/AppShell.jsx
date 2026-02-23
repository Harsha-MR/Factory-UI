import { Outlet } from "react-router-dom";
import Header from "./header.jsx";
import Footer from "./footer.jsx";
import GlobalDownMachineAlerts from "./alerts/GlobalDownMachineAlerts.jsx";
import { useLocation, useNavigate } from "react-router-dom";

export default function AppShell() {
  const navigate = useNavigate();
  const userId =
    typeof localStorage !== "undefined" ? localStorage.getItem("user") : "";

  const handleLogout = () => {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("user");
    }
    navigate("/login");
  };
  const location = useLocation();

  const hideFooter = location.pathname.includes("/departments/");
  const hideHeader = location.pathname.includes("/departments/");

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-gray-900">
      <GlobalDownMachineAlerts />
      {!hideHeader && <Header />}
      <main className="flex-1 pt-0 pb-0">
        <div className="app-container">
          <Outlet />
        </div>
      </main>

      {!hideFooter && <Footer />}
    </div>
  );
}
