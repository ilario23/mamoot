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
} from 'lucide-react';
import {NeoLoader} from '@/components/ui/neo-loader';
import {useTrainingBlock} from '@/hooks/useTrainingBlock';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import type {WeekOutline, TrainingPhase} from '@/lib/cacheTypes';

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
}: {
  onGenerate: (goalEvent: string, goalDate: string, totalWeeks?: number) => void;
  isGenerating: boolean;
  defaultGoalEvent: string;
}) => {
  const [goalEvent, setGoalEvent] = useState(defaultGoalEvent);
  const [goalDate, setGoalDate] = useState('');
  const [totalWeeks, setTotalWeeks] = useState('');

  const handleSubmit = () => {
    if (!goalEvent.trim() || !goalDate) return;
    onGenerate(goalEvent.trim(), goalDate, totalWeeks ? Number(totalWeeks) : undefined);
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
    activateBlock,
    deleteBlock,
  } = useTrainingBlock(athleteId);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editGoalEvent, setEditGoalEvent] = useState('');
  const [editGoalDate, setEditGoalDate] = useState('');
  const [editTotalWeeks, setEditTotalWeeks] = useState('');

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

  const handleGenerate = (goalEvent: string, goalDate: string, totalWeeks?: number) => {
    generateBlock(goalEvent, goalDate, totalWeeks);
  };

  const handleToggleHistory = () => {
    setHistoryOpen((prev) => !prev);
  };

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

      {!activeBlock && (
        <CreateBlockForm
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          defaultGoalEvent={settings?.goal ?? ''}
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
                    setEditGoalEvent(activeBlock.goalEvent);
                    setEditGoalDate(activeBlock.goalDate);
                    setEditTotalWeeks(String(activeBlock.totalWeeks));
                    setEditOpen(true);
                  }
                }}
                disabled={isGenerating}
                tabIndex={0}
                aria-label={editOpen ? 'Cancel editing' : 'Edit goal and regenerate'}
                className="shrink-0 p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none"
              >
                {editOpen ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              </button>
            </div>

            {editOpen && (
              <div className="space-y-3 border-t-3 border-border pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="edit-event"
                      className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
                    >
                      Goal Event
                    </label>
                    <input
                      id="edit-event"
                      type="text"
                      value={editGoalEvent}
                      onChange={(e) => setEditGoalEvent(e.target.value)}
                      className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-date"
                      className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
                    >
                      Event Date
                    </label>
                    <input
                      id="edit-date"
                      type="date"
                      value={editGoalDate}
                      onChange={(e) => setEditGoalDate(e.target.value)}
                      className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-weeks"
                      className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1"
                    >
                      Total Weeks
                    </label>
                    <input
                      id="edit-weeks"
                      type="number"
                      min={4}
                      max={52}
                      value={editTotalWeeks}
                      onChange={(e) => setEditTotalWeeks(e.target.value)}
                      className="w-full bg-muted/50 border-2 border-border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (!editGoalEvent.trim() || !editGoalDate) return;
                      setEditOpen(false);
                      handleGenerate(
                        editGoalEvent.trim(),
                        editGoalDate,
                        editTotalWeeks ? Number(editTotalWeeks) : undefined,
                      );
                    }}
                    disabled={isGenerating || !editGoalEvent.trim() || !editGoalDate}
                    tabIndex={0}
                    aria-label="Regenerate block with changes"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-wider border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {isGenerating ? (
                      <NeoLoader size="sm" />
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Regenerate with Changes
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
          {blocks.length > 1 && (
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
                      onDelete={() => deleteBlock(block.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TrainingBlockView;
