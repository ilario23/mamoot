'use client';

import {createContext, useContext, type ReactNode} from 'react';
import {useCoachPlan, type UseCoachPlanResult} from '@/hooks/useCoachPlan';

const CoachPlanContext = createContext<UseCoachPlanResult | null>(null);

interface CoachPlanProviderProps {
  athleteId: number | null;
  children: ReactNode;
}

export const CoachPlanProvider = ({athleteId, children}: CoachPlanProviderProps) => {
  const coachPlan = useCoachPlan(athleteId);
  return (
    <CoachPlanContext.Provider value={coachPlan}>
      {children}
    </CoachPlanContext.Provider>
  );
};

/** Shared coach plan state — must be used within CoachPlanProvider */
export const useCoachPlanContext = (): UseCoachPlanResult => {
  const ctx = useContext(CoachPlanContext);
  if (!ctx) {
    throw new Error('useCoachPlanContext must be used within CoachPlanProvider');
  }
  return ctx;
};
