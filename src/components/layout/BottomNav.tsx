import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Settings, Bot } from "lucide-react";

interface BottomNavProps {
  onAiChat: () => void;
}

const BottomNav = ({ onAiChat }: BottomNavProps) => {
  const location = useLocation();

  const items = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { icon: Bot, label: "AI Team", onClick: onAiChat },
    { to: "/settings", icon: Settings, label: "Settings" },
  ] as const;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 flex border-t-3 border-foreground bg-background z-40">
      {items.map((item, i) => {
        const isActive = "to" in item && item.to ? location.pathname === item.to : false;
        const baseClass = `flex-1 flex flex-col items-center gap-1 py-3 font-bold text-xs transition-colors ${
          isActive ? "bg-primary text-primary-foreground" : "bg-background"
        }`;

        if ("onClick" in item && item.onClick) {
          return (
            <button key={i} onClick={item.onClick} className={baseClass}>
              <item.icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        }

        return (
          <Link key={i} to={"to" in item ? item.to! : "/"} className={baseClass}>
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};

export default BottomNav;
