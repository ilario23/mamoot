'use client';

import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ThemeProvider} from 'next-themes';
import {TooltipProvider} from '@/components/ui/tooltip';
import {StravaAuthProvider, useStravaAuth} from '@/contexts/StravaAuthContext';
import {SettingsProvider, useSettings} from '@/contexts/SettingsContext';
import {Toaster} from '@/components/ui/toaster';
import {Toaster as Sonner} from '@/components/ui/sonner';
import {useState, useEffect, useRef, type ReactNode} from 'react';

interface ProvidersProps {
  children: ReactNode;
}

/** Bridges StravaAuth → SettingsContext to load settings from Neon once athleteId is known. */
const SettingsLoader = ({children}: {children: ReactNode}) => {
  const {athlete} = useStravaAuth();
  const {loadSettings} = useSettings();
  const loadedForRef = useRef<number | null>(null);

  useEffect(() => {
    if (athlete?.id && loadedForRef.current !== athlete.id) {
      loadedForRef.current = athlete.id;
      loadSettings(athlete.id);
    }
  }, [athlete?.id, loadSettings]);

  return <>{children}</>;
};

const Providers = ({children}: ProvidersProps) => {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute='class'
        defaultTheme='light'
        enableSystem={false}
      >
        <TooltipProvider>
          <StravaAuthProvider>
            <SettingsProvider>
              <SettingsLoader>
                <Toaster />
                <Sonner />
                {children}
              </SettingsLoader>
            </SettingsProvider>
          </StravaAuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default Providers;
