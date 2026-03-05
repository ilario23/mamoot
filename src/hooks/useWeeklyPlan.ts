import {useState, useEffect, useCallback, useRef} from 'react';
import type {CachedWeeklyPlan} from '@/lib/cacheTypes';
import type {
  OptimizationPriority,
  StrategySelectionMode,
  TrainingStrategyPreset,
} from '@/lib/trainingStrategy';
import {
  neonGetWeeklyPlans,
  neonDeleteWeeklyPlan,
  neonActivateWeeklyPlan,
} from '@/lib/chatSync';
import {fetchUserSettingsRow} from '@/lib/userSettingsSync';

const STORAGE_KEY = 'mamoot-weekly-plan-active';
const getActiveStorageKey = (athleteId: number): string =>
  `${STORAGE_KEY}:${athleteId}`;

interface ActivePlanRef {
  id: string;
  title: string;
  weekStart: string;
  createdAt: number;
}

export type WeeklyPlan = CachedWeeklyPlan;
export type WeeklyGenerationMode = 'full' | 'remaining_days';

export interface GeneratePlanOptions {
  weekStartDate?: string;
  preferences?: string;
  mode?: WeeklyGenerationMode;
  sourcePlanId?: string;
  today?: string;
  strategySelectionMode?: StrategySelectionMode;
  strategyPreset?: TrainingStrategyPreset;
  optimizationPriority?: OptimizationPriority;
}

export interface UseWeeklyPlanResult {
  plans: WeeklyPlan[];
  activePlan: WeeklyPlan | null;
  activatePlan: (planId: string) => void;
  deletePlan: (planId: string) => Promise<void>;
  isLoading: boolean;
  isGenerating: boolean;
  generatePlan: (options?: GeneratePlanOptions) => Promise<WeeklyPlan | null>;
  refresh: () => Promise<void>;
  preferences: string;
  setPreferences: (value: string) => void;
  savePreferences: () => Promise<void>;
  preferencesLoaded: boolean;
}

const writeActiveRef = (athleteId: number, plan: WeeklyPlan): void => {
  const ref: ActivePlanRef = {
    id: plan.id,
    title: plan.title,
    weekStart: plan.weekStart,
    createdAt: plan.createdAt,
  };
  localStorage.setItem(getActiveStorageKey(athleteId), JSON.stringify(ref));
};

const removeActiveRef = (athleteId: number): void => {
  localStorage.removeItem(getActiveStorageKey(athleteId));
};

export const useWeeklyPlan = (athleteId: number | null): UseWeeklyPlanResult => {
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [preferences, setPreferences] = useState('');
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const hydratedAthleteRef = useRef<number | null>(null);

  const activePlan = plans.find((p) => p.isActive) ?? null;

  const loadPlans = useCallback(async () => {
    if (!athleteId) return;
    const remote = await neonGetWeeklyPlans(athleteId);
    if (!remote || remote.length === 0) {
      setPlans([]);
      removeActiveRef(athleteId);
      return;
    }
    const sorted = [...remote].sort((a, b) => b.createdAt - a.createdAt);
    setPlans(sorted);
    const active = sorted.find((p) => p.isActive);
    if (active) {
      writeActiveRef(athleteId, active);
    } else {
      removeActiveRef(athleteId);
    }
  }, [athleteId]);

  const loadPreferences = useCallback(async () => {
    if (!athleteId) return;
    try {
      const data = await fetchUserSettingsRow(athleteId);
      const savedPreferences =
        typeof data?.weeklyPreferences === 'string'
          ? data.weeklyPreferences
          : '';
      if (savedPreferences) {
        setPreferences(savedPreferences);
      }
    } catch {
      // Non-blocking
    } finally {
      setPreferencesLoaded(true);
    }
  }, [athleteId]);

  const savePreferences = useCallback(async () => {
    if (!athleteId) return;
    try {
      await fetch('/api/db/user-settings', {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({athleteId, weeklyPreferences: preferences}),
      });
    } catch {
      // Non-blocking
    }
  }, [athleteId, preferences]);

  useEffect(() => {
    if (!athleteId || hydratedAthleteRef.current === athleteId) return;
    hydratedAthleteRef.current = athleteId;
    setPreferencesLoaded(false);

    const hydrate = async () => {
      setIsLoading(true);
      await Promise.all([loadPlans(), loadPreferences()]);
      setIsLoading(false);
    };

    hydrate();
  }, [athleteId, loadPlans, loadPreferences]);

  useEffect(() => {
    if (!athleteId) return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== getActiveStorageKey(athleteId)) return;
      loadPlans().catch(() => {});
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [athleteId, loadPlans]);

  const generatePlan = useCallback(
    async (options?: GeneratePlanOptions): Promise<WeeklyPlan | null> => {
      if (!athleteId) return null;
      setIsGenerating(true);

      const prefsToSend = options?.preferences ?? (preferences || undefined);
      const payload = {
        athleteId,
        weekStartDate: options?.weekStartDate,
        preferences: prefsToSend,
        mode: options?.mode ?? 'full',
        sourcePlanId: options?.sourcePlanId,
        today: options?.today,
        strategySelectionMode: options?.strategySelectionMode,
        strategyPreset: options?.strategyPreset,
        optimizationPriority: options?.optimizationPriority,
      };

      try {
        const res = await fetch('/api/ai/weekly-plan', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          console.error('[useWeeklyPlan] Generation failed:', res.status);
          return null;
        }

        const data = await res.json();
        const newPlan: WeeklyPlan = {
          id: data.id,
          athleteId,
          weekStart: data.weekStart,
          title: data.title,
          summary: data.summary ?? null,
          goal: data.goal ?? null,
          sessions: data.sessions,
          content: data.content,
          isActive: true,
          blockId: data.blockId ?? null,
          weekNumber: data.weekNumber ?? null,
          createdAt: data.createdAt,
        };

        setPlans((prev) => {
          const deactivated = prev.map((p) => ({...p, isActive: false}));
          return [newPlan, ...deactivated];
        });

        writeActiveRef(athleteId, newPlan);
        return newPlan;
      } catch (err) {
        console.error('[useWeeklyPlan] Generation error:', err);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [athleteId, preferences],
  );

  const activatePlan = useCallback(
    (planId: string) => {
      setPlans((prev) =>
        prev.map((p) => ({...p, isActive: p.id === planId})),
      );

      const target = plans.find((p) => p.id === planId);
      if (target && athleteId) writeActiveRef(athleteId, {...target, isActive: true});

      if (!athleteId) return;
      neonActivateWeeklyPlan(planId, athleteId);
    },
    [athleteId, plans],
  );

  const deletePlan = useCallback(
    async (planId: string) => {
      const wasActive = plans.find((p) => p.id === planId)?.isActive ?? false;

      setPlans((prev) => {
        const filtered = prev.filter((p) => p.id !== planId);
        if (wasActive && filtered.length > 0) {
          filtered[0] = {...filtered[0], isActive: true};
        }
        return filtered;
      });

      if (wasActive) {
        const remaining = plans.filter((p) => p.id !== planId);
        if (remaining.length > 0) {
          if (athleteId) writeActiveRef(athleteId, {...remaining[0], isActive: true});
        } else {
          if (athleteId) removeActiveRef(athleteId);
        }
      }

      await neonDeleteWeeklyPlan(planId);

      if (wasActive && athleteId) {
        const nextActive = plans.filter((p) => p.id !== planId)[0];
        if (nextActive) {
          neonActivateWeeklyPlan(nextActive.id, athleteId);
        }
      }
    },
    [athleteId, plans],
  );

  const refresh = useCallback(async () => {
    await loadPlans();
  }, [loadPlans]);

  return {plans, activePlan, activatePlan, deletePlan, isLoading, isGenerating, generatePlan, refresh, preferences, setPreferences, savePreferences, preferencesLoaded};
};
