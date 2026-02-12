// ============================================================
// useCoachPlan — Manages coach plan history (localStorage + Neon)
// ============================================================
//
// Stores structured training plans so the Nutritionist and Physio
// agents can reference the active plan in their system prompts.
//
// Persistence layers:
//   1. localStorage — fast cross-tab sync for the active plan
//   2. Neon PostgreSQL — primary persistent store

import {useState, useEffect, useCallback, useRef} from 'react';
import type {CachedCoachPlan} from '@/lib/cacheTypes';
import {
  neonGetCoachPlans,
  neonSyncCoachPlan,
  neonDeleteCoachPlan,
  neonActivateCoachPlan,
} from '@/lib/chatSync';

const STORAGE_KEY = 'mamoot-coach-plan-active';

/** Lightweight active plan data stored in localStorage for cross-tab sync. */
interface ActivePlanRef {
  id: string;
  title: string;
  content: string;
  sharedAt: number;
}

export interface CoachPlan extends CachedCoachPlan {}

export interface UseCoachPlanResult {
  /** All plans for this athlete (newest first) */
  plans: CoachPlan[];
  /** The currently active plan, or null if none */
  activePlan: CoachPlan | null;
  /** Save a new plan (from AI tool call). Deactivates previous plans. */
  savePlan: (plan: Omit<CoachPlan, 'isActive'>) => void;
  /** Set a specific plan as the active one */
  activatePlan: (planId: string) => void;
  /** Delete a plan by ID */
  deletePlan: (planId: string) => Promise<void>;
  /** Whether plans are still loading */
  isLoading: boolean;
}

// ---- localStorage helpers (active plan ref only) ----

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

const writeActiveRef = (plan: CoachPlan): void => {
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

export const useCoachPlan = (athleteId: number | null): UseCoachPlanResult => {
  const [plans, setPlans] = useState<CoachPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hydratedRef = useRef(false);

  const activePlan = plans.find((p) => p.isActive) ?? null;

  // Hydrate from Neon when athlete is known
  useEffect(() => {
    if (!athleteId || hydratedRef.current) return;
    hydratedRef.current = true;

    const hydrate = async () => {
      setIsLoading(true);

      const remote = await neonGetCoachPlans(athleteId);
      if (remote && remote.length > 0) {
        const sorted = [...remote].sort((a, b) => b.sharedAt - a.sharedAt);
        setPlans(sorted);
        const active = sorted.find((p) => p.isActive);
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
      // Another tab changed the active plan — reload from Neon
      if (athleteId) {
        neonGetCoachPlans(athleteId).then((remote) => {
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
    (plan: Omit<CoachPlan, 'isActive'>) => {
      // New plans are saved as inactive — user must explicitly activate
      const newPlan: CoachPlan = {...plan, isActive: false};

      setPlans((prev) => {
        // Skip if plan already exists (e.g. reloaded tool result from persisted messages)
        if (prev.some((p) => p.id === newPlan.id)) return prev;
        return [newPlan, ...prev];
      });

      if (!athleteId) return;

      // Neon — sync the new plan
      neonSyncCoachPlan(newPlan);
    },
    [athleteId],
  );

  const activatePlan = useCallback(
    (planId: string) => {
      setPlans((prev) =>
        prev.map((p) => ({...p, isActive: p.id === planId})),
      );

      // Update localStorage
      const target = plans.find((p) => p.id === planId);
      if (target) writeActiveRef({...target, isActive: true});

      if (!athleteId) return;

      // Neon — activate plan (deactivates all others)
      neonActivateCoachPlan(planId, athleteId);
    },
    [athleteId, plans],
  );

  const deletePlan = useCallback(
    async (planId: string) => {
      const wasActive = plans.find((p) => p.id === planId)?.isActive ?? false;

      setPlans((prev) => {
        const filtered = prev.filter((p) => p.id !== planId);
        // If the deleted plan was active, activate the newest remaining
        if (wasActive && filtered.length > 0) {
          filtered[0] = {...filtered[0], isActive: true};
        }
        return filtered;
      });

      if (wasActive) {
        const remaining = plans.filter((p) => p.id !== planId);
        if (remaining.length > 0) {
          writeActiveRef({...remaining[0], isActive: true});
        } else {
          removeActiveRef();
        }
      }

      // Delete from Neon
      await neonDeleteCoachPlan(planId);

      // If the deleted plan was active, activate next in Neon
      if (wasActive && athleteId) {
        const nextActive = plans.filter((p) => p.id !== planId)[0];
        if (nextActive) {
          neonActivateCoachPlan(nextActive.id, athleteId);
        }
      }
    },
    [athleteId, plans],
  );

  return {plans, activePlan, savePlan, activatePlan, deletePlan, isLoading};
};
