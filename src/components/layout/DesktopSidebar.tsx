'use client';

import Link from 'next/link';
import Image from 'next/image';
import {usePathname} from 'next/navigation';
import {PanelLeftClose, PanelLeftOpen} from 'lucide-react';
import SidebarUserProfile from '@/components/layout/SidebarUserProfile';
import {useSidebarCollapse} from '@/contexts/SidebarContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {desktopNavEntries, isNavGroup} from '@/lib/navConfig';
import type {NavItem} from '@/lib/navConfig';

const isItemActive = (href: string, pathname: string) =>
  href === '/' ? pathname === '/' : pathname.startsWith(href);

const SidebarLink = ({
  item,
  pathname,
  isCollapsed,
}: {
  item: NavItem;
  pathname: string;
  isCollapsed: boolean;
}) => {
  const isActive = isItemActive(item.href, pathname);

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 font-bold text-sm border-3 border-border transition-all ${
        isCollapsed ? 'justify-center px-0 py-3' : 'px-4 py-3'
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
};

const SidebarGroupDivider = ({
  label,
  isCollapsed,
}: {
  label: string;
  isCollapsed: boolean;
}) => {
  if (isCollapsed) {
    return <hr className='border-t-2 border-border my-1' />;
  }

  return (
    <div className='flex items-center gap-2 pt-2'>
      <span className='text-[10px] font-black uppercase tracking-widest text-muted-foreground select-none whitespace-nowrap'>
        {label}
      </span>
      <div className='flex-1 border-t-2 border-border' />
    </div>
  );
};

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
              <div className='w-10 h-10 border-3 border-border shadow-neo-sm flex items-center justify-center shrink-0 transition-colors duration-300 overflow-hidden bg-white'>
                <Image
                  src='/icons/icon-192x192.png'
                  alt='Mamoot logo'
                  width={40}
                  height={40}
                  className='w-full h-full object-contain'
                />
              </div>
              {!isCollapsed && (
                <div className='overflow-hidden whitespace-nowrap'>
                  <h1 className='font-black text-xl tracking-tight leading-none'>
                    Mamoot
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
        <nav className={`space-y-1 ${isCollapsed ? 'p-2' : 'p-3'}`}>
          {desktopNavEntries.map((entry) => {
            if (isNavGroup(entry)) {
              return (
                <div key={entry.id} className='space-y-1'>
                  <SidebarGroupDivider label={entry.label} isCollapsed={isCollapsed} />
                  {entry.children.map((child) => {
                    const linkContent = (
                      <SidebarLink
                        key={child.href}
                        item={child}
                        pathname={pathname}
                        isCollapsed={isCollapsed}
                      />
                    );

                    if (isCollapsed) {
                      return (
                        <Tooltip key={child.href}>
                          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                          <TooltipContent side='right'>
                            <p>{child.label}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return linkContent;
                  })}
                </div>
              );
            }

            const linkContent = (
              <SidebarLink
                key={entry.href}
                item={entry}
                pathname={pathname}
                isCollapsed={isCollapsed}
              />
            );

            if (isCollapsed) {
              return (
                <Tooltip key={entry.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side='right'>
                    <p>{entry.label}</p>
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
