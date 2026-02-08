import {Toaster} from '@/components/ui/toaster';
import {Toaster as Sonner} from '@/components/ui/sonner';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ThemeProvider} from 'next-themes';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {BrowserRouter, Routes, Route} from 'react-router-dom';
import {SettingsProvider} from '@/contexts/SettingsContext';
import {StravaAuthProvider} from '@/contexts/StravaAuthContext';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/legacy-pages/Dashboard';
import ActivityDetail from '@/legacy-pages/ActivityDetail';
import Settings from '@/legacy-pages/Settings';
import AIChat from '@/legacy-pages/AIChat';
import Calendar from '@/legacy-pages/Calendar';
import NotFound from '@/legacy-pages/NotFound';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute='class' defaultTheme='light' enableSystem={false}>
      <TooltipProvider>
        <BrowserRouter>
          <StravaAuthProvider>
            <SettingsProvider>
              <Toaster />
              <Sonner />
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path='/' element={<Dashboard />} />
                  <Route path='/activity/:id' element={<ActivityDetail />} />
                  <Route path='/calendar' element={<Calendar />} />
                  <Route path='/ai-chat' element={<AIChat />} />
                  <Route path='/settings' element={<Settings />} />
                </Route>
                <Route path='*' element={<NotFound />} />
              </Routes>
            </SettingsProvider>
          </StravaAuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
