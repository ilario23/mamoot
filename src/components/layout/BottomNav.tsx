"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, Settings, Bot, Trophy } from "lucide-react";

const items = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/calendar", icon: CalendarDays, label: "Calendar" },
  { href: "/records", icon: Trophy, label: "Records" },
  { href: "/ai-chat", icon: Bot, label: "AI Team" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

const BottomNav = () => {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 flex border-t-3 border-foreground bg-background z-40">
      {items.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-1 py-3 font-bold text-xs transition-colors ${
              isActive ? "bg-primary text-primary-foreground" : "bg-background"
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};

export default BottomNav;
