import type {LucideIcon} from 'lucide-react';
import {
  LayoutDashboard,
  CalendarDays,
  List,
  Bot,
  Trophy,
  Mountain,
  Cog,
  MoreHorizontal,
  MessageSquare,
  ClipboardList,
  Target,
} from 'lucide-react';

export type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  activeClass: string;
};

export type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  children: NavItem[];
};

export type NavEntry = NavItem | NavGroup;

export const isNavGroup = (entry: NavEntry): entry is NavGroup =>
  'children' in entry;

export const navEntries: NavEntry[] = [
  {href: '/', icon: LayoutDashboard, label: 'Home', activeClass: 'bg-nav-dashboard text-nav-dashboard-foreground'},
  {href: '/activities', icon: List, label: 'Activities', activeClass: 'bg-nav-activities text-nav-activities-foreground'},
  {
    id: 'ai-plans',
    label: 'AI Plans',
    icon: Bot,
    children: [
      {href: '/ai-chat', icon: MessageSquare, label: 'AI Chat', activeClass: 'bg-nav-ai text-nav-ai-foreground'},
      {href: '/training-block', icon: Target, label: 'Training Block', activeClass: 'bg-nav-training-block text-nav-training-block-foreground'},
      {href: '/weekly-plan', icon: ClipboardList, label: 'Weekly Plan', activeClass: 'bg-nav-weekly-plan text-nav-weekly-plan-foreground'},
    ],
  },
  {
    id: 'more',
    label: 'More',
    icon: MoreHorizontal,
    children: [
      {href: '/calendar', icon: CalendarDays, label: 'Calendar', activeClass: 'bg-nav-calendar text-nav-calendar-foreground'},
      {href: '/records', icon: Trophy, label: 'Records', activeClass: 'bg-nav-records text-nav-records-foreground'},
      {href: '/segments', icon: Mountain, label: 'Segments', activeClass: 'bg-nav-segments text-nav-segments-foreground'},
      {href: '/gear', icon: Cog, label: 'Gear', activeClass: 'bg-nav-gear text-nav-gear-foreground'},
    ],
  },
];

export const desktopNavEntries: NavEntry[] = navEntries.map((entry) => {
  if (!isNavGroup(entry) && entry.href === '/') {
    return {...entry, label: 'Dashboard'};
  }
  return entry;
});
