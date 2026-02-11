// ============================================================
// useCoachPlan — Manages coach plan history (localStorage + Dexie + Neon)
// ============================================================
//
// Stores structured training plans so the Nutritionist and Physio
// agents can reference the active plan in their system prompts.
//
// Persistence layers (three-tier, same pattern as chat data):
//   1. localStorage — fast cross-tab sync for the active plan
//   2. Dexie / IndexedDB — durable local cache (all plans)
//   3. Neon PostgreSQL — cloud backup (fire-and-forget writes)

import {useState, useEffect, useCallback, useRef} from 'react';
import {db, type CachedCoachPlan} from '@/lib/db';
import {
  neonGetCoachPlans,
  neonSyncCoachPlan,
  neonDeleteCoachPlan,
  neonActivateCoachPlan,
} from '@/lib/chatSync';

const STORAGE_KEY = 'runzone-coach-plan-active';

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

  // Hydrate from Dexie → Neon when athlete is known
  useEffect(() => {
    if (!athleteId || hydratedRef.current) return;
    hydratedRef.current = true;

    const hydrate = async () => {
      setIsLoading(true);

      // 1. Try Dexie first
      try {
        const local = await db.coachPlans
          .where('athleteId')
          .equals(athleteId)
          .reverse()
          .sortBy('sharedAt');
        if (local.length > 0) {
          setPlans(local);
          const active = local.find((p) => p.isActive);
          if (active) writeActiveRef(active);
          setIsLoading(false);
          return;
        }
      } catch {
        // Dexie unavailable — fall through
      }

      // 2. Fall back to Neon
      const remote = await neonGetCoachPlans(athleteId);
      if (remote && remote.length > 0) {
        setPlans(remote);
        const active = remote.find((p) => p.isActive);
        if (active) writeActiveRef(active);
        // Back-fill Dexie
        try {
          await db.coachPlans.bulkPut(remote);
        } catch {
          // Silently ignore
        }
      }

      setIsLoading(false);
    };

    hydrate();
  }, [athleteId]);

  // Sync active plan ref across tabs via storage event
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      // Another tab changed the active plan — reload from Dexie
      if (athleteId) {
        db.coachPlans
          .where('athleteId')
          .equals(athleteId)
          .reverse()
          .sortBy('sharedAt')
          .then((local) => setPlans(local))
          .catch(() => {});
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

      // Dexie — insert new plan (no need to deactivate others since new plan is inactive)
      (async () => {
        try {
          await db.coachPlans.put(newPlan);
        } catch {
          // Silently ignore
        }
      })();

      // Neon (fire-and-forget) — server already saved via tool execute,
      // but sync anyway for resilience
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

      // Dexie — flip flags
      (async () => {
        try {
          const all = await db.coachPlans
            .where('athleteId')
            .equals(athleteId)
            .toArray();
          const updates = all.map((p) => ({
            ...p,
            isActive: p.id === planId,
          }));
          await db.coachPlans.bulkPut(updates);
        } catch {
          // Silently ignore
        }
      })();

      // Neon
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

      // Dexie — await to ensure deletion completes before any potential refresh
      try {
        await db.coachPlans.delete(planId);
      } catch {
        // Dexie unavailable — continue with Neon delete
      }

      // If the deleted plan was active, activate next in Dexie + Neon
      if (wasActive && athleteId) {
        const nextActive = plans.filter((p) => p.id !== planId)[0];
        if (nextActive) {
          db.coachPlans
            .update(nextActive.id, {isActive: true})
            .catch(() => {});
          neonActivateCoachPlan(nextActive.id, athleteId);
        }
      }

      // Neon — await to ensure deletion completes on the server
      await neonDeleteCoachPlan(planId);
    },
    [athleteId, plans],
  );

  return {plans, activePlan, savePlan, activatePlan, deletePlan, isLoading};
};
