// ============================================================
// usePhysioPlan — Manages physio plan history (localStorage + Neon)
// ============================================================
//
// Stores structured strength/mobility plans so the Coach and
// Nutritionist agents can reference the active plan.
//
// Simplified vs useCoachPlan — no activation toggle UI;
// newest plan is used as active by default.

import {useState, useEffect, useCallback, useRef} from 'react';
import type {CachedPhysioPlan} from '@/lib/cacheTypes';
import {
  neonGetPhysioPlans,
  neonSyncPhysioPlan,
  neonDeletePhysioPlan,
} from '@/lib/chatSync';

const STORAGE_KEY = 'mamoot-physio-plan-active';

/** Lightweight active plan data stored in localStorage for cross-tab sync. */
interface ActivePlanRef {
  id: string;
  title: string;
  content: string;
  sharedAt: number;
}

export interface PhysioPlan extends CachedPhysioPlan {}

export interface UsePhysioPlanResult {
  /** All plans for this athlete (newest first) */
  plans: PhysioPlan[];
  /** The currently active plan, or null if none */
  activePlan: PhysioPlan | null;
  /** Save a new plan (from AI tool call). */
  savePlan: (plan: Omit<PhysioPlan, 'isActive'>) => void;
  /** Delete a plan by ID */
  deletePlan: (planId: string) => Promise<void>;
  /** Whether plans are still loading */
  isLoading: boolean;
}

// ---- localStorage helpers ----

const readActiveRef = (): ActivePlanRef | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActivePlanRef;
  } catch {
    return null;
  }
};

const writeActiveRef = (plan: PhysioPlan): void => {
  const ref: ActivePlanRef = {
    id: plan.id,
    title: plan.title,
    content: plan.content,
    sharedAt: plan.sharedAt,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ref));
};

const removeActiveRef = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

// ---- Hook ----

export const usePhysioPlan = (athleteId: number | null): UsePhysioPlanResult => {
  const [plans, setPlans] = useState<PhysioPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hydratedRef = useRef(false);

  const activePlan = plans.find((p) => p.isActive) ?? plans[0] ?? null;

  // Hydrate from Neon when athlete is known
  useEffect(() => {
    if (!athleteId || hydratedRef.current) return;
    hydratedRef.current = true;

    const hydrate = async () => {
      setIsLoading(true);

      const remote = await neonGetPhysioPlans(athleteId);
      if (remote && remote.length > 0) {
        const sorted = [...remote].sort((a, b) => b.sharedAt - a.sharedAt);
        setPlans(sorted);
        const active = sorted.find((p) => p.isActive) ?? sorted[0];
        if (active) writeActiveRef(active);
      }

      setIsLoading(false);
    };

    hydrate();
  }, [athleteId]);

  // Sync active plan ref across tabs via storage event
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (athleteId) {
        neonGetPhysioPlans(athleteId).then((remote) => {
          if (remote && remote.length > 0) {
            setPlans([...remote].sort((a, b) => b.sharedAt - a.sharedAt));
          }
        }).catch(() => {});
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [athleteId]);

  const savePlan = useCallback(
    (plan: Omit<PhysioPlan, 'isActive'>) => {
      // New plans are saved as inactive — consistent with coach plans
      const newPlan: PhysioPlan = {...plan, isActive: false};

      setPlans((prev) => {
        if (prev.some((p) => p.id === newPlan.id)) return prev;
        return [newPlan, ...prev];
      });

      if (!athleteId) return;

      neonSyncPhysioPlan(newPlan);
    },
    [athleteId],
  );

  const deletePlan = useCallback(
    async (planId: string) => {
      const wasActive = plans.find((p) => p.id === planId)?.isActive ?? false;

      setPlans((prev) => {
        const filtered = prev.filter((p) => p.id !== planId);
        return filtered;
      });

      if (wasActive) {
        const remaining = plans.filter((p) => p.id !== planId);
        if (remaining.length > 0) {
          writeActiveRef(remaining[0]);
        } else {
          removeActiveRef();
        }
      }

      await neonDeletePhysioPlan(planId);
    },
    [plans],
  );

  return {plans, activePlan, savePlan, deletePlan, isLoading};
};
