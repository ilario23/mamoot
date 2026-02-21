'use client';

import {useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {PanelLeftClose, PanelLeftOpen, ChevronDown} from 'lucide-react';
import SidebarUserProfile from '@/components/layout/SidebarUserProfile';
import {useSidebarCollapse} from '@/contexts/SidebarContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {Popover, PopoverTrigger, PopoverContent} from '@/components/ui/popover';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {desktopNavEntries, isNavGroup} from '@/lib/navConfig';
import type {NavItem, NavGroup} from '@/lib/navConfig';

const isItemActive = (href: string, pathname: string) =>
  href === '/' ? pathname === '/' : pathname.startsWith(href);

const SidebarLink = ({
  item,
  pathname,
  isCollapsed,
  indented = false,
}: {
  item: NavItem;
  pathname: string;
  isCollapsed: boolean;
  indented?: boolean;
}) => {
  const isActive = isItemActive(item.href, pathname);

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 font-bold text-sm border-3 border-border transition-all ${
        isCollapsed ? 'justify-center px-0 py-3' : indented ? 'px-4 py-2.5 ml-4' : 'px-4 py-3'
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

const SidebarGroupExpanded = ({
  group,
  pathname,
}: {
  group: NavGroup;
  pathname: string;
}) => {
  const activeChild = group.children.find((c) =>
    isItemActive(c.href, pathname),
  );
  const [open, setOpen] = useState(!!activeChild);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type='button'
          aria-label={group.label}
          className={`w-full flex items-center gap-3 px-4 py-3 font-bold text-sm border-3 border-border transition-all ${
            activeChild && !open
              ? `${activeChild.activeClass} shadow-neo-sm`
              : 'bg-background hover:bg-muted'
          }`}
        >
          <group.icon className='h-5 w-5 shrink-0' />
          <span>{group.label}</span>
          <ChevronDown
            className={`h-4 w-4 ml-auto shrink-0 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className='space-y-1 mt-1'>
        {group.children.map((child) => (
          <SidebarLink
            key={child.href}
            item={child}
            pathname={pathname}
            isCollapsed={false}
            indented
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};

const SidebarGroupCollapsed = ({
  group,
  pathname,
}: {
  group: NavGroup;
  pathname: string;
}) => {
  const activeChild = group.children.find((c) =>
    isItemActive(c.href, pathname),
  );

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type='button'
              aria-label={group.label}
              className={`w-full flex items-center justify-center py-3 font-bold text-sm border-3 border-border transition-all ${
                activeChild
                  ? `${activeChild.activeClass} shadow-neo-sm`
                  : 'bg-background hover:bg-muted'
              }`}
            >
              <group.icon className='h-5 w-5 shrink-0' />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side='right'>
          <p>{group.label}</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side='right'
        sideOffset={8}
        className='w-auto min-w-[180px] p-0 border-3 border-border shadow-neo bg-background'
      >
        <div className='flex flex-col'>
          {group.children.map((child) => {
            const isActive = isItemActive(child.href, pathname);
            return (
              <Link
                key={child.href}
                href={child.href}
                aria-label={child.label}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 py-3 font-bold text-sm transition-colors border-b-3 border-border last:border-b-0 ${
                  isActive
                    ? child.activeClass
                    : 'bg-background hover:bg-muted'
                }`}
              >
                <child.icon className='h-5 w-5 shrink-0' aria-hidden='true' />
                <span>{child.label}</span>
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
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
                <img
                  src='/icons/icon-192x192.png'
                  alt='Mamoot logo'
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
        <nav className={`space-y-2 ${isCollapsed ? 'p-2' : 'p-3'}`}>
          {desktopNavEntries.map((entry) => {
            if (isNavGroup(entry)) {
              if (isCollapsed) {
                return (
                  <SidebarGroupCollapsed
                    key={entry.id}
                    group={entry}
                    pathname={pathname}
                  />
                );
              }
              return (
                <SidebarGroupExpanded
                  key={entry.id}
                  group={entry}
                  pathname={pathname}
                />
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
