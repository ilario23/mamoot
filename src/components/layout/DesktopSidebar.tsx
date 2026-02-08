import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Settings } from "lucide-react";
import AITeamChat from "./AITeamChat";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const DesktopSidebar = () => {
  const location = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-80 border-r-3 border-foreground bg-background shrink-0 h-screen sticky top-0">
      {/* Logo */}
      <div className="p-4 border-b-3 border-foreground">
        <h1 className="font-black text-2xl tracking-tight">🏃 RunTeam AI</h1>
      </div>

      {/* Nav links */}
      <nav className="p-3 space-y-2 border-b-3 border-foreground">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-4 py-3 font-bold text-sm border-3 border-foreground transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-neo-sm"
                  : "bg-background hover:bg-muted"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* AI Team Chat — fills remaining space */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AITeamChat />
      </div>
    </aside>
  );
};

export default DesktopSidebar;
