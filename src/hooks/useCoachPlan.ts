// ============================================================
// useCoachPlan — Manages coach plan sharing via localStorage
// ============================================================
//
// Stores the coach's training plan so the Nutritionist and Physio
// agents can reference it in their system prompts.

import {useState, useEffect, useCallback} from 'react';

const STORAGE_KEY = 'runzone-coach-plan';

export interface CoachPlan {
  /** The coach message content (markdown) */
  content: string;
  /** ISO timestamp when the plan was shared */
  sharedAt: string;
}

interface UseCoachPlanResult {
  /** The currently shared plan, or null if none */
  plan: CoachPlan | null;
  /** Save a coach message as the shared plan */
  sharePlan: (content: string) => void;
  /** Remove the shared plan */
  clearPlan: () => void;
}

const readFromStorage = (): CoachPlan | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CoachPlan;
    if (parsed.content && parsed.sharedAt) return parsed;
    return null;
  } catch {
    return null;
  }
};

export const useCoachPlan = (): UseCoachPlanResult => {
  const [plan, setPlan] = useState<CoachPlan | null>(() => readFromStorage());

  // Sync across tabs via the storage event
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setPlan(readFromStorage());
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const sharePlan = useCallback((content: string) => {
    const next: CoachPlan = {content, sharedAt: new Date().toISOString()};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setPlan(next);
  }, []);

  const clearPlan = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPlan(null);
  }, []);

  return {plan, sharePlan, clearPlan};
};
