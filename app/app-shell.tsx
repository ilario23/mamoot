"use client";

import DesktopSidebar from "@/components/layout/DesktopSidebar";
import BottomNav from "@/components/layout/BottomNav";
import type { ReactNode } from "react";

const AppShell = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop Sidebar */}
      <DesktopSidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen pb-16 md:pb-0">
        {/* Mobile header */}
        <header className="border-b-3 border-border p-3 md:hidden flex items-center">
          <h1 className="font-black text-xl tracking-tight">🏃 RunTeam AI</h1>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav />
    </div>
  );
};

export default AppShell;
