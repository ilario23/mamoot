import { useState } from "react";
import { Outlet } from "react-router-dom";
import DesktopSidebar from "./DesktopSidebar";
import BottomNav from "./BottomNav";
import AITeamChat from "./AITeamChat";

const AppLayout = () => {
  const [mobileAiOpen, setMobileAiOpen] = useState(false);

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Desktop Sidebar */}
      <DesktopSidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen pb-16 md:pb-0">
        {/* Mobile header */}
        <header className="border-b-3 border-foreground p-3 md:hidden flex items-center">
          <h1 className="font-black text-xl tracking-tight">🏃 RunTeam AI</h1>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav onAiChat={() => setMobileAiOpen(true)} />

      {/* Mobile AI Chat Overlay */}
      {mobileAiOpen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col md:hidden">
          <div className="border-b-3 border-foreground p-3 flex items-center justify-between">
            <h2 className="font-black text-xl">AI Team</h2>
            <button
              onClick={() => setMobileAiOpen(false)}
              className="w-10 h-10 flex items-center justify-center font-black text-2xl border-3 border-foreground hover:bg-muted transition-colors"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <AITeamChat />
          </div>
        </div>
      )}
    </div>
  );
};

export default AppLayout;
