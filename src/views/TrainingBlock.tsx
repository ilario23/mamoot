'use client';

import {useState, useMemo} from 'react';
import {
  Target,
  CalendarDays,
  ChevronDown,
  Sparkles,
  Trash2,
  Check,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  Dumbbell,
  Footprints,
  Pencil,
  X,
  AlertCircle,
} from 'lucide-react';
import {NeoLoader} from '@/components/ui/neo-loader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {useTrainingBlock} from '@/hooks/useTrainingBlock';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import type {WeekOutline, TrainingPhase} from '@/lib/cacheTypes';
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

const WEEK_TYPE_COLORS: Record<string, string> = {
  base: 'bg-zone-1/20 text-zone-1',
  build: 'bg-zone-2/20 text-zone-2',
  recovery: 'bg-zone-1/30 text-zone-1',
  'off-load': 'bg-muted text-muted-foreground',
  peak: 'bg-zone-4/20 text-zone-4',
  taper: 'bg-zone-3/20 text-zone-3',
  race: 'bg-primary/20 text-primary',
};

const WEEK_TYPE_BORDER: Record<string, string> = {
  base: 'border-l-zone-1',
  build: 'border-l-zone-2',
  recovery: 'border-l-zone-1',
  'off-load': 'border-l-muted-foreground',
  peak: 'border-l-zone-4',
  taper: 'border-l-zone-3',
  race: 'border-l-primary',
};

const INTENSITY_ICON: Record<string, typeof Zap> = {
  low: Minus,
  moderate: TrendingUp,
  high: Zap,
};

const getCurrentWeek = (startDate: string, totalWeeks: number): number => {
  const now = new Date();
  const start = new Date(startDate);
  const diffMs = now.getTime() - start.getTime();
  return Math.max(1, Math.min(totalWeeks, Math.ceil(diffMs / (7 * 86400000))));
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});

const getWeekStartDate = (blockStart: string, weekNumber: number): string => {
  const d = new Date(blockStart);
  d.setDate(d.getDate() + (weekNumber - 1) * 7);
  return d.toISOString().slice(0, 10);
};

const extractAppliedStrategyMeta = (
  weekOutlines: WeekOutline[],
): {strategy: string | null; priority: string | null} => {
  const firstNote = weekOutlines[0]?.notes;
  if (!firstNote) return {strategy: null, priority: null};
  const match = firstNote.match(/^\[Strategy\]\s*(.+?)(?:\s+—\s+|$)/i);
  const body = match?.[1]?.trim() ?? null;
  if (!body) return {strategy: null, priority: null};
  const parts = body.split('|').map((p) => p.trim()).filter(Boolean);
  const strategy = parts[0] ?? null;
  const priorityPart = parts.find((part) => /^Priority:/i.test(part)) ?? null;
  const priority = priorityPart
    ? priorityPart.replace(/^Priority:\s*/i, '').trim()
    : null;
  return {strategy, priority};
};

const WeekRow = ({
  outline,
  isCurrent,
  isPast,
  blockStart,
}: {
  outline: WeekOutline;
  isCurrent: boolean;
  isPast: boolean;
  blockStart: string;
}) => {
  const IntensityIcon = INTENSITY_ICON[outline.intensityLevel] ?? Minus;
  const weekDate = getWeekStartDate(blockStart, outline.weekNumber);

  return (
    <div
      className={`border-3 border-border p-3 md:p-4 transition-all border-l-[6px] ${
        WEEK_TYPE_BORDER[outline.weekType] ?? 'border-l-muted-foreground'
      } ${
        isCurrent
          ? 'bg-primary/5 shadow-neo-sm ring-2 ring-primary/30'
          : isPast
            ? 'bg-muted/30 opacity-60'
            : 'bg-background hover:shadow-neo-sm hover:translate-x-[-1px] hover:translate-y-[-1px]'
      }`}
      role="article"
      aria-label={`Week ${outline.weekNumber} — ${outline.weekType}`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 flex items-center justify-center border-3 border-border bg-background font-black text-sm">
          {outline.weekNumber}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border-2 border-border ${
                WEEK_TYPE_COLORS[outline.weekType] ?? 'bg-muted text-foreground'
              }`}
            >
              {outline.weekType}
            </span>
            <span className="text-[11px] font-bold text-muted-foreground">
              {outline.phase}
            </span>
            {isCurrent && (
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-primary text-primary-foreground border-2 border-border">
                Current
              </span>
            )}
            <span className="text-[10px] text-muted-foreground font-medium ml-auto hidden sm:inline">
              {formatDate(weekDate)}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-secondary/10 text-secondary border-2 border-border">
              <Footprints className="h-2.5 w-2.5" />
              {outline.volumeTargetKm} km
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-muted border-2 border-border">
              <IntensityIcon className="h-2.5 w-2.5" />
              {outline.intensityLevel}
            </span>
          </div>

          {outline.keyWorkouts.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {outline.keyWorkouts.map((w, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 text-[10px] font-bold bg-accent/10 border border-border/50 text-accent-foreground"
                >
                  {w}
                </span>
              ))}
            </div>
          )}

          {outline.notes && (
            <p className="text-xs text-muted-foreground font-medium italic">
              {outline.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const PhaseHeader = ({phase}: {phase: TrainingPhase}) => {
  const VolumeIcon =
    phase.volumeDirection === 'build'
      ? TrendingUp
      : phase.volumeDirection === 'reduce'
        ? TrendingDown
        : Minus;

  return (
    <div className="flex items-center gap-2 pt-4 pb-1 first:pt-0">
      <div className="h-px flex-1 bg-border" />
      <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-widest border-3 border-border bg-background shadow-neo-sm">
        <Dumbbell className="h-3 w-3" />
        {phase.name}
        <VolumeIcon className="h-3 w-3 text-muted-foreground" />
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
};

const CreateBlockForm = ({
  onGenerate,
  isGenerating,
  defaultGoalEvent,
  defaultStrategySelectionMode,
  defaultStrategyPreset,
  defaultOptimizationPriority,
}: {
  onGenerate: (options: {
    goalEvent: string;
    goalDate: string;
    totalWeeks?: number;
    strategySelectionMode: StrategySelectionMode;
    strategyPreset: TrainingStrategyPreset;
    optimizationPriority: OptimizationPriority;
  }) => void;
  isGenerating: boolean;
  defaultGoalEvent: string;
  defaultStrategySelectionMode: StrategySelectionMode;
  defaultStrategyPreset: TrainingStrategyPreset;
  defaultOptimizationPriority: OptimizationPriority;
}) => {
  const [goalEvent, setGoalEvent] = useState(defaultGoalEvent);
  const [goalDate, setGoalDate] = useState('');
  const [totalWeeks, setTotalWeeks] = useState('');
  const [strategySelectionMode, setStrategySelectionMode] =
    useState<StrategySelectionMode>(defaultStrategySelectionMode);
  const [strategyPreset, setStrategyPreset] =
    useState<TrainingStrategyPreset>(defaultStrategyPreset);
  const [optimizationPriority, setOptimizationPriority] =
    useState<OptimizationPriority>(defaultOptimizationPriority);

  const handleSubmit = () => {
    if (!goalEvent.trim() || !goalDate) return;
    onGenerate({
      goalEvent: goalEvent.trim(),
      goalDate,
      totalWeeks: totalWeeks ? Number(totalWeeks) : undefined,
      strategySelectionMode,
      strategyPreset,
      optimizationPriority,
    });
  };

  return (
    <div className="border-3 border-border bg-background shadow-neo p-8 md:p-12 text-center space-y-6">
      <div className="w-16 h-16 mx-auto bg-muted border-3 border-border shadow-neo-sm flex items-center justify-center">
        <Target className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="font-black text-lg uppercase tracking-wider">
          Create Training Block
        </h2>
        <p className="text-sm text-muted-foreground font-medium max-w-md mx-auto">
          Set a goal event and date to generate a periodized macro plan with
          phases, volume targets, and key workouts for each week.
        </p>
      </div>

      <div className="max-w-sm mx-auto space-y-3 text-left">
        <div>
          <label
            htmlFor="tb-event"
            className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
          >
            Goal Event
          </label>
          <input
            id="tb-event"
            type="text"
            value={goalEvent}
            onChange={(e) => setGoalEvent(e.target.value)}
            placeholder='e.g. "Berlin Marathon"'
            className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label
            htmlFor="tb-date"
            className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
          >
            Event Date
          </label>
          <input
            id="tb-date"
            type="date"
            value={goalDate}
            onChange={(e) => setGoalDate(e.target.value)}
            className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label
            htmlFor="tb-weeks"
            className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
          >
            Total Weeks (optional — auto-calculated from date)
          </label>
          <input
            id="tb-weeks"
            type="number"
            min={4}
            max={52}
            value={totalWeeks}
            onChange={(e) => setTotalWeeks(e.target.value)}
            placeholder="Auto"
            className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              Strategy
            </label>
            <select
              value={strategySelectionMode === 'auto' ? 'auto' : strategyPreset}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'auto') {
                  setStrategySelectionMode('auto');
                  return;
                }
                setStrategySelectionMode('preset');
                setStrategyPreset(value as TrainingStrategyPreset);
              }}
              className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="auto">{AUTO_STRATEGY_LABEL}</option>
              {Object.entries(STRATEGY_PRESET_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground font-medium mt-2">
              {strategySelectionMode === 'auto'
                ? describeAutoStrategySelection()
                : describeStrategyPreset(strategyPreset)}
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              Optimization Priority
            </label>
            <select
              value={optimizationPriority}
              onChange={(e) =>
                setOptimizationPriority(e.target.value as OptimizationPriority)
              }
              className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
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
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={isGenerating || !goalEvent.trim() || !goalDate}
        tabIndex={0}
        aria-label="Generate training block"
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-black text-sm uppercase tracking-wider border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none"
      >
        {isGenerating ? (
          <NeoLoader label="Generating" size="sm" />
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Generate Training Block
          </>
        )}
      </button>
    </div>
  );
};

const BlockHistoryItem = ({
  block,
  isActive,
  onActivate,
  onDelete,
}: {
  block: {id: string; goalEvent: string; goalDate: string; totalWeeks: number; createdAt: number; isActive: boolean};
  isActive: boolean;
  onActivate: () => void;
  onDelete: () => void;
}) => (
  <div
    className={`flex items-center gap-3 px-4 py-3 border-3 border-border transition-all ${
      isActive ? 'bg-primary/10 shadow-neo-sm' : 'bg-background hover:bg-muted'
    }`}
  >
    <div className="min-w-0 flex-1">
      <p className="text-sm font-bold truncate">{block.goalEvent}</p>
      <p className="text-[11px] text-muted-foreground font-medium">
        {formatDate(block.goalDate)} &middot; {block.totalWeeks} weeks
      </p>
    </div>
    <div className="flex gap-1 shrink-0">
      {!isActive && (
        <button
          onClick={onActivate}
          tabIndex={0}
          aria-label="Activate this block"
          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 border-2 border-transparent hover:border-border transition-all"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        onClick={onDelete}
        tabIndex={0}
        aria-label="Delete this block"
        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 border-2 border-transparent hover:border-border transition-all"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
);

const TrainingBlockView = () => {
  const {athlete} = useStravaAuth();
  const {settings} = useSettings();
  const athleteId = athlete?.id ?? null;
  const {
    activeBlock,
    blocks,
    isLoading,
    isGenerating,
    generateBlock,
    adaptBlock,
    activateBlock,
    deleteBlock,
    lastError,
  } = useTrainingBlock(athleteId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [adaptationType, setAdaptationType] = useState<'recalibrate_remaining_weeks' | 'insert_event' | 'shift_target_date'>('recalibrate_remaining_weeks');
  const [effectiveFromWeek, setEffectiveFromWeek] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventDistanceKm, setEventDistanceKm] = useState('');
  const [eventPriority, setEventPriority] = useState<'A' | 'B' | 'C'>('B');
  const [goalEvent, setGoalEvent] = useState('');
  const [newGoalDate, setNewGoalDate] = useState('');
  const [strategySelectionMode, setStrategySelectionMode] =
    useState<StrategySelectionMode>(settings.strategySelectionMode ?? 'auto');
  const [strategyPreset, setStrategyPreset] =
    useState<TrainingStrategyPreset>(settings.strategyPreset ?? 'polarized_80_20');
  const [optimizationPriority, setOptimizationPriority] =
    useState<OptimizationPriority>(
      settings.optimizationPriority ?? 'race_performance',
    );
  const [deleteBlockConfirmId, setDeleteBlockConfirmId] = useState<string | null>(
    null,
  );
  const [isDeletingBlock, setIsDeletingBlock] = useState(false);

  const currentWeek = useMemo(
    () =>
      activeBlock
        ? getCurrentWeek(activeBlock.startDate, activeBlock.totalWeeks)
        : 0,
    [activeBlock],
  );

  const currentPhase = useMemo(() => {
    if (!activeBlock) return null;
    return activeBlock.phases.find((p) => p.weekNumbers.includes(currentWeek)) ?? null;
  }, [activeBlock, currentWeek]);

  const progressPct = activeBlock
    ? Math.round((currentWeek / activeBlock.totalWeeks) * 100)
    : 0;
  const appliedStrategyMeta = useMemo(
    () =>
      activeBlock
        ? extractAppliedStrategyMeta(activeBlock.weekOutlines)
        : {strategy: null, priority: null},
    [activeBlock],
  );

  const handleGenerate = (options: {
    goalEvent: string;
    goalDate: string;
    totalWeeks?: number;
    strategySelectionMode: StrategySelectionMode;
    strategyPreset: TrainingStrategyPreset;
    optimizationPriority: OptimizationPriority;
  }) => {
    generateBlock(options);
  };

  const handleToggleHistory = () => {
    setHistoryOpen((prev) => !prev);
  };

  const handleDeleteBlockRequest = (blockId: string) => {
    setDeleteBlockConfirmId(blockId);
  };

  const handleDeleteBlockConfirm = async () => {
    if (!deleteBlockConfirmId || isDeletingBlock) return;
    setIsDeletingBlock(true);
    try {
      await deleteBlock(deleteBlockConfirmId);
      setDeleteBlockConfirmId(null);
    } finally {
      setIsDeletingBlock(false);
    }
  };

  const blockToDelete = useMemo(
    () => blocks.find((block) => block.id === deleteBlockConfirmId) ?? null,
    [blocks, deleteBlockConfirmId],
  );
  const isAdaptationInputInvalid =
    !goalEvent.trim()
    || (adaptationType === 'insert_event' && (!eventName.trim() || !eventDate))
    || (adaptationType === 'shift_target_date' && !newGoalDate);
  const isApplyAdaptationDisabled = isGenerating || isAdaptationInputInvalid;

  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
          Training Block
        </h1>
        <div className="border-3 border-border bg-background shadow-neo p-8 flex items-center justify-center">
          <NeoLoader label="Loading block" size="sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
        Training Block
      </h1>

      {lastError && (
        <div className="border-3 border-border bg-destructive/10 text-destructive shadow-neo-sm p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-black">{lastError.error}</p>
              {lastError.recoveryActions.length > 0 && (
                <p className="text-xs font-medium">
                  Try: {lastError.recoveryActions.join(' · ')}
                </p>
              )}
              {lastError.traceId && (
                <p className="text-[10px] font-bold uppercase tracking-wider">
                  Trace: {lastError.traceId}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {!activeBlock && (
        <CreateBlockForm
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          defaultGoalEvent={settings?.goal ?? ''}
          defaultStrategySelectionMode={settings.strategySelectionMode ?? 'auto'}
          defaultStrategyPreset={settings.strategyPreset ?? 'polarized_80_20'}
          defaultOptimizationPriority={
            settings.optimizationPriority ?? 'race_performance'
          }
        />
      )}

      {activeBlock && (
        <>
          {/* Block header */}
          <div className="border-3 border-border bg-background shadow-neo border-l-[6px] border-l-primary p-5 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <span className="font-black text-[10px] uppercase tracking-widest text-primary flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  Active Block
                </span>
                <h2 className="font-black text-xl md:text-2xl uppercase tracking-tight leading-tight">
                  {activeBlock.goalEvent}
                </h2>
              </div>
              <button
                onClick={() => {
                  if (editOpen) {
                    setEditOpen(false);
                  } else {
                    setAdaptationType('recalibrate_remaining_weeks');
                    setEffectiveFromWeek(String(currentWeek));
                    setEventName('');
                    setEventDate('');
                    setEventDistanceKm('');
                    setEventPriority('B');
                    setGoalEvent(activeBlock.goalEvent);
                    setNewGoalDate(activeBlock.goalDate);
                    setStrategySelectionMode(
                      settings.strategySelectionMode ?? 'auto',
                    );
                    setStrategyPreset(
                      settings.strategyPreset ?? 'polarized_80_20',
                    );
                    setOptimizationPriority(
                      settings.optimizationPriority ?? 'race_performance',
                    );
                    setEditOpen(true);
                  }
                }}
                disabled={isGenerating}
                tabIndex={0}
                aria-label={editOpen ? 'Cancel editing' : 'Adjust training block'}
                className="shrink-0 p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none"
              >
                {editOpen ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              </button>
            </div>

            {editOpen && (
              <div className="space-y-3 border-t-3 border-border pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="goal-event"
                      className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
                    >
                      Goal Event
                    </label>
                    <input
                      id="goal-event"
                      type="text"
                      value={goalEvent}
                      onChange={(e) => setGoalEvent(e.target.value)}
                      placeholder="e.g. Berlin Marathon"
                      className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="adaptation-type"
                      className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
                    >
                      Adaptation Mode
                    </label>
                    <select
                      id="adaptation-type"
                      value={adaptationType}
                      onChange={(e) => setAdaptationType(e.target.value as 'recalibrate_remaining_weeks' | 'insert_event' | 'shift_target_date')}
                      className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="recalibrate_remaining_weeks">Recalibrate remaining weeks</option>
                      <option value="insert_event">Insert mid-block race/event</option>
                      <option value="shift_target_date">Shift target date</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="effective-week"
                      className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
                    >
                      Effective From Week
                    </label>
                    <input
                      id="effective-week"
                      type="number"
                      min={1}
                      max={activeBlock.totalWeeks}
                      value={effectiveFromWeek}
                      onChange={(e) => setEffectiveFromWeek(e.target.value)}
                      className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
                    >
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
                      className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="auto">{AUTO_STRATEGY_LABEL}</option>
                      {Object.entries(STRATEGY_PRESET_LABELS).map(
                        ([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                    <p className="text-xs text-muted-foreground font-medium mt-2">
                      {strategySelectionMode === 'auto'
                        ? describeAutoStrategySelection()
                        : describeStrategyPreset(strategyPreset)}
                    </p>
                  </div>
                  <div>
                    <label
                      className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
                    >
                      Optimization Priority
                    </label>
                    <select
                      value={optimizationPriority}
                      onChange={(e) =>
                        setOptimizationPriority(
                          e.target.value as OptimizationPriority,
                        )
                      }
                      className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                </div>

                {adaptationType === 'insert_event' && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="event-name"
                        className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
                      >
                        Event Name
                      </label>
                      <input
                        id="event-name"
                        type="text"
                        value={eventName}
                        onChange={(e) => setEventName(e.target.value)}
                        placeholder="Half Marathon tune-up"
                        className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="event-date"
                        className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
                      >
                        Event Date
                      </label>
                      <input
                        id="event-date"
                        type="date"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="event-priority"
                        className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
                      >
                        Priority
                      </label>
                      <select
                        id="event-priority"
                        value={eventPriority}
                        onChange={(e) => setEventPriority(e.target.value as 'A' | 'B' | 'C')}
                        className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="A">A - Primary race effort (high priority)</option>
                        <option value="B">B - Secondary/tune-up race (moderate priority)</option>
                        <option value="C">C - Low-priority or fun event (minimal disruption)</option>
                      </select>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        A = peak target event, B = important tune-up, C = training event.
                      </p>
                    </div>
                  <div>
                    <label
                      htmlFor="event-distance"
                      className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
                    >
                      Distance (km)
                    </label>
                    <input
                      id="event-distance"
                      type="number"
                      min={1}
                      value={eventDistanceKm}
                      onChange={(e) => setEventDistanceKm(e.target.value)}
                      className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  </div>
                )}

                {adaptationType === 'shift_target_date' && (
                  <div>
                    <label
                      htmlFor="new-goal-date"
                      className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
                    >
                      New Goal Date
                    </label>
                    <input
                      id="new-goal-date"
                      type="date"
                      value={newGoalDate}
                      onChange={(e) => setNewGoalDate(e.target.value)}
                      className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!activeBlock) return;
                      if (!goalEvent.trim()) return;
                      if (adaptationType === 'insert_event' && (!eventName.trim() || !eventDate)) return;
                      if (adaptationType === 'shift_target_date' && !newGoalDate) return;
                      const adaptedBlock = await adaptBlock({
                        adaptationType,
                        sourceBlockId: activeBlock.id,
                        effectiveFromWeek: effectiveFromWeek ? Number(effectiveFromWeek) : undefined,
                        goalEvent: goalEvent.trim(),
                        goalDate:
                          adaptationType === 'shift_target_date'
                            ? newGoalDate
                            : activeBlock.goalDate,
                        strategySelectionMode,
                        strategyPreset,
                        optimizationPriority,
                        event: adaptationType === 'insert_event'
                          ? {
                              name: eventName.trim(),
                              date: eventDate,
                              distanceKm: eventDistanceKm ? Number(eventDistanceKm) : undefined,
                              priority: eventPriority,
                            }
                          : undefined,
                      });
                      if (adaptedBlock) {
                        setEditOpen(false);
                      }
                    }}
                    disabled={
                      isApplyAdaptationDisabled
                    }
                    tabIndex={0}
                    aria-label="Apply block adaptation"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-wider border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {isGenerating ? (
                      <NeoLoader size="sm" />
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Apply Adaptation
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setEditOpen(false)}
                    tabIndex={0}
                    aria-label="Cancel"
                    className="inline-flex items-center gap-1.5 px-4 py-2 font-black text-[10px] uppercase tracking-wider border-3 border-border bg-background hover:bg-muted shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Meta pills */}
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-3 border-border bg-secondary/10 text-secondary shadow-neo-sm">
                <CalendarDays className="h-3 w-3" />
                {formatDate(activeBlock.goalDate)}
              </span>
              {currentPhase && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-3 border-border bg-accent/20 text-accent-foreground shadow-neo-sm">
                  {currentPhase.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-3 border-border bg-muted shadow-neo-sm">
                Week {currentWeek} of {activeBlock.totalWeeks}
              </span>
              {appliedStrategyMeta.strategy && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-3 border-border bg-primary/10 text-primary shadow-neo-sm">
                  Strategy Applied: {appliedStrategyMeta.strategy}
                </span>
              )}
              {appliedStrategyMeta.priority && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-3 border-border bg-secondary/10 text-secondary shadow-neo-sm">
                  Priority: {appliedStrategyMeta.priority}
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <span>Progress</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-3 border-3 border-border bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{width: `${progressPct}%`}}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground font-medium">
              To edit weeks (e.g. &quot;make this an off-load week&quot;), chat with the Coach.
            </p>
          </div>

          {/* Week timeline */}
          <div className="space-y-2">
            {activeBlock.phases.map((phase) => (
              <div key={phase.name}>
                <PhaseHeader phase={phase} />
                <div className="space-y-2 mt-2">
                  {activeBlock.weekOutlines
                    .filter((o) => o.phase === phase.name)
                    .map((outline) => (
                      <WeekRow
                        key={outline.weekNumber}
                        outline={outline}
                        isCurrent={outline.weekNumber === currentWeek}
                        isPast={outline.weekNumber < currentWeek}
                        blockStart={activeBlock.startDate}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>

          {/* Block history */}
          {blocks.length > 0 && (
            <div className="border-3 border-border bg-background shadow-neo overflow-hidden">
              <button
                onClick={handleToggleHistory}
                aria-expanded={historyOpen}
                aria-label={`${historyOpen ? 'Collapse' : 'Expand'} block history`}
                tabIndex={0}
                className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-muted/50 transition-colors"
              >
                <span className="font-black text-base md:text-lg uppercase tracking-wider">
                  Block History ({blocks.length})
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
                    historyOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>
              {historyOpen && (
                <div className="space-y-1 p-2">
                  {blocks.map((block) => (
                    <BlockHistoryItem
                      key={block.id}
                      block={block}
                      isActive={block.id === activeBlock?.id}
                      onActivate={() => activateBlock(block.id)}
                      onDelete={() => handleDeleteBlockRequest(block.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <AlertDialog
        open={!!deleteBlockConfirmId}
        onOpenChange={(open) => {
          if (!open && !isDeletingBlock) setDeleteBlockConfirmId(null);
        }}
      >
        <AlertDialogContent className="border-3 border-border max-w-[320px] p-4 gap-3">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black text-base">
              Delete training block?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground space-y-2">
              <span className="block">
                This will permanently delete
                {blockToDelete ? ` "${blockToDelete.goalEvent}"` : ' this block'}.
              </span>
              <span className="block font-bold text-foreground text-xs">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeletingBlock}
              className="border-2 border-border font-bold text-xs"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBlockConfirm}
              disabled={isDeletingBlock}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 border-2 border-border font-black text-xs"
            >
              {isDeletingBlock ? 'Deleting...' : 'Delete block'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TrainingBlockView;
