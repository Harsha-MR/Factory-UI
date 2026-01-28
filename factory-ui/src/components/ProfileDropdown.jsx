import { User, Settings, LogOut, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export default function ProfileDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const menuItems = [
    { icon: User, label: "My Profile", href: "/profile" },
    { icon: Settings, label: "Settings", href: "/settings" },
    { icon: LogOut, label: "Sign Out", href: "/logout", danger: true },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* PROFILE BUTTON (FIXED HEIGHT) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 h-8 px-2 rounded-md bg-slate-700 hover:bg-slate-600 transition-colors duration-200"
        aria-label="Profile menu"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-semibold text-xs">
          W
        </div>

        <div className="hidden lg:flex flex-col justify-center leading-none">
          <span className="text-xs font-medium text-white">Wimera</span>
          <span className="text-[10px] text-slate-400">Admin</span>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* DROPDOWN (UNCHANGED) */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-2 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="px-4 py-3 border-b border-slate-700">
            <p className="text-sm font-medium text-white">wimera</p>
            <p className="text-xs text-slate-400">wimera@company.com</p>
          </div>

          {menuItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                item.danger
                  ? "text-red-400 hover:bg-red-500/10"
                  : "text-slate-300 hover:bg-slate-700"
              }`}
              onClick={() => setIsOpen(false)}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
