import DesktopSidebar from './DesktopSidebar';
import BottomNav from './BottomNav';
import type { ReactNode } from 'react';

const AppLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className='min-h-screen flex w-full bg-background'>
      {/* Desktop Sidebar */}
      <DesktopSidebar />

      {/* Main Content */}
      <div className='flex-1 flex flex-col h-app-screen min-w-0 pb-16 md:pb-0'>
        {/* Mobile header */}
        <header className='border-b-3 border-border px-3 pb-3 pt-safe-ios md:hidden flex items-center'>
          <div className='flex items-center gap-2.5' role='banner' aria-label='RunTeam AI'>
              <div className='w-8 h-8 bg-page border-3 border-border shadow-neo-sm flex items-center justify-center shrink-0 transition-colors duration-300'>
                <span className='font-black text-sm text-page-foreground leading-none select-none'>
                  R
                </span>
              </div>
              <div className='flex flex-col overflow-hidden'>
                <h1 className='font-black text-lg tracking-tight leading-none'>
                  RunTeam
                </h1>
                <span className='inline-block mt-0.5 w-fit bg-foreground text-background text-[10px] font-black px-1.5 py-px uppercase tracking-widest select-none'>
                  AI
                </span>
              </div>
            </div>
        </header>

        <main className='flex-1 p-4 md:p-6 overflow-x-hidden overflow-y-auto'>
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav />
    </div>
  );
};

export default AppLayout;
