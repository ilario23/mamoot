'use client';

import DesktopSidebar from '@/components/layout/DesktopSidebar';
import BottomNav from '@/components/layout/BottomNav';
import SidebarUserProfile from '@/components/layout/SidebarUserProfile';
import LoginWall from '@/components/auth/LoginWall';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {SidebarProvider} from '@/contexts/SidebarContext';
import usePageTheme from '@/hooks/usePageTheme';
import useServiceWorker from '@/hooks/useServiceWorker';
import {Loader2} from 'lucide-react';
import type {ReactNode} from 'react';

const AppShell = ({children}: {children: ReactNode}) => {
  const {isAuthenticated, isLoading} = useStravaAuth();
  const pageTheme = usePageTheme();
  useServiceWorker();

  const themeStyle = {
    '--page-accent': `var(${pageTheme.accent})`,
    '--page-accent-foreground': `var(${pageTheme.accentForeground})`,
  } as React.CSSProperties;

  if (isLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background'>
        <Loader2 className='h-8 w-8 animate-spin text-primary' />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginWall />;
  }

  return (
    <SidebarProvider>
      <div className='min-h-screen flex w-full bg-background overflow-x-hidden' style={themeStyle}>
        {/* Desktop Sidebar */}
        <DesktopSidebar />

        {/* Main Content */}
        <div className='flex-1 flex flex-col h-screen pb-bottom-nav md:pb-0'>
          {/* Mobile header */}
          <header className='border-b-3 border-border p-3 md:hidden flex items-center'>
            <h1 className='font-black text-xl tracking-tight'>🏃 RunTeam AI</h1>
            <div className='ml-auto'>
              <SidebarUserProfile compact />
            </div>
          </header>

          <main className='flex-1 px-3 py-4 md:p-6 overflow-y-auto overflow-x-hidden border-t-[4px] border-page overscroll-y-contain'>{children}</main>
        </div>

        {/* Mobile Bottom Nav */}
        <BottomNav />
      </div>
    </SidebarProvider>
  );
};

export default AppShell;
