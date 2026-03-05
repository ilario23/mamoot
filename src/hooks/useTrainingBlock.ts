import {useState, useEffect, useCallback, useRef} from 'react';
import type {CachedTrainingBlock} from '@/lib/cacheTypes';
import type {
  OptimizationPriority,
  StrategySelectionMode,
  TrainingStrategyPreset,
} from '@/lib/trainingStrategy';
import {
  neonGetTrainingBlocks,
  neonDeleteTrainingBlock,
  neonActivateTrainingBlock,
} from '@/lib/chatSync';
import {type AiClientError, parseAiErrorFromUnknown} from '@/lib/aiErrors';

export type TrainingBlock = CachedTrainingBlock;
export type TrainingBlockAdaptationType =
  | 'recalibrate_remaining_weeks'
  | 'insert_event'
  | 'shift_target_date';

export interface AdaptTrainingBlockOptions {
  adaptationType: TrainingBlockAdaptationType;
  sourceBlockId?: string;
  effectiveFromWeek?: number;
  event?: {
    name: string;
    date: string;
    distanceKm?: number;
    priority?: 'A' | 'B' | 'C';
  };
  goalDate?: string;
  strategySelectionMode?: StrategySelectionMode;
  strategyPreset?: TrainingStrategyPreset;
  optimizationPriority?: OptimizationPriority;
}

export interface GenerateTrainingBlockOptions {
  goalEvent: string;
  goalDate: string;
  totalWeeks?: number;
  strategySelectionMode?: StrategySelectionMode;
  strategyPreset?: TrainingStrategyPreset;
  optimizationPriority?: OptimizationPriority;
}

export interface UseTrainingBlockResult {
  blocks: TrainingBlock[];
  activeBlock: TrainingBlock | null;
  activateBlock: (blockId: string) => void;
  deleteBlock: (blockId: string) => Promise<void>;
  isLoading: boolean;
  isGenerating: boolean;
  generateBlock: (options: GenerateTrainingBlockOptions) => Promise<TrainingBlock | null>;
  adaptBlock: (options: AdaptTrainingBlockOptions) => Promise<TrainingBlock | null>;
  refresh: () => Promise<void>;
  lastError: AiClientError | null;
}

export const useTrainingBlock = (athleteId: number | null): UseTrainingBlockResult => {
  const [blocks, setBlocks] = useState<TrainingBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastError, setLastError] = useState<AiClientError | null>(null);
  const hydratedRef = useRef(false);

  const activeBlock = blocks.find((b) => b.isActive) ?? null;

  const loadBlocks = useCallback(async () => {
    if (!athleteId) return;
    const remote = await neonGetTrainingBlocks(athleteId);
    if (!remote || remote.length === 0) {
      setBlocks([]);
      return;
    }
    const sorted = [...remote].sort((a, b) => b.createdAt - a.createdAt);
    setBlocks(sorted);
  }, [athleteId]);

  useEffect(() => {
    if (!athleteId || hydratedRef.current) return;
    hydratedRef.current = true;

    const hydrate = async () => {
      setIsLoading(true);
      await loadBlocks();
      setIsLoading(false);
    };

    hydrate();
  }, [athleteId, loadBlocks]);

  const generateBlock = useCallback(
    async (options: GenerateTrainingBlockOptions): Promise<TrainingBlock | null> => {
      if (!athleteId) return null;
      setIsGenerating(true);
      setLastError(null);

      try {
        const res = await fetch('/api/ai/training-block', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            athleteId,
            goalEvent: options.goalEvent,
            goalDate: options.goalDate,
            totalWeeks: options.totalWeeks || undefined,
            strategySelectionMode: options.strategySelectionMode,
            strategyPreset: options.strategyPreset,
            optimizationPriority: options.optimizationPriority,
          }),
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
            'Failed to generate training block',
          );
          const nextError: AiClientError = {
            ...parsed,
            status: res.status,
            traceId,
          };
          setLastError(nextError);
          console.error(
            '[useTrainingBlock] Generation failed:',
            res.status,
            nextError,
          );
          return null;
        }

        const data = await res.json();
        const newBlock: TrainingBlock = {
          id: data.id,
          athleteId,
          goalEvent: data.goalEvent,
          goalDate: data.goalDate,
          totalWeeks: data.totalWeeks,
          startDate: data.startDate,
          phases: data.phases,
          weekOutlines: data.weekOutlines,
          isActive: true,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };

        setBlocks((prev) => {
          const deactivated = prev.map((b) => ({...b, isActive: false}));
          return [newBlock, ...deactivated];
        });

        setLastError(null);
        return newBlock;
      } catch (err) {
        console.error('[useTrainingBlock] Generation error:', err);
        setLastError({
          ...parseAiErrorFromUnknown(null, 'Failed to generate training block'),
          status: 0,
          traceId: null,
        });
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [athleteId],
  );

  const adaptBlock = useCallback(
    async (options: AdaptTrainingBlockOptions): Promise<TrainingBlock | null> => {
      if (!athleteId) return null;
      setIsGenerating(true);
      setLastError(null);

      try {
        const res = await fetch('/api/ai/training-block', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            athleteId,
            mode: 'adapt',
            ...options,
          }),
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
            'Failed to adapt training block',
          );
          const nextError: AiClientError = {
            ...parsed,
            status: res.status,
            traceId,
          };
          setLastError(nextError);
          console.error(
            '[useTrainingBlock] Adaptation failed:',
            res.status,
            nextError,
          );
          return null;
        }

        const data = await res.json();
        const newBlock: TrainingBlock = {
          id: data.id,
          athleteId,
          goalEvent: data.goalEvent,
          goalDate: data.goalDate,
          totalWeeks: data.totalWeeks,
          startDate: data.startDate,
          phases: data.phases,
          weekOutlines: data.weekOutlines,
          isActive: true,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };

        setBlocks((prev) => {
          const deactivated = prev.map((b) => ({...b, isActive: false}));
          return [newBlock, ...deactivated];
        });

        setLastError(null);
        return newBlock;
      } catch (err) {
        console.error('[useTrainingBlock] Adaptation error:', err);
        setLastError({
          ...parseAiErrorFromUnknown(null, 'Failed to adapt training block'),
          status: 0,
          traceId: null,
        });
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [athleteId],
  );

  const activateBlock = useCallback(
    (blockId: string) => {
      setBlocks((prev) =>
        prev.map((b) => ({...b, isActive: b.id === blockId})),
      );
      if (!athleteId) return;
      neonActivateTrainingBlock(blockId, athleteId);
    },
    [athleteId],
  );

  const deleteBlock = useCallback(
    async (blockId: string) => {
      if (!athleteId) return;
      const wasActive = blocks.find((b) => b.id === blockId)?.isActive ?? false;
      const remainingBlocks = blocks.filter((b) => b.id !== blockId);
      const nextActive = wasActive ? remainingBlocks[0] : null;

      setBlocks((prev) => {
        const filtered = prev.filter((b) => b.id !== blockId);
        if (wasActive && filtered.length > 0) {
          filtered[0] = {...filtered[0], isActive: true};
        }
        return filtered;
      });

      try {
        await neonDeleteTrainingBlock(blockId, athleteId);
        if (nextActive) {
          await neonActivateTrainingBlock(nextActive.id, athleteId);
        }
      } finally {
        await loadBlocks();
      }
    },
    [athleteId, blocks, loadBlocks],
  );

  const refresh = useCallback(async () => {
    await loadBlocks();
  }, [loadBlocks]);

  return {
    blocks,
    activeBlock,
    activateBlock,
    deleteBlock,
    isLoading,
    isGenerating,
    generateBlock,
    adaptBlock,
    refresh,
    lastError,
  };
};
