'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  List,
  Bot,
  Trophy,
  Mountain,
  Cog,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import SidebarUserProfile from '@/components/layout/SidebarUserProfile';
import {useSidebarCollapse} from '@/contexts/SidebarContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const navItems = [
  {href: '/', icon: LayoutDashboard, label: 'Dashboard', activeClass: 'bg-nav-dashboard text-nav-dashboard-foreground'},
  {href: '/calendar', icon: CalendarDays, label: 'Calendar', activeClass: 'bg-nav-calendar text-nav-calendar-foreground'},
  {href: '/activities', icon: List, label: 'Activities', activeClass: 'bg-nav-activities text-nav-activities-foreground'},
  {href: '/records', icon: Trophy, label: 'Records', activeClass: 'bg-nav-records text-nav-records-foreground'},
  {href: '/segments', icon: Mountain, label: 'Segments', activeClass: 'bg-nav-segments text-nav-segments-foreground'},
  {href: '/ai-chat', icon: Bot, label: 'AI Team', activeClass: 'bg-nav-ai text-nav-ai-foreground'},
  {href: '/gear', icon: Cog, label: 'Gear', activeClass: 'bg-nav-gear text-nav-gear-foreground'},
];

const DesktopSidebar = () => {
  const pathname = usePathname();
  const {isCollapsed, toggleSidebar} = useSidebarCollapse();

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={`hidden md:flex flex-col border-r-3 border-border bg-background shrink-0 h-screen sticky top-0 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-[68px]' : 'w-64'
        }`}
      >
        {/* Logo + collapse toggle */}
        <div className='p-3 border-b-3 border-border'>
          <div className='flex items-center justify-between'>
            <div className={`flex items-center gap-3 overflow-hidden ${isCollapsed ? 'justify-center w-full' : ''}`}>
              <div className='w-10 h-10 bg-page border-3 border-border shadow-neo-sm flex items-center justify-center shrink-0 transition-colors duration-300'>
                <span className='font-black text-lg text-page-foreground leading-none select-none'>
                  R
                </span>
              </div>
              {!isCollapsed && (
                <div className='overflow-hidden whitespace-nowrap'>
                  <h1 className='font-black text-xl tracking-tight leading-none'>
                    RunTeam
                  </h1>
                  <span className='inline-block mt-1 bg-foreground text-background text-[10px] font-black px-1.5 py-px uppercase tracking-widest select-none'>
                    AI
                  </span>
                </div>
              )}
            </div>
            {!isCollapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleSidebar}
                    aria-label='Collapse sidebar'
                    tabIndex={0}
                    className='p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted border-2 border-transparent hover:border-border transition-all shrink-0'
                  >
                    <PanelLeftClose className='h-4 w-4' />
                  </button>
                </TooltipTrigger>
                <TooltipContent side='right'>
                  <p>Collapse sidebar</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Expand button when collapsed */}
        {isCollapsed && (
          <div className='flex justify-center py-2'>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleSidebar}
                  aria-label='Expand sidebar'
                  tabIndex={0}
                  className='p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted border-2 border-transparent hover:border-border transition-all'
                >
                  <PanelLeftOpen className='h-4 w-4' />
                </button>
              </TooltipTrigger>
              <TooltipContent side='right'>
                <p>Expand sidebar</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Nav links */}
        <nav className={`space-y-2 ${isCollapsed ? 'p-2' : 'p-3'}`}>
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);

            const linkContent = (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 font-bold text-sm border-3 border-border transition-all ${
                  isCollapsed
                    ? 'justify-center px-0 py-3'
                    : 'px-4 py-3'
                } ${
                  isActive
                    ? `${item.activeClass} shadow-neo-sm`
                    : 'bg-background hover:bg-muted'
                }`}
                aria-label={item.label}
              >
                <item.icon className='h-5 w-5 shrink-0' />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );

            if (isCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side='right'>
                    <p>{item.label}</p>
                  </TooltipContent>
                </Tooltip>
              );
            }

            return linkContent;
          })}
        </nav>

        {/* User profile */}
        <div className='mt-auto'>
          <SidebarUserProfile collapsed={isCollapsed} />
        </div>
      </aside>
    </TooltipProvider>
  );
};

export default DesktopSidebar;
