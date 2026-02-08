'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {LayoutDashboard, CalendarDays, List, Bot, Trophy, Mountain} from 'lucide-react';
import SidebarUserProfile from '@/components/layout/SidebarUserProfile';

const navItems = [
  {href: '/', icon: LayoutDashboard, label: 'Dashboard', activeClass: 'bg-nav-dashboard text-nav-dashboard-foreground'},
  {href: '/calendar', icon: CalendarDays, label: 'Calendar', activeClass: 'bg-nav-calendar text-nav-calendar-foreground'},
  {href: '/activities', icon: List, label: 'Activities', activeClass: 'bg-nav-activities text-nav-activities-foreground'},
  {href: '/records', icon: Trophy, label: 'Records', activeClass: 'bg-nav-records text-nav-records-foreground'},
  {href: '/segments', icon: Mountain, label: 'Segments', activeClass: 'bg-nav-segments text-nav-segments-foreground'},
  {href: '/ai-chat', icon: Bot, label: 'AI Team', activeClass: 'bg-nav-ai text-nav-ai-foreground'},
];

const DesktopSidebar = () => {
  const pathname = usePathname();

  return (
    <aside className='hidden md:flex flex-col w-64 border-r-3 border-border bg-background shrink-0 h-screen sticky top-0'>
      {/* Logo */}
      <div className='p-5 border-b-3 border-border'>
        <div className='flex items-center gap-3'>
          <div className='w-10 h-10 bg-primary border-3 border-border shadow-neo-sm flex items-center justify-center shrink-0'>
            <span className='font-black text-lg text-primary-foreground leading-none select-none'>
              R
            </span>
          </div>
          <div>
            <h1 className='font-black text-xl tracking-tight leading-none'>
              RunTeam
            </h1>
            <span className='inline-block mt-1 bg-foreground text-background text-[10px] font-black px-1.5 py-px uppercase tracking-widest select-none'>
              AI
            </span>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav className='p-3 space-y-2'>
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 font-bold text-sm border-3 border-border transition-all ${
                isActive
                  ? `${item.activeClass} shadow-neo-sm`
                  : 'bg-background hover:bg-muted'
              }`}
            >
              <item.icon className='h-5 w-5' />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User profile */}
      <div className='mt-auto'>
        <SidebarUserProfile />
      </div>
    </aside>
  );
};

export default DesktopSidebar;
