'use client';

import DesktopSidebar from '@/components/layout/DesktopSidebar';
import BottomNav from '@/components/layout/BottomNav';
import SidebarUserProfile from '@/components/layout/SidebarUserProfile';
import LoginWall from '@/components/auth/LoginWall';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {SidebarProvider} from '@/contexts/SidebarContext';
import {useCoachPlan} from '@/hooks/useCoachPlan';
import usePageTheme from '@/hooks/usePageTheme';
import useServiceWorker from '@/hooks/useServiceWorker';
import {Loader2, ClipboardList} from 'lucide-react';
import Link from 'next/link';
import type {ReactNode} from 'react';

const AppShell = ({children}: {children: ReactNode}) => {
  const {isAuthenticated, isLoading, athlete} = useStravaAuth();
  const {activePlan} = useCoachPlan(athlete?.id ?? null);
  const pageTheme = usePageTheme();
  useServiceWorker();

  const themeStyle = {
    '--page-accent': `var(${pageTheme.accent})`,
    '--page-accent-foreground': `var(${pageTheme.accentForeground})`,
  } as React.CSSProperties;

  if (isLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background pt-safe pb-safe' suppressHydrationWarning>
        <Loader2 className='h-8 w-8 animate-spin text-primary' />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginWall />;
  }

  return (
    <SidebarProvider>
      <div className='h-app-screen flex w-full bg-background overflow-x-hidden pl-safe pr-safe' style={themeStyle}>
        {/* Desktop Sidebar */}
        <DesktopSidebar />

        {/* Main Content */}
        <div className='flex-1 flex flex-col h-app-screen pb-bottom-nav md:pb-0'>
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
            <div className='ml-auto flex items-center gap-2'>
              {activePlan && (
                <Link
                  href='/training-plan'
                  aria-label='View training plan'
                  tabIndex={0}
                  className='relative p-1.5 border-2 border-border bg-background hover:bg-primary/5 transition-colors'
                >
                  <ClipboardList className='h-4.5 w-4.5 text-foreground' />
                  <span className='absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-primary rounded-full animate-pulse' />
                </Link>
              )}
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
