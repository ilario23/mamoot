"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StravaAuthProvider } from "@/contexts/StravaAuthContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { useState, type ReactNode } from "react";

interface ProvidersProps {
  children: ReactNode;
}

const Providers = ({ children }: ProvidersProps) => {
  const [queryClient] = useState(
    () => new QueryClient()
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <TooltipProvider>
          <StravaAuthProvider>
            <SettingsProvider>
              <Toaster />
              <Sonner />
              {children}
            </SettingsProvider>
          </StravaAuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default Providers;
