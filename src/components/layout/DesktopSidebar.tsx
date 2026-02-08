"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, Settings, Bot, Trophy } from "lucide-react";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/calendar", icon: CalendarDays, label: "Calendar" },
  { href: "/records", icon: Trophy, label: "Records" },
  { href: "/ai-chat", icon: Bot, label: "AI Team" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

const DesktopSidebar = () => {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-64 border-r-3 border-border bg-background shrink-0 h-screen sticky top-0">
      {/* Logo */}
      <div className="p-4 border-b-3 border-border">
        <h1 className="font-black text-2xl tracking-tight">🏃 RunTeam AI</h1>
      </div>

      {/* Nav links */}
      <nav className="p-3 space-y-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 font-bold text-sm border-3 border-border transition-all ${
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
    </aside>
  );
};

export default DesktopSidebar;
