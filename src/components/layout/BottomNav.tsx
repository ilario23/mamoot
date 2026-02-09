'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {LayoutDashboard, CalendarDays, List, Bot, Trophy, Mountain, Cog} from 'lucide-react';

const items = [
  {href: '/', icon: LayoutDashboard, label: 'Dashboard', activeClass: 'bg-nav-dashboard text-nav-dashboard-foreground'},
  {href: '/calendar', icon: CalendarDays, label: 'Calendar', activeClass: 'bg-nav-calendar text-nav-calendar-foreground'},
  {href: '/activities', icon: List, label: 'Activities', activeClass: 'bg-nav-activities text-nav-activities-foreground'},
  {href: '/records', icon: Trophy, label: 'Records', activeClass: 'bg-nav-records text-nav-records-foreground'},
  {href: '/segments', icon: Mountain, label: 'Segments', activeClass: 'bg-nav-segments text-nav-segments-foreground'},
  {href: '/ai-chat', icon: Bot, label: 'AI Team', activeClass: 'bg-nav-ai text-nav-ai-foreground'},
  {href: '/gear', icon: Cog, label: 'Gear', activeClass: 'bg-nav-gear text-nav-gear-foreground'},
];

const BottomNav = () => {
  const pathname = usePathname();

  return (
    <nav className='md:hidden fixed bottom-0 left-0 right-0 flex border-t-3 border-border bg-background z-40'>
      {items.map((item) => {
        const isActive =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center gap-1 py-3 font-bold text-xs transition-colors ${
              isActive ? item.activeClass : 'bg-background'
            }`}
          >
            <item.icon className='h-5 w-5' />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};

export default BottomNav;
