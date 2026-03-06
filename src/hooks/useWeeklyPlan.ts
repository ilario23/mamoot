import {useState, useEffect, useCallback, useRef} from 'react';
import type {CachedWeeklyPlan, CachedTrainingFeedback} from '@/lib/cacheTypes';
import type {
  OptimizationPriority,
  StrategySelectionMode,
  TrainingStrategyPreset,
} from '@/lib/trainingStrategy';
import {
  neonGetWeeklyPlans,
  neonDeleteWeeklyPlan,
  neonActivateWeeklyPlan,
  neonGetTrainingFeedback,
  neonSyncTrainingFeedback,
} from '@/lib/chatSync';
import {fetchUserSettingsRow} from '@/lib/userSettingsSync';
import {type AiClientError, parseAiErrorFromUnknown} from '@/lib/aiErrors';

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
  lastError: AiClientError | null;
  previousWeekStart: string;
  previousWeekFeedback: CachedTrainingFeedback | null;
  isLoadingPreviousWeekFeedback: boolean;
  isSavingPreviousWeekFeedback: boolean;
  submitPreviousWeekFeedback: (input: {
    adherence: number;
    effort: number;
    fatigue: number;
    soreness: number;
    mood: number;
    confidence: number;
    notes?: string;
  }) => Promise<void>;
  refreshPreviousWeekFeedback: () => Promise<void>;
}

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

const getCurrentMonday = (): string => {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysSinceMonday);
  return toIsoDate(monday);
};

const getPreviousMonday = (): string => {
  const currentMonday = new Date(getCurrentMonday());
  currentMonday.setDate(currentMonday.getDate() - 7);
  return toIsoDate(currentMonday);
};

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
  const [lastError, setLastError] = useState<AiClientError | null>(null);
  const [previousWeekFeedback, setPreviousWeekFeedback] =
    useState<CachedTrainingFeedback | null>(null);
  const [isLoadingPreviousWeekFeedback, setIsLoadingPreviousWeekFeedback] =
    useState(false);
  const [isSavingPreviousWeekFeedback, setIsSavingPreviousWeekFeedback] =
    useState(false);
  const hydratedAthleteRef = useRef<number | null>(null);

  const activePlan = plans.find((p) => p.isActive) ?? null;
  const previousWeekStart = getPreviousMonday();

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

  const loadPreviousWeekFeedback = useCallback(async () => {
    if (!athleteId) return;
    setIsLoadingPreviousWeekFeedback(true);
    try {
      const rows = await neonGetTrainingFeedback(athleteId, previousWeekStart);
      setPreviousWeekFeedback(rows?.[0] ?? null);
    } finally {
      setIsLoadingPreviousWeekFeedback(false);
    }
  }, [athleteId, previousWeekStart]);

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
      await Promise.all([loadPlans(), loadPreferences(), loadPreviousWeekFeedback()]);
      setIsLoading(false);
    };

    hydrate();
  }, [athleteId, loadPlans, loadPreferences, loadPreviousWeekFeedback]);

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
      setLastError(null);

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
          const traceId = res.headers.get('x-trace-id');
          let responseBody: unknown = null;
          try {
            responseBody = await res.json();
          } catch {
            responseBody = null;
          }
          const parsed = parseAiErrorFromUnknown(
            responseBody,
            'Failed to generate weekly plan',
          );
          const nextError: AiClientError = {
            ...parsed,
            status: res.status,
            traceId,
          };
          setLastError(nextError);
          console.error(
            '[useWeeklyPlan] Generation failed:',
            res.status,
            nextError,
          );
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
        setLastError(null);
        return newPlan;
      } catch (err) {
        console.error('[useWeeklyPlan] Generation error:', err);
        setLastError({
          ...parseAiErrorFromUnknown(null, 'Failed to generate weekly plan'),
          status: 0,
          traceId: null,
        });
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

  const submitPreviousWeekFeedback = useCallback(
    async (input: {
      adherence: number;
      effort: number;
      fatigue: number;
      soreness: number;
      mood: number;
      confidence: number;
      notes?: string;
    }) => {
      if (!athleteId) return;
      setIsSavingPreviousWeekFeedback(true);
      const now = Date.now();
      const record: CachedTrainingFeedback = {
        id: `${athleteId}:${previousWeekStart}`,
        athleteId,
        weekStart: previousWeekStart,
        adherence: input.adherence,
        effort: input.effort,
        fatigue: input.fatigue,
        soreness: input.soreness,
        mood: input.mood,
        confidence: input.confidence,
        notes: input.notes?.trim() ? input.notes.trim() : null,
        source: 'weekly_plan_ui',
        createdAt: previousWeekFeedback?.createdAt ?? now,
        updatedAt: now,
      };
      try {
        await neonSyncTrainingFeedback(record);
        setPreviousWeekFeedback(record);
      } finally {
        setIsSavingPreviousWeekFeedback(false);
      }
    },
    [athleteId, previousWeekFeedback?.createdAt, previousWeekStart],
  );

  const refreshPreviousWeekFeedback = useCallback(async () => {
    await loadPreviousWeekFeedback();
  }, [loadPreviousWeekFeedback]);

  return {
    plans,
    activePlan,
    activatePlan,
    deletePlan,
    isLoading,
    isGenerating,
    generatePlan,
    refresh,
    preferences,
    setPreferences,
    savePreferences,
    preferencesLoaded,
    lastError,
    previousWeekStart,
    previousWeekFeedback,
    isLoadingPreviousWeekFeedback,
    isSavingPreviousWeekFeedback,
    submitPreviousWeekFeedback,
    refreshPreviousWeekFeedback,
  };
};
