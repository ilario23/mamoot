// ============================================================
// useCoachPlan — Manages coach plan sharing (localStorage + Dexie + Neon)
// ============================================================
//
// Stores the coach's training plan so the Nutritionist and Physio
// agents can reference it in their system prompts.
//
// Persistence layers (three-tier, same pattern as chat data):
//   1. localStorage — instant cross-tab sync
//   2. Dexie / IndexedDB — durable local cache
//   3. Neon PostgreSQL — cloud backup (fire-and-forget writes)

import {useState, useEffect, useCallback, useRef} from 'react';
import {db, type CachedCoachPlan} from '@/lib/db';
import {
  neonGetCoachPlan,
  neonSyncCoachPlan,
  neonDeleteCoachPlan,
} from '@/lib/chatSync';

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

// ---- localStorage helpers ----

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

const writeToStorage = (plan: CoachPlan): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
};

const removeFromStorage = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

// ---- Dexie helpers ----

const toCached = (athleteId: number, plan: CoachPlan): CachedCoachPlan => ({
  athleteId,
  content: plan.content,
  sharedAt: new Date(plan.sharedAt).getTime(),
});

const fromCached = (cached: CachedCoachPlan): CoachPlan => ({
  content: cached.content,
  sharedAt: new Date(cached.sharedAt).toISOString(),
});

export const useCoachPlan = (athleteId: number | null): UseCoachPlanResult => {
  const [plan, setPlan] = useState<CoachPlan | null>(() => readFromStorage());
  const hydratedRef = useRef(false);

  // Hydrate from Dexie → Neon when athlete is known
  useEffect(() => {
    if (!athleteId || hydratedRef.current) return;
    hydratedRef.current = true;

    const hydrate = async () => {
      // 1. Try Dexie first
      try {
        const local = await db.coachPlans.get(athleteId);
        if (local) {
          const restored = fromCached(local);
          setPlan(restored);
          writeToStorage(restored);
          return;
        }
      } catch {
        // Dexie unavailable — fall through
      }

      // 2. Fall back to Neon
      const remote = await neonGetCoachPlan(athleteId);
      if (remote) {
        const restored = fromCached(remote);
        setPlan(restored);
        writeToStorage(restored);
        // Back-fill Dexie
        try {
          await db.coachPlans.put(remote);
        } catch {
          // Silently ignore
        }
      }
    };

    hydrate();
  }, [athleteId]);

  // Sync across tabs via the storage event
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setPlan(readFromStorage());
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const sharePlan = useCallback(
    (content: string) => {
      const next: CoachPlan = {content, sharedAt: new Date().toISOString()};

      // 1. localStorage (instant)
      writeToStorage(next);
      setPlan(next);

      if (!athleteId) return;

      const cached = toCached(athleteId, next);

      // 2. Dexie (fire-and-forget)
      db.coachPlans.put(cached).catch(() => {});

      // 3. Neon (fire-and-forget)
      neonSyncCoachPlan(cached);
    },
    [athleteId],
  );

  const clearPlan = useCallback(() => {
    // 1. localStorage (instant)
    removeFromStorage();
    setPlan(null);

    if (!athleteId) return;

    // 2. Dexie (fire-and-forget)
    db.coachPlans.delete(athleteId).catch(() => {});

    // 3. Neon (fire-and-forget)
    neonDeleteCoachPlan(athleteId);
  }, [athleteId]);

  return {plan, sharePlan, clearPlan};
};
