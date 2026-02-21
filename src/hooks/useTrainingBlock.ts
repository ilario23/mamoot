import {useState, useEffect, useCallback, useRef} from 'react';
import type {CachedTrainingBlock} from '@/lib/cacheTypes';
import {
  neonGetTrainingBlocks,
  neonDeleteTrainingBlock,
  neonActivateTrainingBlock,
} from '@/lib/chatSync';

export type TrainingBlock = CachedTrainingBlock;

export interface UseTrainingBlockResult {
  blocks: TrainingBlock[];
  activeBlock: TrainingBlock | null;
  activateBlock: (blockId: string) => void;
  deleteBlock: (blockId: string) => Promise<void>;
  isLoading: boolean;
  isGenerating: boolean;
  generateBlock: (goalEvent: string, goalDate: string, totalWeeks?: number) => Promise<TrainingBlock | null>;
  refresh: () => Promise<void>;
}

export const useTrainingBlock = (athleteId: number | null): UseTrainingBlockResult => {
  const [blocks, setBlocks] = useState<TrainingBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const hydratedRef = useRef(false);

  const activeBlock = blocks.find((b) => b.isActive) ?? null;

  const loadBlocks = useCallback(async () => {
    if (!athleteId) return;
    const remote = await neonGetTrainingBlocks(athleteId);
    if (remote && remote.length > 0) {
      const sorted = [...remote].sort((a, b) => b.createdAt - a.createdAt);
      setBlocks(sorted);
    }
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
    async (goalEvent: string, goalDate: string, totalWeeks?: number): Promise<TrainingBlock | null> => {
      if (!athleteId) return null;
      setIsGenerating(true);

      try {
        const res = await fetch('/api/ai/training-block', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({athleteId, goalEvent, goalDate, totalWeeks: totalWeeks || undefined}),
        });

        if (!res.ok) {
          console.error('[useTrainingBlock] Generation failed:', res.status);
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

        return newBlock;
      } catch (err) {
        console.error('[useTrainingBlock] Generation error:', err);
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
      const wasActive = blocks.find((b) => b.id === blockId)?.isActive ?? false;

      setBlocks((prev) => {
        const filtered = prev.filter((b) => b.id !== blockId);
        if (wasActive && filtered.length > 0) {
          filtered[0] = {...filtered[0], isActive: true};
        }
        return filtered;
      });

      await neonDeleteTrainingBlock(blockId);

      if (wasActive && athleteId) {
        const nextActive = blocks.filter((b) => b.id !== blockId)[0];
        if (nextActive) {
          neonActivateTrainingBlock(nextActive.id, athleteId);
        }
      }
    },
    [athleteId, blocks],
  );

  const refresh = useCallback(async () => {
    await loadBlocks();
  }, [loadBlocks]);

  return {blocks, activeBlock, activateBlock, deleteBlock, isLoading, isGenerating, generateBlock, refresh};
};
