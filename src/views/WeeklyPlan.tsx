'use client';

import {useState, useMemo} from 'react';
import {
  CalendarDays,
  Dumbbell,
  Footprints,
  Zap,
  Clock,
  Gauge,
  ChevronDown,
  Sparkles,
  Moon,
  Trash2,
  Check,
  MessageSquareText,
  Target,
  X,
  AlertCircle,
  ClipboardCheck,
} from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {NeoLoader} from '@/components/ui/neo-loader';
import WeeklyPlanDistribution from '@/components/weekly-plan/WeeklyPlanDistribution';
import {useWeeklyPlan} from '@/hooks/useWeeklyPlan';
import {useTrainingBlock} from '@/hooks/useTrainingBlock';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import {SESSION_TYPE_COLORS, SESSION_TYPE_BORDER_COLORS} from '@/lib/planConstants';
import type {UnifiedSession, PhysioExercise} from '@/lib/cacheTypes';
import {
  AUTO_STRATEGY_LABEL,
  STRATEGY_PRESET_LABELS,
  OPTIMIZATION_PRIORITY_LABELS,
  describeAutoStrategySelection,
  describeStrategyPreset,
  type OptimizationPriority,
  type StrategySelectionMode,
  type TrainingStrategyPreset,
} from '@/lib/trainingStrategy';

const formatWeekRange = (weekStart: string): string => {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
  const year = end.getFullYear();
  return `${fmt(start)} – ${fmt(end)}, ${year}`;
};

const toIsoDate = (d: Date): string => d.toISOString().slice(0, 10);

const getCurrentMonday = (): string => {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysSinceMonday);
  return toIsoDate(monday);
};

const getNextMonday = (): string => {
  const currentMonday = new Date(getCurrentMonday());
  currentMonday.setDate(currentMonday.getDate() + 7);
  return toIsoDate(currentMonday);
};

const PLAN_PREFERENCES_PREFIX = '<!-- weekly-plan-preferences:';
const PLAN_PREFERENCES_SUFFIX = '-->';
const PLAN_STRATEGY_PREFIX = '<!-- weekly-plan-strategy:';
const PLAN_STRATEGY_SUFFIX = '-->';

const extractPreferencesFromPlanContent = (content?: string | null): string => {
  if (!content) return '';
  const escapedPrefix = PLAN_PREFERENCES_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedSuffix = PLAN_PREFERENCES_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedPrefix}(.*?)${escapedSuffix}\\n?`);
  const match = content.match(regex);
  if (!match?.[1]) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return '';
  }
};

interface StrategyMeta {
  mode: StrategySelectionMode;
  preset: TrainingStrategyPreset;
  strategyLabel: string;
  optimizationPriority: OptimizationPriority;
  optimizationPriorityLabel: string;
  autoRationale: string | null;
}

const extractStrategyMeta = (content?: string | null): StrategyMeta | null => {
  if (!content) return null;
  const escapedPrefix = PLAN_STRATEGY_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedSuffix = PLAN_STRATEGY_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escapedPrefix}(.*?)${escapedSuffix}`);
  const match = content.match(regex);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as StrategyMeta;
  } catch {
    return null;
  }
};

const stripPlanMetaFromContent = (content?: string | null): string => {
  if (!content) return '';
  const escapedPreferencesPrefix = PLAN_PREFERENCES_PREFIX.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  const escapedPreferencesSuffix = PLAN_PREFERENCES_SUFFIX.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  const escapedStrategyPrefix = PLAN_STRATEGY_PREFIX.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  const escapedStrategySuffix = PLAN_STRATEGY_SUFFIX.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  return content
    .replace(
      new RegExp(`^${escapedPreferencesPrefix}(.*?)${escapedPreferencesSuffix}\\n?`),
      '',
    )
    .replace(
      new RegExp(`^${escapedStrategyPrefix}(.*?)${escapedStrategySuffix}\\n?`),
      '',
    );
};

interface FeedbackScoreField {
  label: string;
  value: number;
  setValue: (value: number) => void;
}

const DayCard = ({session}: {session: UnifiedSession}) => {
  const hasRun = !!session.run;
  const hasPhysio = !!session.physio;
  const isRest = !hasRun && !hasPhysio;

  const borderColor = hasRun
    ? (SESSION_TYPE_BORDER_COLORS[session.run!.type] ?? 'border-l-muted-foreground')
    : hasPhysio
      ? (SESSION_TYPE_BORDER_COLORS[session.physio!.type] ?? 'border-l-secondary')
      : 'border-l-muted-foreground';

  return (
    <div
      className={`border-3 border-border bg-background shadow-neo-sm p-4 transition-all hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] border-l-[6px] overflow-hidden min-w-0 ${borderColor}`}
      role='article'
      aria-label={`${session.day} — ${session.date}`}
    >
      {/* Day header */}
      <div className='flex items-start justify-between gap-2 mb-3'>
        <div className='flex items-center gap-2 shrink-0'>
          <span className='font-black text-sm uppercase tracking-wider'>
            {session.day}
          </span>
          <span className='text-[11px] text-muted-foreground font-bold'>
            {new Date(session.date).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
        <div className='flex flex-wrap justify-end gap-1'>
          {hasRun && (
            <span
              className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border-2 border-border ${SESSION_TYPE_COLORS[session.run!.type] ?? 'bg-muted text-foreground'}`}
            >
              <Footprints className='h-3 w-3 inline mr-0.5 -mt-0.5' />
              {session.run!.type}
            </span>
          )}
          {hasPhysio && (
            <span
              className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border-2 border-border ${SESSION_TYPE_COLORS[session.physio!.type] ?? 'bg-muted text-foreground'}`}
            >
              <Dumbbell className='h-3 w-3 inline mr-0.5 -mt-0.5' />
              {session.physio!.type}
            </span>
          )}
          {isRest && (
            <span className='px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-muted text-muted-foreground'>
              <Moon className='h-3 w-3 inline mr-0.5 -mt-0.5' />
              rest
            </span>
          )}
        </div>
      </div>

      {/* Running section */}
      {hasRun && (
        <div className='mb-3'>
          <p className='text-sm font-medium leading-relaxed'>
            {session.run!.description}
          </p>
          {(session.run!.duration || session.run!.targetPace || session.run!.targetZone) && (
            <div className='flex flex-wrap gap-1.5 mt-2'>
              {session.run!.duration && (
                <span className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-muted border-2 border-border'>
                  <Clock className='h-2.5 w-2.5' />
                  {session.run!.duration}
                </span>
              )}
              {session.run!.targetPace && (
                <span className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-secondary/10 text-secondary border-2 border-border'>
                  <Gauge className='h-2.5 w-2.5' />
                  {session.run!.targetPace}
                </span>
              )}
              {session.run!.targetZone && (
                <span className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border-2 border-border'>
                  <Zap className='h-2.5 w-2.5' />
                  {session.run!.targetZone}
                </span>
              )}
            </div>
          )}
          {session.run!.notes && (
            <p className='text-xs text-muted-foreground font-medium mt-2 italic'>
              {session.run!.notes}
            </p>
          )}
        </div>
      )}

      {/* Divider between run and physio */}
      {hasRun && hasPhysio && (
        <div className='border-t-2 border-border/30 my-3' />
      )}

      {/* Physio section */}
      {hasPhysio && (
        <div>
          <div className='flex items-center gap-1.5 mb-2'>
            <Dumbbell className='h-3.5 w-3.5 text-secondary' />
            <span className='text-xs font-black uppercase tracking-wider text-secondary'>
              {session.physio!.type}
            </span>
            {session.physio!.duration && (
              <span className='text-[10px] text-muted-foreground font-bold ml-auto'>
                {session.physio!.duration}
              </span>
            )}
          </div>
          <div className='space-y-1'>
            {session.physio!.exercises.map((ex, i) => (
              <div
                key={i}
                className='text-xs'
              >
                <span className='font-bold'>{ex.name}</span>
                {' '}
                <span className='text-muted-foreground'>
                  {[
                    ex.sets && ex.reps ? `${ex.sets}x${ex.reps}` : null,
                    ex.tempo,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            ))}
          </div>
          {session.physio!.notes && (
            <p className='text-xs text-muted-foreground font-medium mt-2 italic'>
              {session.physio!.notes}
            </p>
          )}
        </div>
      )}

      {/* Rest day */}
      {isRest && session.notes && (
        <p className='text-sm text-muted-foreground font-medium'>
          {session.notes}
        </p>
      )}
    </div>
  );
};

const EmptyState = ({
  onGenerate,
  isGenerating,
}: {
  onGenerate: () => void;
  isGenerating: boolean;
}) => (
  <div className='border-3 border-border bg-background shadow-neo p-8 md:p-12 text-center space-y-4'>
    <div className='w-16 h-16 mx-auto bg-muted border-3 border-border shadow-neo-sm flex items-center justify-center'>
      <CalendarDays className='h-8 w-8 text-muted-foreground' />
    </div>
    <div className='space-y-1'>
      <h2 className='font-black text-lg uppercase tracking-wider'>
        No Weekly Plan Yet
      </h2>
      <p className='text-sm text-muted-foreground font-medium max-w-sm mx-auto'>
        Generate a unified weekly plan that combines running sessions from your
        Coach with strength and mobility work from your Physio.
      </p>
    </div>
    <button
      onClick={onGenerate}
      disabled={isGenerating}
      tabIndex={0}
      aria-label='Generate weekly plan'
      className='inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-black text-sm uppercase tracking-wider border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none'
    >
      {isGenerating ? (
        <NeoLoader label='Generating' size='sm' />
      ) : (
        <>
          <Sparkles className='h-4 w-4' />
          Generate Weekly Plan
        </>
      )}
    </button>
  </div>
);

const PlanHistoryItem = ({
  plan,
  isActive,
  onActivate,
  onDelete,
}: {
  plan: {id: string; title: string; weekStart: string; createdAt: number; isActive: boolean};
  isActive: boolean;
  onActivate: () => void;
  onDelete: () => void;
}) => (
  <div
    className={`flex items-center gap-3 px-4 py-3 border-3 border-border transition-all overflow-hidden ${
      isActive ? 'bg-primary/10 shadow-neo-sm' : 'bg-background hover:bg-muted'
    }`}
  >
    <div className='min-w-0 flex-1'>
      <p className='text-sm font-bold truncate'>{plan.title}</p>
      <p className='text-[11px] text-muted-foreground font-medium'>
        {formatWeekRange(plan.weekStart)}
      </p>
    </div>
    <div className='flex gap-1 shrink-0'>
      {!isActive && (
        <button
          onClick={onActivate}
          tabIndex={0}
          aria-label='Activate this plan'
          className='p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 border-2 border-transparent hover:border-border transition-all'
        >
          <Check className='h-3.5 w-3.5' />
        </button>
      )}
      <button
        onClick={onDelete}
        tabIndex={0}
        aria-label='Delete this plan'
        className='p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 border-2 border-transparent hover:border-border transition-all'
      >
        <Trash2 className='h-3.5 w-3.5' />
      </button>
    </div>
  </div>
);

const MarkdownContent = ({content}: {content: string}) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      table: ({children}) => (
        <div className='overflow-x-auto -mx-1 px-1'>
          <table className='w-full border-collapse border-3 border-border text-sm'>
            {children}
          </table>
        </div>
      ),
      th: ({children}) => (
        <th className='border-2 border-border px-3 py-2 bg-muted font-black text-xs uppercase tracking-wider text-left'>
          {children}
        </th>
      ),
      td: ({children}) => (
        <td className='border-2 border-border px-3 py-2'>{children}</td>
      ),
      pre: ({children}) => (
        <pre className='overflow-x-auto'>{children}</pre>
      ),
    }}
  >
    {content}
  </ReactMarkdown>
);

const BlockContextBanner = ({
  weekNumber,
  totalWeeks,
  phaseName,
  goalEvent,
}: {
  weekNumber: number;
  totalWeeks: number;
  phaseName: string | null;
  goalEvent: string;
}) => (
  <Link
    href='/training-block'
    className='flex items-center gap-2 px-4 py-2.5 border-3 border-border bg-nav-training-block/10 shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all min-w-0 overflow-hidden'
  >
    <Target className='h-4 w-4 text-nav-training-block shrink-0' />
    <span className='text-xs font-black uppercase tracking-wider shrink-0'>
      Week {weekNumber} of {totalWeeks}
    </span>
    {phaseName && (
      <>
        <span className='text-xs text-muted-foreground shrink-0'>&middot;</span>
        <span className='text-xs font-bold text-muted-foreground shrink-0'>{phaseName}</span>
      </>
    )}
    <span className='text-xs text-muted-foreground shrink-0'>&middot;</span>
    <span className='text-xs font-medium text-muted-foreground truncate min-w-0'>{goalEvent}</span>
  </Link>
);

const WeeklyPlan = () => {
  const {athlete} = useStravaAuth();
  const athleteId = athlete?.id ?? null;
  const {
    activePlan,
    plans,
    isLoading,
    isGenerating,
    generatePlan,
    activatePlan,
    deletePlan,
    preferences,
    setPreferences,
    savePreferences,
    lastError,
    previousWeekStart,
    previousWeekFeedback,
    isLoadingPreviousWeekFeedback,
    isSavingPreviousWeekFeedback,
    submitPreviousWeekFeedback,
  } = useWeeklyPlan(athleteId);
  const {activeBlock} = useTrainingBlock(athleteId);
  const {settings} = useSettings();
  const [fullPlanOpen, setFullPlanOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [regenerationMode, setRegenerationMode] = useState<'full' | 'remaining_days'>('full');
  const [targetWeekStart, setTargetWeekStart] = useState('');
  const [targetWeekSelection, setTargetWeekSelection] = useState<'current' | 'next'>('current');
  const [regenerationPreferences, setRegenerationPreferences] = useState('');
  const [strategySelectionMode, setStrategySelectionMode] =
    useState<StrategySelectionMode>('auto');
  const [strategyPreset, setStrategyPreset] =
    useState<TrainingStrategyPreset>('polarized_80_20');
  const [optimizationPriority, setOptimizationPriority] =
    useState<OptimizationPriority>('race_performance');
  const [feedbackAdherence, setFeedbackAdherence] = useState(3);
  const [feedbackEffort, setFeedbackEffort] = useState(3);
  const [feedbackFatigue, setFeedbackFatigue] = useState(3);
  const [feedbackSoreness, setFeedbackSoreness] = useState(3);
  const [feedbackMood, setFeedbackMood] = useState(3);
  const [feedbackConfidence, setFeedbackConfidence] = useState(3);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const feedbackScoreFields: FeedbackScoreField[] = [
    {
      label: 'Adherence to plan',
      value: feedbackAdherence,
      setValue: setFeedbackAdherence,
    },
    {label: 'Perceived effort', value: feedbackEffort, setValue: setFeedbackEffort},
    {label: 'Fatigue now', value: feedbackFatigue, setValue: setFeedbackFatigue},
    {label: 'Soreness now', value: feedbackSoreness, setValue: setFeedbackSoreness},
    {label: 'Mood/readiness', value: feedbackMood, setValue: setFeedbackMood},
    {
      label: 'Confidence',
      value: feedbackConfidence,
      setValue: setFeedbackConfidence,
    },
  ];
  const activePlanPreferences = useMemo(
    () => extractPreferencesFromPlanContent(activePlan?.content),
    [activePlan?.content],
  );
  const activePlanStrategyMeta = useMemo(
    () => extractStrategyMeta(activePlan?.content),
    [activePlan?.content],
  );
  const activePlanContent = useMemo(
    () => stripPlanMetaFromContent(activePlan?.content),
    [activePlan?.content],
  );

  const blockBannerData = useMemo(() => {
    if (!activeBlock || !activePlan?.blockId) return null;
    const weekNumber = activePlan.weekNumber ?? 0;
    if (weekNumber <= 0) return null;
    type Phase = {name: string; weekNumbers: number[]};
    const phases = activeBlock.phases as Phase[];
    const currentPhase = phases.find((p) => p.weekNumbers.includes(weekNumber));
    return {
      weekNumber,
      totalWeeks: activeBlock.totalWeeks,
      phaseName: currentPhase?.name ?? null,
      goalEvent: activeBlock.goalEvent,
    };
  }, [activeBlock, activePlan]);

  const handleGenerate = () => {
    handleOpenRegenerate();
  };

  const handleOpenRegenerate = () => {
    const currentMonday = getCurrentMonday();
    const nextMonday = getNextMonday();
    const defaultSelection: 'current' | 'next' =
      activePlan?.weekStart === nextMonday ? 'next' : 'current';
    setTargetWeekSelection(defaultSelection);
    setTargetWeekStart(defaultSelection === 'next' ? nextMonday : currentMonday);
    setRegenerationMode('full');
    setRegenerationPreferences(activePlanPreferences || preferences || '');
    setStrategySelectionMode(settings.strategySelectionMode ?? 'auto');
    setStrategyPreset(settings.strategyPreset ?? 'polarized_80_20');
    setOptimizationPriority(
      settings.optimizationPriority ?? 'race_performance',
    );
    setRegenerateOpen(true);
  };

  const handleSelectCurrentWeek = () => {
    setTargetWeekSelection('current');
    setTargetWeekStart(getCurrentMonday());
  };

  const handleSelectNextWeek = () => {
    setTargetWeekSelection('next');
    setTargetWeekStart(getNextMonday());
  };

  const handleRegenerateSubmit = () => {
    setPreferences(regenerationPreferences);
    savePreferences();
    generatePlan({
      weekStartDate: targetWeekStart || undefined,
      preferences: regenerationPreferences,
      mode: regenerationMode,
      sourcePlanId: activePlan?.id,
      strategySelectionMode,
      strategyPreset,
      optimizationPriority,
    });
    setRegenerateOpen(false);
  };

  const handleToggleFullPlan = () => {
    setFullPlanOpen((prev) => !prev);
  };

  const handleToggleHistory = () => {
    setHistoryOpen((prev) => !prev);
  };

  const handleOpenFeedback = () => {
    setFeedbackAdherence(previousWeekFeedback?.adherence ?? 3);
    setFeedbackEffort(previousWeekFeedback?.effort ?? 3);
    setFeedbackFatigue(previousWeekFeedback?.fatigue ?? 3);
    setFeedbackSoreness(previousWeekFeedback?.soreness ?? 3);
    setFeedbackMood(previousWeekFeedback?.mood ?? 3);
    setFeedbackConfidence(previousWeekFeedback?.confidence ?? 3);
    setFeedbackNotes(previousWeekFeedback?.notes ?? '');
    setFeedbackOpen(true);
  };

  const handleSubmitFeedback = async () => {
    await submitPreviousWeekFeedback({
      adherence: feedbackAdherence,
      effort: feedbackEffort,
      fatigue: feedbackFatigue,
      soreness: feedbackSoreness,
      mood: feedbackMood,
      confidence: feedbackConfidence,
      notes: feedbackNotes,
    });
    setFeedbackOpen(false);
  };

  if (isLoading) {
    return (
      <div className='space-y-4 md:space-y-6'>
        <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
          Weekly Plan
        </h1>
        <div className='border-3 border-border bg-background shadow-neo p-8 flex items-center justify-center'>
          <NeoLoader label='Loading plan' size='sm' />
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-4 md:space-y-6 min-w-0 max-w-full overflow-x-hidden'>
      {/* Page title */}
      <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
        Weekly Plan
      </h1>

      {lastError && (
        <div className='border-3 border-border bg-destructive/10 text-destructive shadow-neo-sm p-3 space-y-2'>
          <div className='flex items-start gap-2'>
            <AlertCircle className='h-4 w-4 shrink-0 mt-0.5' />
            <div className='space-y-1'>
              <p className='text-sm font-black'>{lastError.error}</p>
              {lastError.recoveryActions.length > 0 && (
                <p className='text-xs font-medium'>
                  Try: {lastError.recoveryActions.join(' · ')}
                </p>
              )}
              {lastError.traceId && (
                <p className='text-[10px] font-bold uppercase tracking-wider'>
                  Trace: {lastError.traceId}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Training block context banner */}
      {blockBannerData && activePlan && (
        <BlockContextBanner
          weekNumber={blockBannerData.weekNumber}
          totalWeeks={blockBannerData.totalWeeks}
          phaseName={blockBannerData.phaseName}
          goalEvent={blockBannerData.goalEvent}
        />
      )}

      {regenerateOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
          <div className='w-full max-w-xl border-3 border-border bg-background shadow-neo p-5 space-y-4'>
            <div className='flex items-start justify-between gap-3'>
              <div className='space-y-1'>
                <h3 className='font-black text-base uppercase tracking-wider'>
                  Regenerate Weekly Plan
                </h3>
                <p className='text-xs text-muted-foreground font-medium'>
                  Choose whether to regenerate the full week or only the remaining days.
                </p>
              </div>
              <button
                onClick={() => setRegenerateOpen(false)}
                tabIndex={0}
                aria-label='Close regenerate dialog'
                className='p-1.5 border-2 border-border bg-background hover:bg-muted'
              >
                <X className='h-3.5 w-3.5' />
              </button>
            </div>

            <div className='space-y-2'>
              <label className='block text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
                Mode
              </label>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                <button
                  onClick={() => setRegenerationMode('full')}
                  tabIndex={0}
                  aria-label='Regenerate full week mode'
                  className={`text-left px-3 py-2 border-3 border-border text-xs font-bold transition-colors ${
                    regenerationMode === 'full'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  Full week
                </button>
                <button
                  onClick={() => setRegenerationMode('remaining_days')}
                  tabIndex={0}
                  aria-label='Regenerate remaining days mode'
                  className={`text-left px-3 py-2 border-3 border-border text-xs font-bold transition-colors ${
                    regenerationMode === 'remaining_days'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  Remaining days (uses completed activities)
                </button>
              </div>
            </div>

            <div className='space-y-2'>
              <label className='block text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
                Strategy
              </label>
              <select
                value={
                  strategySelectionMode === 'auto' ? 'auto' : strategyPreset
                }
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'auto') {
                    setStrategySelectionMode('auto');
                    return;
                  }
                  setStrategySelectionMode('preset');
                  setStrategyPreset(value as TrainingStrategyPreset);
                }}
                className='w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30'
                aria-label='Select strategy'
              >
                <option value='auto'>{AUTO_STRATEGY_LABEL}</option>
                {Object.entries(STRATEGY_PRESET_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <p className='text-xs text-muted-foreground font-medium'>
                {strategySelectionMode === 'auto'
                  ? describeAutoStrategySelection()
                  : describeStrategyPreset(strategyPreset)}
              </p>
            </div>

            <div className='space-y-2'>
              <label className='block text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
                Optimization Priority
              </label>
              <select
                value={optimizationPriority}
                onChange={(e) =>
                  setOptimizationPriority(
                    e.target.value as OptimizationPriority,
                  )
                }
                className='w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30'
                aria-label='Select optimization priority'
              >
                {Object.entries(OPTIMIZATION_PRIORITY_LABELS).map(
                  ([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className='space-y-2'>
              <label className='block text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
                Target Week (Monday)
              </label>
              <div
                aria-label='Selected target week'
                className='w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium'
              >
                {targetWeekStart ? `${formatWeekRange(targetWeekStart)} (${targetWeekStart})` : 'Select a week'}
              </div>
              <p className='text-[11px] text-muted-foreground font-medium'>
                Choose either current or next week.
              </p>
            </div>

            <div className='space-y-2'>
              <label
                htmlFor='regenerate-preferences'
                className='block text-[10px] font-black uppercase tracking-widest text-muted-foreground'
              >
                Preferences
              </label>
              <textarea
                id='regenerate-preferences'
                value={regenerationPreferences}
                onChange={(e) => setRegenerationPreferences(e.target.value)}
                rows={3}
                className='w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none'
                placeholder='Add weekly constraints/preferences for this plan generation'
              />
            </div>

            <div className='flex flex-wrap gap-2'>
              <button
                onClick={handleRegenerateSubmit}
                disabled={isGenerating}
                tabIndex={0}
                aria-label='Confirm regenerate weekly plan'
                className='inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-wider border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all disabled:opacity-50 disabled:pointer-events-none'
              >
                {isGenerating ? <NeoLoader size='sm' /> : <Sparkles className='h-3.5 w-3.5' />}
                Generate
              </button>
              <button
                onClick={handleSelectCurrentWeek}
                tabIndex={0}
                aria-label='Use current week'
                className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider border-3 border-border transition-colors ${
                  targetWeekSelection === 'current'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-background hover:bg-muted'
                }`}
              >
                Current Week
              </button>
              <button
                onClick={handleSelectNextWeek}
                tabIndex={0}
                aria-label='Use next week'
                className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider border-3 border-border transition-colors ${
                  targetWeekSelection === 'next'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-background hover:bg-muted'
                }`}
              >
                Next Week
              </button>
            </div>
          </div>
        </div>
      )}

      {feedbackOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'>
          <div className='w-full max-w-xl border-3 border-border bg-background shadow-neo p-5 space-y-4'>
            <div className='flex items-start justify-between gap-3'>
              <div className='space-y-1'>
                <h3 className='font-black text-base uppercase tracking-wider'>
                  Last Week Reflection
                </h3>
                <p className='text-xs text-muted-foreground font-medium'>
                  Share how training went for week starting {previousWeekStart}.
                </p>
              </div>
              <button
                onClick={() => setFeedbackOpen(false)}
                tabIndex={0}
                aria-label='Close feedback dialog'
                className='p-1.5 border-2 border-border bg-background hover:bg-muted'
              >
                <X className='h-3.5 w-3.5' />
              </button>
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
              {feedbackScoreFields.map((field) => (
                <label key={field.label} className='space-y-1'>
                  <span className='text-[10px] uppercase tracking-wider font-black text-muted-foreground'>
                    {field.label}
                  </span>
                  <select
                    value={String(field.value)}
                    onChange={(e) => field.setValue(Number(e.target.value))}
                    className='w-full border-2 border-border bg-muted/50 px-2 py-1.5 text-sm font-medium'
                  >
                    <option value='1'>1</option>
                    <option value='2'>2</option>
                    <option value='3'>3</option>
                    <option value='4'>4</option>
                    <option value='5'>5</option>
                  </select>
                </label>
              ))}
            </div>

            <div className='space-y-1'>
              <label
                htmlFor='weekly-feedback-notes'
                className='text-[10px] uppercase tracking-wider font-black text-muted-foreground'
              >
                Notes (optional)
              </label>
              <textarea
                id='weekly-feedback-notes'
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
                rows={3}
                className='w-full border-2 border-border bg-muted/50 px-2 py-1.5 text-sm font-medium resize-none'
                placeholder='How did training feel? What was hard/easy?'
              />
            </div>

            <div className='flex flex-wrap gap-2'>
              <button
                onClick={handleSubmitFeedback}
                disabled={isSavingPreviousWeekFeedback}
                tabIndex={0}
                aria-label='Submit weekly reflection'
                className='inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-wider border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all disabled:opacity-50 disabled:pointer-events-none'
              >
                {isSavingPreviousWeekFeedback ? (
                  <NeoLoader size='sm' />
                ) : (
                  <ClipboardCheck className='h-3.5 w-3.5' />
                )}
                Save reflection
              </button>
              <button
                onClick={() => setFeedbackOpen(false)}
                tabIndex={0}
                aria-label='Cancel feedback'
                className='inline-flex items-center gap-1.5 px-4 py-2 font-black text-[10px] uppercase tracking-wider border-3 border-border bg-background hover:bg-muted'
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!activePlan && (
        <EmptyState
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
        />
      )}

      {/* Active plan */}
      {activePlan && (
        <>
          {/* Plan header */}
          <div className='border-3 border-border bg-background shadow-neo border-l-[6px] border-l-primary p-5 md:p-6 space-y-3 overflow-hidden'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0 space-y-1'>
                <span className='font-black text-[10px] uppercase tracking-widest text-primary flex items-center gap-1'>
                  <CalendarDays className='h-3 w-3' />
                  Active Plan
                </span>
                <h2 className='font-black text-xl md:text-2xl uppercase tracking-tight leading-tight'>
                  {activePlan.title}
                </h2>
                {activePlan.summary && (
                  <p className='text-sm text-muted-foreground font-medium leading-relaxed'>
                    {activePlan.summary}
                  </p>
                )}
              </div>
              <div className='flex items-center gap-2 shrink-0'>
                <button
                  onClick={handleOpenFeedback}
                  disabled={isLoadingPreviousWeekFeedback}
                  tabIndex={0}
                  aria-label='Review last week feedback'
                  className='inline-flex items-center gap-1.5 px-2.5 py-2 text-muted-foreground hover:text-primary hover:bg-primary/10 border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all disabled:opacity-50 disabled:pointer-events-none'
                >
                  <ClipboardCheck className='h-4 w-4' />
                  <span className='hidden md:inline text-[10px] font-black uppercase tracking-wider'>
                    Review Last Week
                  </span>
                </button>
                <button
                  onClick={handleOpenRegenerate}
                  disabled={isGenerating}
                  tabIndex={0}
                  aria-label='Open regenerate plan options'
                  className='shrink-0 p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none'
                >
                  {isGenerating ? (
                    <NeoLoader size='sm' />
                  ) : (
                    <Sparkles className='h-4 w-4' />
                  )}
                </button>
              </div>
            </div>

            {/* Week range + meta pills */}
            <div className='flex flex-wrap gap-2'>
              <span className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-3 border-border bg-secondary/10 text-secondary shadow-neo-sm'>
                <CalendarDays className='h-3 w-3' />
                {formatWeekRange(activePlan.weekStart)}
              </span>
              {activePlan.goal && (
                <span className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-3 border-border bg-accent/20 text-accent-foreground shadow-neo-sm'>
                  {activePlan.goal}
                </span>
              )}
              <span className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-3 border-border bg-muted shadow-neo-sm'>
                {activePlan.sessions.filter((s) => s.run).length} runs · {activePlan.sessions.filter((s) => s.physio).length} physio
              </span>
            </div>
          </div>

          {/* Preferences used to generate this plan */}
          <div className='border-3 border-border bg-background shadow-neo-sm p-4 space-y-2'>
            <div className='flex items-center gap-1.5'>
              <ClipboardCheck className='h-3.5 w-3.5 text-primary' />
              <span className='font-black text-[10px] uppercase tracking-widest text-primary'>
                Last Week Reflection
              </span>
            </div>
            {isLoadingPreviousWeekFeedback ? (
              <p className='text-sm font-medium text-muted-foreground'>
                Loading...
              </p>
            ) : previousWeekFeedback ? (
              <div className='space-y-1 text-sm font-medium'>
                <p>
                  Week: <span className='font-bold'>{previousWeekFeedback.weekStart}</span>
                </p>
                <p className='text-muted-foreground'>
                  Adherence {previousWeekFeedback.adherence}/5 · Effort {previousWeekFeedback.effort}/5 · Fatigue {previousWeekFeedback.fatigue}/5 · Soreness {previousWeekFeedback.soreness}/5 · Mood {previousWeekFeedback.mood}/5 · Confidence {previousWeekFeedback.confidence}/5
                </p>
                {previousWeekFeedback.notes && (
                  <p className='text-muted-foreground italic'>
                    {previousWeekFeedback.notes}
                  </p>
                )}
              </div>
            ) : (
              <p className='text-sm font-medium text-muted-foreground'>
                No reflection submitted yet for week starting {previousWeekStart}.
              </p>
            )}
          </div>

          {/* Preferences used to generate this plan */}
          <div className='border-3 border-border bg-background shadow-neo-sm p-4 space-y-2'>
            <div className='flex items-center gap-1.5'>
              <MessageSquareText className='h-3.5 w-3.5 text-primary' />
              <span className='font-black text-[10px] uppercase tracking-widest text-primary'>
                Preferences Used
              </span>
            </div>
            <p className='text-sm font-medium whitespace-pre-wrap'>
              {activePlanPreferences || 'No preferences were provided for this plan.'}
            </p>
          </div>

          {activePlanStrategyMeta && (
            <div className='border-3 border-border bg-background shadow-neo-sm p-4 space-y-2'>
              <div className='flex items-center gap-1.5'>
                <Target className='h-3.5 w-3.5 text-primary' />
                <span className='font-black text-[10px] uppercase tracking-widest text-primary'>
                  Strategy Rationale
                </span>
              </div>
              <p className='text-sm font-medium'>
                <span className='font-bold'>Strategy:</span>{' '}
                {activePlanStrategyMeta.strategyLabel}{' '}
                <span className='text-muted-foreground'>
                  ({activePlanStrategyMeta.mode === 'auto' ? 'auto-selected' : 'manual'})
                </span>
              </p>
              <p className='text-sm font-medium'>
                <span className='font-bold'>Priority:</span>{' '}
                {activePlanStrategyMeta.optimizationPriorityLabel}
              </p>
              {activePlanStrategyMeta.autoRationale && (
                <p className='text-sm text-muted-foreground font-medium'>
                  {activePlanStrategyMeta.autoRationale}
                </p>
              )}
            </div>
          )}

          {/* Day cards */}
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4'>
            {activePlan.sessions.map((session, index) => (
              <DayCard key={session.date ?? index} session={session} />
            ))}
          </div>

          {/* Full plan markdown */}
          {activePlanContent && (
            <div className='border-3 border-border bg-background shadow-neo overflow-hidden'>
              <button
                onClick={handleToggleFullPlan}
                aria-expanded={fullPlanOpen}
                aria-label={`${fullPlanOpen ? 'Collapse' : 'Expand'} full plan details`}
                tabIndex={0}
                className='w-full flex items-center justify-between p-4 md:p-5 hover:bg-muted/50 transition-colors'
              >
                <span className='font-black text-base md:text-lg uppercase tracking-wider'>
                  Full Plan Details
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
                    fullPlanOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden='true'
                />
              </button>
              {fullPlanOpen && (
                <div className='px-4 pb-4 md:px-5 md:pb-5 prose-sm max-w-none overflow-hidden break-words'>
                  <MarkdownContent content={activePlanContent} />
                </div>
              )}
            </div>
          )}

          {/* Plan history */}
          {plans.length > 1 && (
            <div className='border-3 border-border bg-background shadow-neo overflow-hidden'>
              <button
                onClick={handleToggleHistory}
                aria-expanded={historyOpen}
                aria-label={`${historyOpen ? 'Collapse' : 'Expand'} plan history`}
                tabIndex={0}
                className='w-full flex items-center justify-between p-4 md:p-5 hover:bg-muted/50 transition-colors'
              >
                <span className='font-black text-base md:text-lg uppercase tracking-wider'>
                  Plan History ({plans.length})
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
                    historyOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden='true'
                />
              </button>
              {historyOpen && (
                <div className='space-y-1 p-2 overflow-hidden'>
                  {plans.map((plan) => (
                    <PlanHistoryItem
                      key={plan.id}
                      plan={plan}
                      isActive={plan.id === activePlan?.id}
                      onActivate={() => activatePlan(plan.id)}
                      onDelete={() => deletePlan(plan.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <WeeklyPlanDistribution
            weekStart={activePlan.weekStart}
            sessions={activePlan.sessions}
          />
        </>
      )}
    </div>
  );
};

export default WeeklyPlan;
