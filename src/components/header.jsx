import { Factory, Menu, X } from "lucide-react";
import { useState } from "react";
import ProfileDropdown from "./ProfileDropdown";
import { useNavigate } from "react-router-dom";

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const navLinks = [
    // { label: "Dashboard", href: "/" },
    // { label: "Factories", href: "/factories" },
    // { label: "Reports", href: "/reports" },
    // { label: "Settings", href: "/settings" },
    // {label: "Back to Home", href: "/"},
  ];

  return (
    <header className="sticky top-0 z-50 bg-slate-950">
      {/* FULL WIDTH HEADER — NO PADDING, NO BORDER, NO SHADOW */}
      <div className="flex items-center h-12 w-full ">
        {/* EXTREME LEFT — FACTORY */}
        <div className="flex items-center gap-3 pl-6">
          <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-1.5 rounded-md">
            <Factory className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold text-white leading-none">
              Factory UI
            </h1>
            <p className="text-xs text-slate-400 leading-none">
              Production Management
            </p>
          </div>
        </div>

        {/* CENTER NAV */}
        <nav className="hidden md:flex items-center gap-5 mx-auto">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="px-2 py-1.5 rounded-md text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-700 transition"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* EXTREME RIGHT — HELP + PROFILE */}
        <div className="hidden md:flex items-center gap-3 ml-auto pr-6 ">
          <button className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium"
            onClick={() => navigate('/')} >
            Back to Home
          </button>
          <ProfileDropdown />
        </div>

        {/* MOBILE MENU */}

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden ml-auto p-2 text-slate-300 hover:bg-slate-700 rounded-md "
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}
