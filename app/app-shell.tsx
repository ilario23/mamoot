'use client';

import DesktopSidebar from '@/components/layout/DesktopSidebar';
import BottomNav from '@/components/layout/BottomNav';
import SidebarUserProfile from '@/components/layout/SidebarUserProfile';
import LoginWall from '@/components/auth/LoginWall';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {Loader2} from 'lucide-react';
import type {ReactNode} from 'react';

const AppShell = ({children}: {children: ReactNode}) => {
  const {isAuthenticated, isLoading} = useStravaAuth();

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
    <div className='min-h-screen flex w-full bg-background'>
      {/* Desktop Sidebar */}
      <DesktopSidebar />

      {/* Main Content */}
      <div className='flex-1 flex flex-col min-h-screen pb-16 md:pb-0'>
        {/* Mobile header */}
        <header className='border-b-3 border-border p-3 md:hidden flex items-center justify-between'>
          <h1 className='font-black text-xl tracking-tight'>🏃 RunTeam AI</h1>
          <SidebarUserProfile compact />
        </header>

        <main className='flex-1 p-4 md:p-6 overflow-auto'>{children}</main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav />
    </div>
  );
};

export default AppShell;
