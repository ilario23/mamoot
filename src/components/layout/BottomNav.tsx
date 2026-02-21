'use client';

import {useState, useEffect} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Popover, PopoverTrigger, PopoverContent} from '@/components/ui/popover';
import {navEntries, isNavGroup} from '@/lib/navConfig';
import type {NavItem, NavGroup} from '@/lib/navConfig';

const isItemActive = (href: string, pathname: string) =>
  href === '/' ? pathname === '/' : pathname.startsWith(href);

const BottomNavLink = ({item, pathname}: {item: NavItem; pathname: string}) => {
  const isActive = isItemActive(item.href, pathname);
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={isActive ? 'page' : undefined}
      className={`min-w-[56px] flex-1 flex flex-col items-center gap-0.5 py-2.5 font-bold text-[10px] transition-colors ${
        isActive ? item.activeClass : 'bg-background'
      }`}
    >
      <item.icon className="h-5 w-5" aria-hidden="true" />
      <span className="truncate max-w-[56px]">{item.label}</span>
    </Link>
  );
};

const BottomNavGroup = ({group, pathname}: {group: NavGroup; pathname: string}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const activeChild = group.children.find((child) =>
    isItemActive(child.href, pathname),
  );

  const buttonClass = activeChild
    ? activeChild.activeClass
    : 'bg-background';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={group.label}
          aria-expanded={open}
          className={`min-w-[56px] flex-1 flex flex-col items-center gap-0.5 py-2.5 font-bold text-[10px] transition-colors ${buttonClass}`}
        >
          <group.icon className="h-5 w-5" aria-hidden="true" />
          <span className="truncate max-w-[56px]">{group.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={8}
        className="w-auto min-w-[180px] p-0 border-3 border-border shadow-neo bg-background"
      >
        <div className="flex flex-col">
          {group.children.map((child) => {
            const isActive = isItemActive(child.href, pathname);
            return (
              <Link
                key={child.href}
                href={child.href}
                aria-label={child.label}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 py-3 font-bold text-sm transition-colors border-b-3 border-border last:border-b-0 ${
                  isActive ? child.activeClass : 'bg-background hover:bg-muted'
                }`}
              >
                <child.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>{child.label}</span>
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const BottomNav = () => {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 flex overflow-x-auto scrollbar-hide border-t-3 border-border bg-background z-40 pb-safe"
      aria-label="Main navigation"
    >
      {navEntries.map((entry) => {
        if (isNavGroup(entry)) {
          return (
            <BottomNavGroup
              key={entry.id}
              group={entry}
              pathname={pathname}
            />
          );
        }
        return (
          <BottomNavLink
            key={entry.href}
            item={entry}
            pathname={pathname}
          />
        );
      })}
    </nav>
  );
};

export default BottomNav;
