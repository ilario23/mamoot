import {useCallback, useEffect, useMemo, useState} from 'react';
import {CheckCircle2, ChevronDown, Loader2, Sparkles} from 'lucide-react';
import {useRouter} from 'next/navigation';
import ProgressiveIntakeCard from '@/components/chat/ProgressiveIntakeCard';
import IntakeStepControls from '@/components/chat/IntakeStepControls';
import IntakeReviewCard from '@/components/chat/IntakeReviewCard';
import AiGenerationStatusCard from '@/components/ai/AiGenerationStatusCard';
import AiErrorBanner from '@/components/ai/AiErrorBanner';
import {parseAiErrorFromUnknown} from '@/lib/aiErrors';
import {parseSseChunks, type AiProgressEvent, type AiProgressPhase} from '@/lib/aiProgress';
import {
  AUTO_STRATEGY_LABEL,
  OPTIMIZATION_PRIORITY_LABELS,
  STRATEGY_PRESET_LABELS,
  type OptimizationPriority,
  type StrategySelectionMode,
  type TrainingStrategyPreset,
} from '@/lib/trainingStrategy';
import {
  detectCoachIntakeIntent,
  defaultTrainingBlockRequirements,
  defaultWeeklyPlanEditRequirements,
  defaultWeeklyPlanRequirements,
  summarizeTrainingBlockRequirements,
  summarizeWeeklyPlanEditRequirements,
  summarizeWeeklyPlanRequirements,
  WEEKDAY_OPTIONS,
  type CoachIntakeIntent,
  type TrainingBlockRequirements,
  type WeeklyPlanEditRequirements,
  type WeeklyPlanRequirements,
} from '@/lib/coachIntake';
import type {CachedWeeklyPlan} from '@/lib/cacheTypes';
import {neonGetActiveWeeklyPlan, neonGetWeeklyPlans} from '@/lib/chatSync';

const WEEKLY_PHASE_ORDER: AiProgressPhase[] = [
  'context',
  'coach',
  'merge',
  'save',
];

const WEEKLY_PHASE_LABELS: Record<AiProgressPhase, string> = {
  context: 'Load context',
  coach: 'Coach draft',
  physio: 'Physio draft (legacy)',
  repair: 'Repair (legacy)',
  merge: 'Assemble week',
  save: 'Persist plan',
  done: 'Complete',
  error: 'Error',
};

const createPhaseMap = (): Record<
  AiProgressPhase,
  'pending' | 'in_progress' | 'done' | 'error'
> => ({
  context: 'pending',
  coach: 'pending',
  physio: 'pending',
  repair: 'pending',
  merge: 'pending',
  save: 'pending',
  done: 'pending',
  error: 'pending',
});

const toLocalIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCurrentMondayIso = (): string => {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);
  return toLocalIsoDate(monday);
};

const getNextMondayIso = (): string => {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  monday.setHours(0, 0, 0, 0);
  return toLocalIsoDate(monday);
};

type WeekOption = {
  id: string;
  label: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const formatWeekLabel = (weekStartIso: string): string => {
  const date = new Date(`${weekStartIso}T00:00:00Z`);
  const endDate = new Date(date.getTime() + DAY_MS * 6);
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `Week of ${weekStartIso} (${formatter.format(date)} - ${formatter.format(endDate)})`;
};

const buildWeekOptions = (anchorMondayIso: string, totalWeeks = 8): WeekOption[] => {
  const anchorDate = new Date(`${anchorMondayIso}T00:00:00`);
  anchorDate.setHours(0, 0, 0, 0);
  return Array.from({length: totalWeeks}, (_, index) => {
    const weekOffset = index - 1;
    const date = new Date(anchorDate.getTime() + weekOffset * 7 * DAY_MS);
    const weekStartIso = toLocalIsoDate(date);
    return {id: weekStartIso, label: formatWeekLabel(weekStartIso)};
  });
};

const WEEKLY_STEP_IDS = [
  'target_week',
  'run_days',
  'availability',
  'long_run',
  'intensity',
  'focus',
  'strategy',
] as const;

const BLOCK_STEP_IDS = [
  'goal_event',
  'goal_date',
  'baseline',
  'availability',
  'strategy',
  'notes',
] as const;

const WEEKLY_EDIT_STEP_IDS = [
  'target_week',
  'mode',
  'focus',
  'goal',
  'constraints',
  'day_notes',
] as const;

type IntakeMode = 'idle' | 'collecting' | 'review';

const logIntakeEvent = (
  event: string,
  payload?: Record<string, unknown>,
): void => {
  console.info('[CoachIntake]', event, payload ?? {});
};

const buildIdempotencyKey = (
  scope: 'weekly_plan' | 'weekly_plan_edit' | 'training_block',
  athleteId: number,
) => `${scope}:${athleteId}:${Date.now()}:${crypto.randomUUID()}`;

interface CoachGuidedIntakePanelProps {
  activePersonaId: string;
  athleteId: number | null;
  selectedModel: string;
  launchIntent: CoachIntakeIntent | null;
  onLaunchHandled: () => void;
  onWeeklyPlanCreated?: () => Promise<void> | void;
  onTrainingBlockCreated?: () => Promise<void> | void;
}

const CoachGuidedIntakePanel = ({
  activePersonaId,
  athleteId,
  selectedModel,
  launchIntent,
  onLaunchHandled,
  onWeeklyPlanCreated,
  onTrainingBlockCreated,
}: CoachGuidedIntakePanelProps) => {
  const router = useRouter();
  const [intent, setIntent] = useState<CoachIntakeIntent | null>(null);
  const [mode, setMode] = useState<IntakeMode>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const [weeklyReq, setWeeklyReq] = useState<WeeklyPlanRequirements>(
    defaultWeeklyPlanRequirements(),
  );
  const [blockReq, setBlockReq] = useState<TrainingBlockRequirements>(
    defaultTrainingBlockRequirements(),
  );
  const [editReq, setEditReq] = useState<WeeklyPlanEditRequirements>(
    defaultWeeklyPlanEditRequirements(),
  );
  const [stepNotes, setStepNotes] = useState<Record<string, string>>({});
  const [activePlanForEdit, setActivePlanForEdit] = useState<CachedWeeklyPlan | null>(null);
  const [plansForEdit, setPlansForEdit] = useState<CachedWeeklyPlan[]>([]);
  const [isLoadingActivePlanForEdit, setIsLoadingActivePlanForEdit] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isGeneratingWeeklyPlan, setIsGeneratingWeeklyPlan] = useState(false);
  const [weeklyPlanProgress, setWeeklyPlanProgress] = useState<AiProgressEvent[]>(
    [],
  );
  const [weeklyPlanCurrentMessage, setWeeklyPlanCurrentMessage] = useState<string | null>(
    null,
  );
  const [weeklyPlanPhaseMap, setWeeklyPlanPhaseMap] = useState<
    Record<AiProgressPhase, 'pending' | 'in_progress' | 'done' | 'error'>
  >(createPhaseMap());
  const [weeklyPlanError, setWeeklyPlanError] = useState<
    ReturnType<typeof parseAiErrorFromUnknown> | null
  >(null);
  const [isGeneratingBlock, setIsGeneratingBlock] = useState(false);
  const [blockError, setBlockError] = useState<ReturnType<typeof parseAiErrorFromUnknown> | null>(
    null,
  );
  const [showIntakeDuringGeneration, setShowIntakeDuringGeneration] = useState(false);
  const [isSetupExpanded, setIsSetupExpanded] = useState(false);
  const [isActiveIntakeExpanded, setIsActiveIntakeExpanded] = useState(true);

  const isVisible = activePersonaId === 'coach';
  const stepIds = useMemo(() => {
    if (intent === 'weekly_plan') return WEEKLY_STEP_IDS;
    if (intent === 'weekly_plan_edit') return WEEKLY_EDIT_STEP_IDS;
    return BLOCK_STEP_IDS;
  }, [intent]);
  const activeStepId = stepIds[stepIndex] ?? null;
  const activeStepNote = activeStepId ? (stepNotes[activeStepId] ?? '') : '';
  const isSubmitting = isGeneratingWeeklyPlan || isGeneratingBlock;
  const hasActiveIntake = mode === 'collecting' || mode === 'review';
  const weekOptions = useMemo(() => buildWeekOptions(getCurrentMondayIso()), []);
  const selectedPlanForEdit = useMemo(
    () =>
      plansForEdit.find((plan) => plan.weekStart === editReq.targetWeekStart) ??
      activePlanForEdit,
    [plansForEdit, editReq.targetWeekStart, activePlanForEdit],
  );
  const isIntakeCollapsedWhileGenerating =
    isSubmitting && hasActiveIntake && !showIntakeDuringGeneration;

  const beginIntake = useCallback((nextIntent: CoachIntakeIntent) => {
    logIntakeEvent('intake_started', {intent: nextIntent});
    setIntent(nextIntent);
    setMode('collecting');
    setStepIndex(0);
    setStepNotes({});
    setSuccessMessage(null);
    setWeeklyPlanError(null);
    setBlockError(null);
    setShowIntakeDuringGeneration(false);
    setIsActiveIntakeExpanded(true);
    setWeeklyReq(defaultWeeklyPlanRequirements());
    setBlockReq(defaultTrainingBlockRequirements());
    setEditReq(defaultWeeklyPlanEditRequirements());
    setActivePlanForEdit(null);
    setPlansForEdit([]);
  }, []);

  useEffect(() => {
    if (!isVisible || !launchIntent) return;
    beginIntake(launchIntent);
    onLaunchHandled();
  }, [isVisible, launchIntent, beginIntake, onLaunchHandled]);

  useEffect(() => {
    if (!athleteId || intent !== 'weekly_plan_edit') {
      setIsLoadingActivePlanForEdit(false);
      setActivePlanForEdit(null);
      setPlansForEdit([]);
      return;
    }
    let cancelled = false;
    setIsLoadingActivePlanForEdit(true);
    void (async () => {
      const [plan, weeklyPlans] = await Promise.all([
        neonGetActiveWeeklyPlan(athleteId),
        neonGetWeeklyPlans(athleteId),
      ]);
      if (cancelled) return;
      setActivePlanForEdit(plan ?? null);
      setPlansForEdit(weeklyPlans ?? []);
      setIsLoadingActivePlanForEdit(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId, intent]);

  useEffect(() => {
    if (intent !== 'weekly_plan_edit') return;
    setEditReq((prev) => ({
      ...prev,
      targetWeekStart: prev.targetWeekStart || activePlanForEdit?.weekStart || getCurrentMondayIso(),
      editGoal: activePlanForEdit
        ? `Refine ${activePlanForEdit.title} while preserving core intent.`
        : prev.editGoal,
      constraints: activePlanForEdit
        ? `Keep the weekly structure for week starting ${activePlanForEdit.weekStart} unless explicitly changed.`
        : prev.constraints,
    }));
  }, [intent, activePlanForEdit]);

  useEffect(() => {
    if (intent !== 'weekly_plan') return;
    setWeeklyReq((prev) => ({
      ...prev,
      targetWeekStart:
        prev.targetWeekStart ||
        (prev.targetWeek === 'current' ? getCurrentMondayIso() : getNextMondayIso()),
    }));
  }, [intent]);

  const canGoNext = useMemo(() => {
    if (!intent) return false;
    if (intent === 'weekly_plan') {
      const step = WEEKLY_STEP_IDS[stepIndex];
      if (step === 'target_week') return weeklyReq.targetWeekStart.trim().length > 0;
      if (step === 'focus') return weeklyReq.focus.trim().length > 0;
      return true;
    }
    if (intent === 'weekly_plan_edit') {
      const step = WEEKLY_EDIT_STEP_IDS[stepIndex];
      if (step === 'target_week') return editReq.targetWeekStart.trim().length > 0;
      if (step === 'goal') return editReq.editGoal.trim().length > 0;
      if (step === 'constraints') return editReq.constraints.trim().length > 0;
      return true;
    }
    const step = BLOCK_STEP_IDS[stepIndex];
    if (step === 'goal_event') return blockReq.goalEvent.trim().length > 0;
    if (step === 'goal_date') return blockReq.goalDate.trim().length > 0;
    return true;
  }, [
    intent,
    stepIndex,
    weeklyReq.targetWeekStart,
    weeklyReq.focus,
    editReq.targetWeekStart,
    editReq.editGoal,
    editReq.constraints,
    blockReq.goalDate,
    blockReq.goalEvent,
  ]);

  const handleCancel = useCallback(() => {
    logIntakeEvent('intake_cancelled', {
      intent,
      mode,
      stepIndex,
    });
    setIntent(null);
    setMode('idle');
    setStepIndex(0);
    setStepNotes({});
    setWeeklyPlanError(null);
    setBlockError(null);
    setShowIntakeDuringGeneration(false);
    setActivePlanForEdit(null);
    setIsActiveIntakeExpanded(true);
  }, [intent, mode, stepIndex]);

  useEffect(() => {
    if (!isSubmitting) {
      setShowIntakeDuringGeneration(false);
    }
  }, [isSubmitting]);

  const handleSaveDraft = useCallback(() => {
    logIntakeEvent('intake_draft_saved', {intent, stepId: activeStepId});
    setLastSavedAt(Date.now());
  }, [activeStepId, intent]);

  const handleBack = useCallback(() => {
    logIntakeEvent('intake_step_back', {intent, fromStep: stepIndex});
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, [intent, stepIndex]);

  const handleNext = useCallback(() => {
    const isLastStep = stepIndex >= stepIds.length - 1;
    if (isLastStep) {
      logIntakeEvent('intake_review_opened', {intent});
      setMode('review');
      return;
    }
    logIntakeEvent('intake_step_next', {intent, fromStep: stepIndex});
    setStepIndex((prev) => Math.min(stepIds.length - 1, prev + 1));
  }, [intent, stepIds.length, stepIndex]);

  const updateStepNote = useCallback(
    (value: string) => {
      if (!activeStepId) return;
      setStepNotes((prev) => ({...prev, [activeStepId]: value}));
    },
    [activeStepId],
  );

  const toggleUnavailableDay = useCallback((day: string, current: string[]) => {
    if (current.includes(day)) {
      return current.filter((value) => value !== day);
    }
    return [...current, day];
  }, []);

  const renderWeeklyStep = () => {
    const step = WEEKLY_STEP_IDS[stepIndex];

    if (step === 'target_week') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Weekly plan intake'
          question='Which specific week should this plan target?'
          stepIndex={stepIndex}
          totalSteps={WEEKLY_STEP_IDS.length}
          options={weekOptions}
          selectedOptionIds={[weeklyReq.targetWeekStart]}
          onSelectOption={(id) =>
            setWeeklyReq((prev) => ({
              ...prev,
              targetWeekStart: id,
              targetWeek: id === getCurrentMondayIso() ? 'current' : 'next',
            }))
          }
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === WEEKLY_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        />
      );
    }

    if (step === 'run_days') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Weekly plan intake'
          question='How many run days should this week have?'
          stepIndex={stepIndex}
          totalSteps={WEEKLY_STEP_IDS.length}
          options={[3, 4, 5, 6, 7].map((value) => ({
            id: String(value),
            label: `${value} days`,
          }))}
          selectedOptionIds={[String(weeklyReq.runDaysPerWeek)]}
          onSelectOption={(id) =>
            setWeeklyReq((prev) => ({...prev, runDaysPerWeek: Number(id)}))
          }
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === WEEKLY_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        />
      );
    }

    if (step === 'availability') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Weekly plan intake'
          question='Any days you cannot run?'
          stepIndex={stepIndex}
          totalSteps={WEEKLY_STEP_IDS.length}
          options={WEEKDAY_OPTIONS.map((day) => ({id: day, label: day.slice(0, 3)}))}
          selectedOptionIds={weeklyReq.unavailableDays}
          allowMultiple
          onSelectOption={(id) =>
            setWeeklyReq((prev) => ({
              ...prev,
              unavailableDays: toggleUnavailableDay(id, prev.unavailableDays),
            }))
          }
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === WEEKLY_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        />
      );
    }

    if (step === 'long_run') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Weekly plan intake'
          question='Preferred long run day?'
          stepIndex={stepIndex}
          totalSteps={WEEKLY_STEP_IDS.length}
          options={WEEKDAY_OPTIONS.map((day) => ({id: day, label: day.slice(0, 3)}))}
          selectedOptionIds={[weeklyReq.preferredLongRunDay]}
          onSelectOption={(id) =>
            setWeeklyReq((prev) => ({...prev, preferredLongRunDay: id}))
          }
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === WEEKLY_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        />
      );
    }

    if (step === 'intensity') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Weekly plan intake'
          question='What effort profile do you want this week?'
          stepIndex={stepIndex}
          totalSteps={WEEKLY_STEP_IDS.length}
          options={[
            {id: 'conservative', label: 'Conservative'},
            {id: 'balanced', label: 'Balanced'},
            {id: 'aggressive', label: 'Aggressive'},
          ]}
          selectedOptionIds={[weeklyReq.intensity]}
          onSelectOption={(id) =>
            setWeeklyReq((prev) => ({
              ...prev,
              intensity: id as WeeklyPlanRequirements['intensity'],
            }))
          }
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === WEEKLY_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        />
      );
    }

    if (step === 'focus') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Weekly plan intake'
          question='What should the week optimize for?'
          stepIndex={stepIndex}
          totalSteps={WEEKLY_STEP_IDS.length}
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          freeTextPlaceholder='Any nuance for this goal?'
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === WEEKLY_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        >
          <input
            value={weeklyReq.focus}
            onChange={(event) =>
              setWeeklyReq((prev) => ({...prev, focus: event.target.value}))
            }
            placeholder='Example: build threshold while keeping fatigue low'
            aria-label='Weekly plan focus'
            className='w-full border-2 border-border bg-background px-2 py-1 text-xs font-medium'
          />
        </ProgressiveIntakeCard>
      );
    }

    return (
      <ProgressiveIntakeCard
        title='Coach guided setup'
        subtitle='Weekly plan intake'
        question='Strategy and optimization priority?'
        stepIndex={stepIndex}
        totalSteps={WEEKLY_STEP_IDS.length}
        options={[
          {id: 'auto', label: AUTO_STRATEGY_LABEL},
          ...Object.entries(STRATEGY_PRESET_LABELS).map(([id, label]) => ({
            id,
            label,
          })),
        ]}
        selectedOptionIds={[
          weeklyReq.strategySelectionMode === 'auto'
            ? 'auto'
            : (weeklyReq.strategyPreset ?? 'auto'),
        ]}
        onSelectOption={(id) => {
          if (id === 'auto') {
            setWeeklyReq((prev) => ({
              ...prev,
              strategySelectionMode: 'auto',
              strategyPreset: undefined,
            }));
            return;
          }
          setWeeklyReq((prev) => ({
            ...prev,
            strategySelectionMode: 'preset',
            strategyPreset: id as TrainingStrategyPreset,
          }));
        }}
        freeText={activeStepNote}
        onChangeFreeText={updateStepNote}
        footer={
          <IntakeStepControls
            canGoBack={stepIndex > 0}
            canGoNext={canGoNext}
            isLastStep={stepIndex === WEEKLY_STEP_IDS.length - 1}
            isSubmitting={isSubmitting}
            onBack={handleBack}
            onNext={handleNext}
            onSaveDraft={handleSaveDraft}
            onCancel={handleCancel}
          />
        }
      >
        <div className='space-y-1'>
          <p className='text-[10px] font-black uppercase tracking-wider text-muted-foreground'>
            Optimization priority
          </p>
          <div className='flex flex-wrap gap-1.5'>
            {Object.entries(OPTIMIZATION_PRIORITY_LABELS).map(([id, label]) => (
              <button
                key={id}
                onClick={() =>
                  setWeeklyReq((prev) => ({
                    ...prev,
                    optimizationPriority: id as OptimizationPriority,
                  }))
                }
                tabIndex={0}
                aria-label={`Set optimization priority to ${label}`}
                className={`px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 ${
                  weeklyReq.optimizationPriority === id
                    ? 'bg-secondary text-secondary-foreground border-secondary'
                    : 'bg-background border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className='pt-1'>
            <p className='text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1'>
              Generation mode
            </p>
            <div className='flex flex-wrap gap-1.5'>
              {[
                {id: 'full', label: 'Full week'},
                {id: 'remaining_days', label: 'Remaining days only'},
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() =>
                    setWeeklyReq((prev) => ({
                      ...prev,
                      generationMode: option.id as WeeklyPlanRequirements['generationMode'],
                    }))
                  }
                  tabIndex={0}
                  aria-label={option.label}
                  className={`px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 ${
                    weeklyReq.generationMode === option.id
                      ? 'bg-accent text-accent-foreground border-border'
                      : 'bg-background border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </ProgressiveIntakeCard>
    );
  };

  const renderBlockStep = () => {
    const step = BLOCK_STEP_IDS[stepIndex];

    if (step === 'goal_event') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Training block intake'
          question='What is your goal event?'
          stepIndex={stepIndex}
          totalSteps={BLOCK_STEP_IDS.length}
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === BLOCK_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        >
          <input
            value={blockReq.goalEvent}
            onChange={(event) =>
              setBlockReq((prev) => ({...prev, goalEvent: event.target.value}))
            }
            placeholder='Example: Marathon 3:05'
            aria-label='Goal event'
            className='w-full border-2 border-border bg-background px-2 py-1 text-xs font-medium'
          />
        </ProgressiveIntakeCard>
      );
    }

    if (step === 'goal_date') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Training block intake'
          question='When is the event date?'
          stepIndex={stepIndex}
          totalSteps={BLOCK_STEP_IDS.length}
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === BLOCK_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        >
          <input
            type='date'
            value={blockReq.goalDate}
            onChange={(event) =>
              setBlockReq((prev) => ({...prev, goalDate: event.target.value}))
            }
            aria-label='Goal date'
            className='w-full border-2 border-border bg-background px-2 py-1 text-xs font-medium'
          />
        </ProgressiveIntakeCard>
      );
    }

    if (step === 'baseline') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Training block intake'
          question='What weekly volume baseline should we assume?'
          stepIndex={stepIndex}
          totalSteps={BLOCK_STEP_IDS.length}
          options={[8, 10, 12, 14, 16].map((weeks) => ({
            id: String(weeks),
            label: `${weeks}w block`,
          }))}
          selectedOptionIds={[
            blockReq.totalWeeks ? String(blockReq.totalWeeks) : '',
          ].filter(Boolean)}
          onSelectOption={(id) =>
            setBlockReq((prev) => ({...prev, totalWeeks: Number(id)}))
          }
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === BLOCK_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        >
          <input
            value={blockReq.weeklyKmBackground}
            onChange={(event) =>
              setBlockReq((prev) => ({
                ...prev,
                weeklyKmBackground: event.target.value,
              }))
            }
            placeholder='Example: averaging 45-50km/week recently'
            aria-label='Weekly baseline mileage'
            className='w-full border-2 border-border bg-background px-2 py-1 text-xs font-medium'
          />
        </ProgressiveIntakeCard>
      );
    }

    if (step === 'availability') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Training block intake'
          question='How many running days and unavailable days?'
          stepIndex={stepIndex}
          totalSteps={BLOCK_STEP_IDS.length}
          options={[3, 4, 5, 6, 7].map((value) => ({
            id: `run-${value}`,
            label: `${value} runs/week`,
          }))}
          selectedOptionIds={[`run-${blockReq.runDaysPerWeek}`]}
          onSelectOption={(id) =>
            setBlockReq((prev) => ({
              ...prev,
              runDaysPerWeek: Number(id.replace('run-', '')),
            }))
          }
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === BLOCK_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        >
          <div className='space-y-1'>
            <p className='text-[10px] font-black uppercase tracking-wider text-muted-foreground'>
              Unavailable days
            </p>
            <div className='flex flex-wrap gap-1.5'>
              {WEEKDAY_OPTIONS.map((day) => {
                const selected = blockReq.unavailableDays.includes(day);
                return (
                  <button
                    key={day}
                    onClick={() =>
                      setBlockReq((prev) => ({
                        ...prev,
                        unavailableDays: toggleUnavailableDay(
                          day,
                          prev.unavailableDays,
                        ),
                      }))
                    }
                    tabIndex={0}
                    aria-label={`Toggle unavailable ${day}`}
                    className={`px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 ${
                      selected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
        </ProgressiveIntakeCard>
      );
    }

    if (step === 'strategy') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Training block intake'
          question='Choose strategy and optimization priority.'
          stepIndex={stepIndex}
          totalSteps={BLOCK_STEP_IDS.length}
          options={[
            {id: 'auto', label: AUTO_STRATEGY_LABEL},
            ...Object.entries(STRATEGY_PRESET_LABELS).map(([id, label]) => ({
              id,
              label,
            })),
          ]}
          selectedOptionIds={[
            blockReq.strategySelectionMode === 'auto'
              ? 'auto'
              : (blockReq.strategyPreset ?? 'auto'),
          ]}
          onSelectOption={(id) => {
            if (id === 'auto') {
              setBlockReq((prev) => ({
                ...prev,
                strategySelectionMode: 'auto',
                strategyPreset: undefined,
              }));
              return;
            }
            setBlockReq((prev) => ({
              ...prev,
              strategySelectionMode: 'preset',
              strategyPreset: id as TrainingStrategyPreset,
            }));
          }}
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === BLOCK_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        >
          <div className='flex flex-wrap gap-1.5'>
            {Object.entries(OPTIMIZATION_PRIORITY_LABELS).map(([id, label]) => (
              <button
                key={id}
                onClick={() =>
                  setBlockReq((prev) => ({
                    ...prev,
                    optimizationPriority: id as OptimizationPriority,
                  }))
                }
                tabIndex={0}
                aria-label={`Set optimization priority to ${label}`}
                className={`px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 ${
                  blockReq.optimizationPriority === id
                    ? 'bg-secondary text-secondary-foreground border-secondary'
                    : 'bg-background border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </ProgressiveIntakeCard>
      );
    }

    return (
      <ProgressiveIntakeCard
        title='Coach guided setup'
        subtitle='Training block intake'
        question='Any additional requirements for this block?'
        stepIndex={stepIndex}
        totalSteps={BLOCK_STEP_IDS.length}
        freeText={activeStepNote}
        onChangeFreeText={updateStepNote}
        footer={
          <IntakeStepControls
            canGoBack={stepIndex > 0}
            canGoNext={canGoNext}
            isLastStep={stepIndex === BLOCK_STEP_IDS.length - 1}
            isSubmitting={isSubmitting}
            onBack={handleBack}
            onNext={handleNext}
            onSaveDraft={handleSaveDraft}
            onCancel={handleCancel}
          />
        }
      >
        <textarea
          value={blockReq.notes}
          onChange={(event) =>
            setBlockReq((prev) => ({...prev, notes: event.target.value}))
          }
          rows={3}
          placeholder='Travel weeks, race simulations, life constraints, etc.'
          aria-label='Additional block requirements'
          className='w-full border-2 border-border bg-background px-2 py-1 text-xs font-medium resize-none'
        />
      </ProgressiveIntakeCard>
    );
  };

  const renderEditStep = () => {
    const step = WEEKLY_EDIT_STEP_IDS[stepIndex];

    if (step === 'target_week') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Weekly plan edit'
          question='Which specific week should we edit?'
          stepIndex={stepIndex}
          totalSteps={WEEKLY_EDIT_STEP_IDS.length}
          options={weekOptions}
          selectedOptionIds={[editReq.targetWeekStart]}
          onSelectOption={(id) =>
            setEditReq((prev) => ({
              ...prev,
              targetWeekStart: id,
            }))
          }
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === WEEKLY_EDIT_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        />
      );
    }

    if (step === 'mode') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Weekly plan edit'
          question='How broad should this edit be?'
          stepIndex={stepIndex}
          totalSteps={WEEKLY_EDIT_STEP_IDS.length}
          options={[
            {id: 'remaining_days', label: 'Remaining days only'},
            {id: 'full', label: 'Full week'},
          ]}
          selectedOptionIds={[editReq.generationMode]}
          onSelectOption={(id) =>
            setEditReq((prev) => ({
              ...prev,
              generationMode: id as WeeklyPlanEditRequirements['generationMode'],
            }))
          }
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === WEEKLY_EDIT_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        />
      );
    }

    if (step === 'focus') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Weekly plan edit'
          question='How much should we change from the selected week plan?'
          stepIndex={stepIndex}
          totalSteps={WEEKLY_EDIT_STEP_IDS.length}
          options={[
            {id: 'small_adjustments', label: 'Small adjustments'},
            {id: 'moderate_adjustments', label: 'Moderate adjustments'},
            {id: 'major_rework', label: 'Major rework'},
          ]}
          selectedOptionIds={[editReq.editFocus]}
          onSelectOption={(id) =>
            setEditReq((prev) => ({
              ...prev,
              editFocus: id as WeeklyPlanEditRequirements['editFocus'],
            }))
          }
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === WEEKLY_EDIT_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        />
      );
    }

    if (step === 'goal') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Weekly plan edit'
          question='What should this edit optimize for?'
          stepIndex={stepIndex}
          totalSteps={WEEKLY_EDIT_STEP_IDS.length}
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === WEEKLY_EDIT_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        >
          <input
            value={editReq.editGoal}
            onChange={(event) =>
              setEditReq((prev) => ({...prev, editGoal: event.target.value}))
            }
            placeholder='Example: reduce fatigue while keeping one quality run'
            aria-label='Weekly plan edit goal'
            className='w-full border-2 border-border bg-background px-2 py-1 text-xs font-medium'
          />
        </ProgressiveIntakeCard>
      );
    }

    if (step === 'constraints') {
      return (
        <ProgressiveIntakeCard
          title='Coach guided setup'
          subtitle='Weekly plan edit'
          question='What constraints must remain true?'
          stepIndex={stepIndex}
          totalSteps={WEEKLY_EDIT_STEP_IDS.length}
          freeText={activeStepNote}
          onChangeFreeText={updateStepNote}
          footer={
            <IntakeStepControls
              canGoBack={stepIndex > 0}
              canGoNext={canGoNext}
              isLastStep={stepIndex === WEEKLY_EDIT_STEP_IDS.length - 1}
              isSubmitting={isSubmitting}
              onBack={handleBack}
              onNext={handleNext}
              onSaveDraft={handleSaveDraft}
              onCancel={handleCancel}
            />
          }
        >
          <textarea
            value={editReq.constraints}
            onChange={(event) =>
              setEditReq((prev) => ({...prev, constraints: event.target.value}))
            }
            rows={3}
            placeholder='Keep long run on Saturday, no hard sessions on back-to-back days, etc.'
            aria-label='Weekly plan edit constraints'
            className='w-full border-2 border-border bg-background px-2 py-1 text-xs font-medium resize-none'
          />
        </ProgressiveIntakeCard>
      );
    }

    return (
      <ProgressiveIntakeCard
        title='Coach guided setup'
        subtitle='Weekly plan edit'
        question='Any day-specific edits?'
        stepIndex={stepIndex}
        totalSteps={WEEKLY_EDIT_STEP_IDS.length}
        freeText={activeStepNote}
        onChangeFreeText={updateStepNote}
        footer={
          <IntakeStepControls
            canGoBack={stepIndex > 0}
            canGoNext={canGoNext}
            isLastStep={stepIndex === WEEKLY_EDIT_STEP_IDS.length - 1}
            isSubmitting={isSubmitting}
            onBack={handleBack}
            onNext={handleNext}
            onSaveDraft={handleSaveDraft}
            onCancel={handleCancel}
          />
        }
      >
        <textarea
          value={editReq.daySpecificNotes}
          onChange={(event) =>
            setEditReq((prev) => ({...prev, daySpecificNotes: event.target.value}))
          }
          rows={3}
          placeholder='Example: Tuesday becomes easy only, move tempo to Friday'
          aria-label='Day-specific weekly plan edits'
          className='w-full border-2 border-border bg-background px-2 py-1 text-xs font-medium resize-none'
        />
      </ProgressiveIntakeCard>
    );
  };

  const reviewItems = useMemo(() => {
    if (!intent) return [];
    if (intent === 'weekly_plan') {
      const notes = Object.values(stepNotes)
        .map((value) => value.trim())
        .filter(Boolean)
        .join(' | ');
      return [
        {
          label: 'Week target',
          value: weeklyReq.targetWeekStart || weeklyReq.targetWeek,
        },
        {label: 'Run days', value: `${weeklyReq.runDaysPerWeek}/week`},
        {
          label: 'Unavailable',
          value:
            weeklyReq.unavailableDays.length > 0
              ? weeklyReq.unavailableDays.join(', ')
              : 'None',
        },
        {label: 'Long run day', value: weeklyReq.preferredLongRunDay},
        {label: 'Intensity', value: weeklyReq.intensity},
        {label: 'Focus', value: weeklyReq.focus},
        {
          label: 'Strategy',
          value:
            weeklyReq.strategySelectionMode === 'auto'
              ? AUTO_STRATEGY_LABEL
              : STRATEGY_PRESET_LABELS[
                  weeklyReq.strategyPreset as TrainingStrategyPreset
                ],
        },
        {
          label: 'Priority',
          value: OPTIMIZATION_PRIORITY_LABELS[weeklyReq.optimizationPriority],
        },
        {label: 'Notes', value: notes || weeklyReq.notes || 'None'},
      ];
    }
    if (intent === 'weekly_plan_edit') {
      const notes = Object.values(stepNotes)
        .map((value) => value.trim())
        .filter(Boolean)
        .join(' | ');
      return [
        {
          label: 'Editing plan',
          value: selectedPlanForEdit
            ? `${selectedPlanForEdit.title} (${selectedPlanForEdit.weekStart})`
            : `No existing plan found for ${editReq.targetWeekStart}`,
        },
        {label: 'Target week', value: editReq.targetWeekStart || 'Not selected'},
        {label: 'Generation mode', value: editReq.generationMode},
        {label: 'Edit focus', value: editReq.editFocus},
        {label: 'Goal', value: editReq.editGoal},
        {label: 'Constraints', value: editReq.constraints},
        {
          label: 'Day-specific notes',
          value: editReq.daySpecificNotes.trim() || 'None',
        },
        {label: 'Notes', value: notes || 'None'},
      ];
    }
    const notes = Object.values(stepNotes)
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' | ');
    return [
      {label: 'Goal event', value: blockReq.goalEvent},
      {label: 'Goal date', value: blockReq.goalDate},
      {label: 'Block length', value: blockReq.totalWeeks ? `${blockReq.totalWeeks} weeks` : 'Auto'},
      {label: 'Run days', value: `${blockReq.runDaysPerWeek}/week`},
      {
        label: 'Unavailable',
        value:
          blockReq.unavailableDays.length > 0
            ? blockReq.unavailableDays.join(', ')
            : 'None',
      },
      {
        label: 'Strategy',
        value:
          blockReq.strategySelectionMode === 'auto'
            ? AUTO_STRATEGY_LABEL
            : STRATEGY_PRESET_LABELS[blockReq.strategyPreset as TrainingStrategyPreset],
      },
      {
        label: 'Priority',
        value: OPTIMIZATION_PRIORITY_LABELS[blockReq.optimizationPriority],
      },
      {
        label: 'Baseline + notes',
        value: [blockReq.weeklyKmBackground, blockReq.notes, notes]
          .map((value) => value.trim())
          .filter(Boolean)
          .join(' | ') || 'None',
      },
    ];
  }, [intent, weeklyReq, editReq, blockReq, stepNotes, selectedPlanForEdit]);

  const handleGenerateWeeklyPlan = useCallback(async () => {
    if (!athleteId || isGeneratingWeeklyPlan) return;
    logIntakeEvent('weekly_plan_generation_started', {
      intent: 'weekly_plan',
      targetWeek: weeklyReq.targetWeekStart,
      generationMode: weeklyReq.generationMode,
    });
    setIsGeneratingWeeklyPlan(true);
    setWeeklyPlanProgress([]);
    setWeeklyPlanCurrentMessage('Starting weekly plan generation...');
    setWeeklyPlanPhaseMap(createPhaseMap());
    setWeeklyPlanError(null);

    const notes = Object.values(stepNotes)
      .map((value) => value.trim())
      .filter(Boolean)
      .join('\n');
    const preferences = `${summarizeWeeklyPlanRequirements(weeklyReq)}${
      notes ? `\nAdditional notes:\n${notes}` : ''
    }`;
    const payload = {
      athleteId,
      idempotencyKey: buildIdempotencyKey('weekly_plan', athleteId),
      model: selectedModel,
      weekStartDate: weeklyReq.targetWeekStart || getCurrentMondayIso(),
      mode: weeklyReq.generationMode,
      preferences,
      strategySelectionMode: weeklyReq.strategySelectionMode,
      strategyPreset: weeklyReq.strategyPreset,
      optimizationPriority: weeklyReq.optimizationPriority,
    };

    try {
      const response = await fetch('/api/ai/weekly-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': payload.idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        setWeeklyPlanError(parseAiErrorFromUnknown(body, 'Failed to generate weekly plan'));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setWeeklyPlanError(
          parseAiErrorFromUnknown(
            null,
            'Missing response stream while generating weekly plan',
          ),
        );
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let latestPhase: AiProgressPhase | null = null;
      let streamErrored = false;
      let completed = false;

      const markPhaseInProgress = (phase: AiProgressPhase) => {
        if (!WEEKLY_PHASE_ORDER.includes(phase)) return;
        setWeeklyPlanPhaseMap((prev) => {
          const next = {...prev};
          if (latestPhase && latestPhase !== phase && next[latestPhase] === 'in_progress') {
            next[latestPhase] = 'done';
          }
          next[phase] = 'in_progress';
          return next;
        });
        latestPhase = phase;
      };

      const markTerminal = (state: 'done' | 'error') => {
        setWeeklyPlanPhaseMap((prev) => {
          const next = {...prev};
          if (latestPhase && next[latestPhase] === 'in_progress') {
            next[latestPhase] = state;
          }
          next[state] = state;
          return next;
        });
      };

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const parsed = parseSseChunks<AiProgressEvent>(buffer, '');
        buffer = parsed.remainder;

        for (const event of parsed.events) {
          setWeeklyPlanProgress((prev) => [...prev, event]);
          setWeeklyPlanCurrentMessage(event.message);
          if (event.type === 'progress') {
            markPhaseInProgress(event.phase);
            continue;
          }
          if (event.type === 'error') {
            markTerminal('error');
            setWeeklyPlanError(
              parseAiErrorFromUnknown(
                {code: (event.meta as {code?: string} | undefined)?.code, error: event.message},
                event.message,
              ),
            );
            streamErrored = true;
            break;
          }
          if (event.type === 'done') {
            markTerminal('done');
            completed = true;
            break;
          }
        }

        if (streamErrored || completed) break;
      }

      if (!streamErrored && !completed && buffer.trim().length > 0) {
        const parsed = parseSseChunks<AiProgressEvent>(buffer, '\n\n');
        for (const event of parsed.events) {
          setWeeklyPlanProgress((prev) => [...prev, event]);
          setWeeklyPlanCurrentMessage(event.message);
          if (event.type === 'progress') {
            markPhaseInProgress(event.phase);
            continue;
          }
          if (event.type === 'error') {
            markTerminal('error');
            setWeeklyPlanError(
              parseAiErrorFromUnknown(
                {code: (event.meta as {code?: string} | undefined)?.code, error: event.message},
                event.message,
              ),
            );
            streamErrored = true;
            break;
          }
          if (event.type === 'done') {
            markTerminal('done');
            completed = true;
            break;
          }
        }
      }

      if (completed) {
        logIntakeEvent('weekly_plan_generation_succeeded', {
          intent: 'weekly_plan',
        });
        setSuccessMessage('Weekly plan created. Open Weekly Plan to review details.');
        setMode('idle');
        setIntent(null);
        await onWeeklyPlanCreated?.();
        router.push('/training-plan');
      }
    } catch (error) {
      logIntakeEvent('weekly_plan_generation_failed', {
        intent: 'weekly_plan',
        reason: error instanceof Error ? error.message : 'unknown',
      });
      setWeeklyPlanError(
        parseAiErrorFromUnknown(error, 'Failed to generate weekly plan'),
      );
    } finally {
      setIsGeneratingWeeklyPlan(false);
    }
  }, [
    athleteId,
    isGeneratingWeeklyPlan,
    onWeeklyPlanCreated,
    selectedModel,
    stepNotes,
    weeklyReq,
    router,
  ]);

  const handleEditWeeklyPlan = useCallback(async () => {
    if (!athleteId || isGeneratingWeeklyPlan) return;
    if (!selectedPlanForEdit) {
      setWeeklyPlanError(
        parseAiErrorFromUnknown(
          {
            code: 'source_plan_not_found_for_edit',
            error: 'No source plan found for selected week.',
          },
          'No source weekly plan found for selected week.',
        ),
      );
      return;
    }
    logIntakeEvent('weekly_plan_edit_started', {
      intent: 'weekly_plan_edit',
      planId: selectedPlanForEdit.id,
      generationMode: editReq.generationMode,
      targetWeek: editReq.targetWeekStart,
    });
    setIsGeneratingWeeklyPlan(true);
    setWeeklyPlanProgress([]);
    setWeeklyPlanCurrentMessage('Starting weekly plan edit...');
    setWeeklyPlanPhaseMap(createPhaseMap());
    setWeeklyPlanError(null);

    const notes = Object.values(stepNotes)
      .map((value) => value.trim())
      .filter(Boolean)
      .join('\n');
    const editInstructions = `${summarizeWeeklyPlanEditRequirements(editReq)}${
      notes ? `\nAdditional notes:\n${notes}` : ''
    }`;
    const payload = {
      athleteId,
      idempotencyKey: buildIdempotencyKey('weekly_plan_edit', athleteId),
      model: selectedModel,
      weekStartDate: editReq.targetWeekStart || selectedPlanForEdit.weekStart,
      mode: editReq.generationMode,
      sourcePlanId: selectedPlanForEdit.id,
      editSourcePlanId: selectedPlanForEdit.id,
      editInstructions,
      strategySelectionMode: editReq.strategySelectionMode,
      strategyPreset: editReq.strategyPreset,
      optimizationPriority: editReq.optimizationPriority,
    };

    try {
      const response = await fetch('/api/ai/weekly-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': payload.idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        setWeeklyPlanError(parseAiErrorFromUnknown(body, 'Failed to edit weekly plan'));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setWeeklyPlanError(
          parseAiErrorFromUnknown(
            null,
            'Missing response stream while editing weekly plan',
          ),
        );
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let latestPhase: AiProgressPhase | null = null;
      let streamErrored = false;
      let completed = false;

      const markPhaseInProgress = (phase: AiProgressPhase) => {
        if (!WEEKLY_PHASE_ORDER.includes(phase)) return;
        setWeeklyPlanPhaseMap((prev) => {
          const next = {...prev};
          if (
            latestPhase &&
            latestPhase !== phase &&
            next[latestPhase] === 'in_progress'
          ) {
            next[latestPhase] = 'done';
          }
          next[phase] = 'in_progress';
          return next;
        });
        latestPhase = phase;
      };

      const markTerminal = (state: 'done' | 'error') => {
        setWeeklyPlanPhaseMap((prev) => {
          const next = {...prev};
          if (latestPhase && next[latestPhase] === 'in_progress') {
            next[latestPhase] = state;
          }
          next[state] = state;
          return next;
        });
      };

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const parsed = parseSseChunks<AiProgressEvent>(buffer, '');
        buffer = parsed.remainder;

        for (const event of parsed.events) {
          setWeeklyPlanProgress((prev) => [...prev, event]);
          setWeeklyPlanCurrentMessage(event.message);
          if (event.type === 'progress') {
            markPhaseInProgress(event.phase);
            continue;
          }
          if (event.type === 'error') {
            markTerminal('error');
            setWeeklyPlanError(
              parseAiErrorFromUnknown(
                {
                  code: (event.meta as {code?: string} | undefined)?.code,
                  error: event.message,
                },
                event.message,
              ),
            );
            streamErrored = true;
            break;
          }
          if (event.type === 'done') {
            markTerminal('done');
            completed = true;
            break;
          }
        }

        if (streamErrored || completed) break;
      }

      if (!streamErrored && !completed && buffer.trim().length > 0) {
        const parsed = parseSseChunks<AiProgressEvent>(buffer, '\n\n');
        for (const event of parsed.events) {
          setWeeklyPlanProgress((prev) => [...prev, event]);
          setWeeklyPlanCurrentMessage(event.message);
          if (event.type === 'progress') {
            markPhaseInProgress(event.phase);
            continue;
          }
          if (event.type === 'error') {
            markTerminal('error');
            setWeeklyPlanError(
              parseAiErrorFromUnknown(
                {
                  code: (event.meta as {code?: string} | undefined)?.code,
                  error: event.message,
                },
                event.message,
              ),
            );
            streamErrored = true;
            break;
          }
          if (event.type === 'done') {
            markTerminal('done');
            completed = true;
            break;
          }
        }
      }

      if (completed) {
        logIntakeEvent('weekly_plan_edit_succeeded', {
          intent: 'weekly_plan_edit',
        });
        setSuccessMessage('Weekly plan updated. A new version is now active.');
        setMode('idle');
        setIntent(null);
        await onWeeklyPlanCreated?.();
        router.push('/training-plan');
      }
    } catch (error) {
      logIntakeEvent('weekly_plan_edit_failed', {
        intent: 'weekly_plan_edit',
        reason: error instanceof Error ? error.message : 'unknown',
      });
      setWeeklyPlanError(
        parseAiErrorFromUnknown(error, 'Failed to edit weekly plan'),
      );
    } finally {
      setIsGeneratingWeeklyPlan(false);
    }
  }, [
    athleteId,
    isGeneratingWeeklyPlan,
    selectedPlanForEdit,
    editReq,
    selectedModel,
    stepNotes,
    onWeeklyPlanCreated,
    router,
  ]);

  const handleGenerateTrainingBlock = useCallback(async () => {
    if (!athleteId || isGeneratingBlock) return;
    logIntakeEvent('training_block_generation_started', {
      intent: 'training_block',
      goalEvent: blockReq.goalEvent,
      goalDate: blockReq.goalDate,
    });
    setIsGeneratingBlock(true);
    setBlockError(null);

    const notes = Object.values(stepNotes)
      .map((value) => value.trim())
      .filter(Boolean)
      .join('\n');
    const responseNotes = `${summarizeTrainingBlockRequirements(blockReq)}${
      notes ? `\nAdditional notes:\n${notes}` : ''
    }`;

    const idempotencyKey = buildIdempotencyKey('training_block', athleteId);
    try {
      const response = await fetch('/api/ai/training-block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          athleteId,
          idempotencyKey,
          model: selectedModel,
          goalEvent: blockReq.goalEvent,
          goalDate: blockReq.goalDate,
          totalWeeks: blockReq.totalWeeks,
          strategySelectionMode: blockReq.strategySelectionMode,
          strategyPreset: blockReq.strategyPreset,
          optimizationPriority: blockReq.optimizationPriority,
          requirements: responseNotes,
        }),
      });

      if (!response.ok) {
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        setBlockError(parseAiErrorFromUnknown(body, 'Failed to generate training block'));
        return;
      }

      setSuccessMessage('Training block created. Open Training Block to inspect phases.');
      setMode('idle');
      setIntent(null);
      logIntakeEvent('training_block_generation_succeeded', {
        intent: 'training_block',
      });
      await onTrainingBlockCreated?.();
      router.push('/training-plan?tab=block');
    } catch (error) {
      logIntakeEvent('training_block_generation_failed', {
        intent: 'training_block',
        reason: error instanceof Error ? error.message : 'unknown',
      });
      setBlockError(parseAiErrorFromUnknown(error, 'Failed to generate training block'));
    } finally {
      setIsGeneratingBlock(false);
    }
  }, [
    athleteId,
    blockReq,
    isGeneratingBlock,
    onTrainingBlockCreated,
    selectedModel,
    stepNotes,
    router,
  ]);

  const handleGenerate = useCallback(async () => {
    if (intent === 'weekly_plan') {
      await handleGenerateWeeklyPlan();
      return;
    }
    if (intent === 'weekly_plan_edit') {
      await handleEditWeeklyPlan();
      return;
    }
    if (intent === 'training_block') {
      await handleGenerateTrainingBlock();
    }
  }, [
    intent,
    handleEditWeeklyPlan,
    handleGenerateTrainingBlock,
    handleGenerateWeeklyPlan,
  ]);

  const intakeLabel =
    intent === 'weekly_plan'
      ? 'Weekly plan'
      : intent === 'weekly_plan_edit'
        ? 'Weekly plan edit'
        : 'Training block';
  const intakeContentClassName = isSubmitting
    ? 'max-h-[40vh] overflow-y-auto overscroll-y-contain pr-1 border-l-2 border-border/70 pl-2 pb-[calc(6rem+env(safe-area-inset-bottom))] md:max-h-[48vh] md:pb-2'
    : 'max-h-[52dvh] overflow-y-auto overscroll-y-contain pr-1 border-l-2 border-border/70 pl-2 pb-[calc(6rem+env(safe-area-inset-bottom))] md:max-h-none md:overflow-visible md:overscroll-auto md:pb-0';

  if (!isVisible) return null;

  return (
    <div className='px-1.5 md:px-2.5 pb-1.5 space-y-1.5'>
      {successMessage && (
        <div
          role='status'
          className='border-2 border-secondary/40 bg-secondary/10 px-2 py-1.5 flex items-center justify-between gap-2'
        >
          <div className='flex items-start gap-1.5 min-w-0'>
            <CheckCircle2 className='h-3.5 w-3.5 text-secondary shrink-0 mt-0.5' />
            <div className='min-w-0'>
              <p className='text-[10px] font-black uppercase tracking-widest text-secondary'>
                Completed
              </p>
              <p className='text-[11px] font-bold text-secondary truncate'>{successMessage}</p>
            </div>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            tabIndex={0}
            aria-label='Dismiss completion message'
            className='px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-background shrink-0'
          >
            Dismiss
          </button>
        </div>
      )}

      {mode === 'idle' && (
        <div className='border-2 border-border bg-primary/5 px-2 py-1.5 space-y-1.5'>
          <div className='flex flex-wrap items-center gap-1.5'>
            <div className='flex items-center gap-1.5 min-w-0'>
              <Sparkles className='h-3.5 w-3.5 text-primary shrink-0' />
              <p className='text-[10px] font-black uppercase tracking-widest text-primary truncate'>
                Coach guided setup
              </p>
            </div>
            <button
              onClick={() => beginIntake('weekly_plan')}
              tabIndex={0}
              aria-label='Start weekly plan guided setup'
              className='px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-background ml-auto'
            >
              Start setup
            </button>
            <button
              onClick={() => setIsSetupExpanded((prev) => !prev)}
              aria-label='Toggle coach guided setup actions'
              aria-expanded={isSetupExpanded}
              tabIndex={0}
              className='p-1 border-2 border-border bg-background'
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  isSetupExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
          {isSetupExpanded && (
            <div className='space-y-1.5'>
              <p className='text-[11px] font-medium text-muted-foreground'>
                Build a new block or weekly plan with structured questions.
              </p>
              <div className='flex flex-wrap gap-1.5'>
                <button
                  onClick={() => beginIntake('weekly_plan_edit')}
                  tabIndex={0}
                  aria-label='Start weekly plan edit guided setup'
                  className='px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-background'
                >
                  Edit weekly plan
                </button>
                <button
                  onClick={() => beginIntake('training_block')}
                  tabIndex={0}
                  aria-label='Start training block guided setup'
                  className='px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-background'
                >
                  New training block
                </button>
              </div>
            </div>
          )}
          {lastSavedAt && (
            <p className='text-[10px] text-muted-foreground font-medium'>
              Draft saved at {new Date(lastSavedAt).toLocaleTimeString()}.
            </p>
          )}
        </div>
      )}

      {isIntakeCollapsedWhileGenerating && (
        <div className='border-2 border-border bg-muted/30 p-1.5 space-y-1'>
          <div className='flex items-center justify-between gap-2'>
            <p className='text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
              Intake form collapsed while generating
            </p>
            <button
              onClick={() => setShowIntakeDuringGeneration(true)}
              tabIndex={0}
              aria-label='Expand intake form while generating'
              className='px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-background'
            >
              Show form
            </button>
          </div>
          <p className='text-[11px] font-medium text-muted-foreground'>
            Pipeline progress remains visible below.
          </p>
        </div>
      )}

      {!isIntakeCollapsedWhileGenerating && hasActiveIntake && (
        <div className='space-y-1.5'>
          <button
            onClick={() => setIsActiveIntakeExpanded((prev) => !prev)}
            aria-label='Toggle active coach intake form'
            aria-expanded={isActiveIntakeExpanded}
            tabIndex={0}
            className='w-full border-2 border-border bg-muted/20 px-2 py-1.5'
          >
            <div className='flex items-center justify-between gap-2'>
              <div className='min-w-0 text-left'>
                <p className='text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
                  {intakeLabel} intake
                </p>
                <p className='text-[11px] font-medium text-muted-foreground truncate'>
                  {mode === 'review'
                    ? 'Review and generate'
                    : `Step ${stepIndex + 1} of ${stepIds.length}`}
                </p>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                  isActiveIntakeExpanded ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>

          {isActiveIntakeExpanded && (
            <div className={intakeContentClassName}>
              {intent === 'weekly_plan_edit' && isLoadingActivePlanForEdit && (
                <div className='border-2 border-border bg-muted/30 p-1.5 text-[11px] font-medium text-muted-foreground'>
                  Loading active weekly plan...
                </div>
              )}
              {intent === 'weekly_plan_edit' &&
                !isLoadingActivePlanForEdit &&
                !selectedPlanForEdit && (
                  <div className='border-2 border-border bg-destructive/10 p-1.5 space-y-1.5'>
                    <p className='text-[11px] font-bold text-destructive'>
                      No weekly plan found for the selected week.
                    </p>
                    <button
                      onClick={() => beginIntake('weekly_plan')}
                      tabIndex={0}
                      aria-label='Start new weekly plan setup'
                      className='px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-background'
                    >
                      Start new weekly plan
                    </button>
                  </div>
                )}
              {intent === 'weekly_plan_edit' &&
                !isLoadingActivePlanForEdit &&
                selectedPlanForEdit && (
                  <div className='border-2 border-border bg-primary/5 p-1.5 text-[11px] font-medium'>
                    Editing <span className='font-black'>{selectedPlanForEdit.title}</span> (
                    {selectedPlanForEdit.weekStart})
                  </div>
                )}
              {mode === 'collecting' && intent === 'weekly_plan' && renderWeeklyStep()}
              {mode === 'collecting' &&
                intent === 'weekly_plan_edit' &&
                renderEditStep()}
              {mode === 'collecting' && intent === 'training_block' && renderBlockStep()}
              {mode === 'review' && intent && (
                <IntakeReviewCard
                  title='Coach guided setup'
                  subtitle={
                    intent === 'weekly_plan'
                      ? 'Review weekly plan requirements before generating.'
                      : 'Review training block requirements before generating.'
                  }
                  items={reviewItems}
                  generateLabel={
                    intent === 'weekly_plan'
                      ? 'Generate weekly plan'
                      : intent === 'weekly_plan_edit'
                        ? 'Apply weekly plan edits'
                      : 'Generate training block'
                  }
                  isGenerating={isSubmitting}
                  onEdit={() => setMode('collecting')}
                  onGenerate={handleGenerate}
                  onCancel={handleCancel}
                />
              )}
            </div>
          )}
        </div>
      )}

      {isGeneratingWeeklyPlan && (
        <AiGenerationStatusCard
          title='Weekly plan pipeline'
          subtitle='Coach and physio coordination is running.'
          phaseOrder={WEEKLY_PHASE_ORDER}
          phaseLabels={WEEKLY_PHASE_LABELS}
          phaseStatusMap={weeklyPlanPhaseMap}
          currentMessage={weeklyPlanCurrentMessage}
          className='border-2 border-border bg-background p-1.5'
        />
      )}

      {(weeklyPlanError || blockError) && (
        <AiErrorBanner
          error={weeklyPlanError ?? blockError ?? parseAiErrorFromUnknown(null)}
          className='text-xs'
        />
      )}

      {(isGeneratingWeeklyPlan || isGeneratingBlock) && (
        <div className='flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground'>
          <Loader2 className='h-3.5 w-3.5 animate-spin' />
          {isGeneratingWeeklyPlan
            ? 'Generating weekly plan...'
            : 'Generating training block...'}
        </div>
      )}
    </div>
  );
};

export default CoachGuidedIntakePanel;

export {detectCoachIntakeIntent};
