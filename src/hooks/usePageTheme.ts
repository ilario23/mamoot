import {usePathname} from 'next/navigation';

type PageTheme = {
  accent: string;
  accentForeground: string;
  key: string;
};

const ROUTE_THEME_MAP: Record<string, PageTheme> = {
  '/': {accent: '--nav-dashboard', accentForeground: '--nav-dashboard-foreground', key: 'dashboard'},
  '/calendar': {accent: '--nav-calendar', accentForeground: '--nav-calendar-foreground', key: 'calendar'},
  '/activities': {accent: '--nav-activities', accentForeground: '--nav-activities-foreground', key: 'activities'},
  '/activity': {accent: '--nav-activities', accentForeground: '--nav-activities-foreground', key: 'activities'},
  '/records': {accent: '--nav-records', accentForeground: '--nav-records-foreground', key: 'records'},
  '/segments': {accent: '--nav-segments', accentForeground: '--nav-segments-foreground', key: 'segments'},
  '/ai-chat': {accent: '--nav-ai', accentForeground: '--nav-ai-foreground', key: 'ai'},
  '/gear': {accent: '--nav-gear', accentForeground: '--nav-gear-foreground', key: 'gear'},
  '/settings': {accent: '--nav-dashboard', accentForeground: '--nav-dashboard-foreground', key: 'dashboard'},
};

const DEFAULT_THEME: PageTheme = {
  accent: '--nav-dashboard',
  accentForeground: '--nav-dashboard-foreground',
  key: 'dashboard',
};

const usePageTheme = (): PageTheme => {
  const pathname = usePathname();

  // Exact match first
  if (ROUTE_THEME_MAP[pathname]) {
    return ROUTE_THEME_MAP[pathname];
  }

  // Prefix match for dynamic routes like /activity/[id]
  const match = Object.entries(ROUTE_THEME_MAP).find(
    ([route]) => route !== '/' && pathname.startsWith(route),
  );

  return match ? match[1] : DEFAULT_THEME;
};

export default usePageTheme;
