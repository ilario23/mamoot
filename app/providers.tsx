'use client';

import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ThemeProvider} from 'next-themes';
import {TooltipProvider} from '@/components/ui/tooltip';
import {StravaAuthProvider, useStravaAuth} from '@/contexts/StravaAuthContext';
import {SettingsProvider, useSettings} from '@/contexts/SettingsContext';
import {Toaster} from '@/components/ui/toaster';
import {Toaster as Sonner} from '@/components/ui/sonner';
import {useState, useEffect, type ReactNode} from 'react';

interface ProvidersProps {
  children: ReactNode;
}

/** Bridges StravaAuth → SettingsContext to trigger Neon sync once athleteId is known. */
const SettingsSyncBridge = ({children}: {children: ReactNode}) => {
  const {athlete} = useStravaAuth();
  const {syncToNeon} = useSettings();

  useEffect(() => {
    if (athlete?.id) {
      syncToNeon(athlete.id);
    }
  }, [athlete?.id, syncToNeon]);

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
              <SettingsSyncBridge>
                <Toaster />
                <Sonner />
                {children}
              </SettingsSyncBridge>
            </SettingsProvider>
          </StravaAuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default Providers;
