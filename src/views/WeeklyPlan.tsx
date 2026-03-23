'use client';

import {useState, useMemo, useEffect, useCallback} from 'react';
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
  GripVertical,
} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
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
import {Sheet, SheetContent, SheetTitle} from '@/components/ui/sheet';
import AiErrorBanner from '@/components/ai/AiErrorBanner';
import WeeklyPlanDistribution from '@/components/weekly-plan/WeeklyPlanDistribution';
import RunPhaseTable from '@/components/weekly-plan/RunPhaseTable';
import WeeklyDecisionHeader from '@/components/training-plan/WeeklyDecisionHeader';
import TrainingPlanPanel from '@/components/training-plan/TrainingPlanPanel';
import {useWeeklyPlan} from '@/hooks/useWeeklyPlan';
import {useTrainingBlock} from '@/hooks/useTrainingBlock';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {SESSION_TYPE_COLORS, SESSION_TYPE_BORDER_COLORS} from '@/lib/planConstants';
import type {UnifiedSession} from '@/lib/cacheTypes';
import type {RunStep} from '@/lib/weeklyPlanSchema';
import {
  type OptimizationPriority,
  type StrategySelectionMode,
  type TrainingStrategyPreset,
} from '@/lib/trainingStrategy';
import {
  WEEKLY_PLAN_QUICK_ASK_OPTIONS,
  type WeeklyPlanQuickAskAction,
} from '@/lib/weeklyPlanQuickAsk';

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
const CLIENT_TIMEZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const toIsoDateInTimeZone = (d: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
};

const getWeekdayInTimeZone = (d: Date, timeZone: string): number => {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(d);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
};

const addDaysToIsoDate = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
};

const isHardSessionType = (type?: string): boolean => {
  if (!type) return false;
  const normalized = type.toLowerCase();
  return ['interval', 'tempo', 'threshold', 'race', 'vo2'].some((token) =>
    normalized.includes(token),
  );
};

const parseDistanceKm = (description?: string): number | null => {
  if (!description) return null;
  const match = description.match(/(\d+(?:\.\d+)?)\s*km/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const sumRunStepDistance = (steps?: RunStep[]): number => {
  if (!steps?.length) return 0;
  return steps.reduce((acc, step) => {
    const own = step.distanceKm ?? 0;
    const nested = sumRunStepDistance(step.subSteps);
    const base = nested > 0 ? nested : own;
    const multiplier = step.stepKind === 'repeat_block' && step.repeatCount ? step.repeatCount : 1;
    return acc + (base * multiplier);
  }, 0);
};

const formatSessionDate = (dateIso: string): string =>
  new Date(dateIso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

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

const DayCard = ({
  session,
  isExpanded,
  onToggle,
  canDrag = false,
  dragHandleProps,
}: {
  session: UnifiedSession;
  isExpanded: boolean;
  onToggle: () => void;
  canDrag?: boolean;
  dragHandleProps?: Record<string, unknown>;
}) => {
  const hasRun = !!session.run;
  const hasPhysio = !!session.physio;
  const hasStrengthSlot = !!session.strengthSlot;
  const isRest = !hasRun && !hasPhysio && !hasStrengthSlot;
  const plannedDistanceKm = session.run?.plannedDistanceKm ?? parseDistanceKm(session.run?.description);
  const phaseDistanceKm = session.run
    ? sumRunStepDistance([
        ...(session.run.warmupSteps ?? []),
        ...(session.run.mainSteps ?? []),
        ...(session.run.cooldownSteps ?? []),
      ])
    : 0;
  const canonicalDistanceKm =
    plannedDistanceKm != null && phaseDistanceKm > 0 && Math.abs(phaseDistanceKm - plannedDistanceKm) > 0.25
      ? phaseDistanceKm
      : plannedDistanceKm;
  const compactMetric = hasRun
    ? canonicalDistanceKm
      ? `${canonicalDistanceKm.toFixed(canonicalDistanceKm >= 10 ? 0 : 1)} km`
      : (session.run?.duration ?? 'Run')
    : hasStrengthSlot
      ? 'Strength slot'
    : hasPhysio
      ? (session.physio?.duration ?? `${session.physio?.exercises.length ?? 0} exercises`)
      : 'Rest';
  const compactSubline = hasRun
    ? [session.run?.targetPace, session.run?.targetZone].filter(Boolean).join(' · ') || session.run?.description
    : hasStrengthSlot
      ? [session.strengthSlot?.focus, session.strengthSlot?.load, session.strengthSlot?.notes]
        .filter(Boolean)
        .join(' · ') || 'Coach-defined strength window.'
    : hasPhysio
      ? `${session.physio?.type ?? 'Physio'}${session.physio?.exercises.length ? ` · ${session.physio.exercises.length} exercises` : ''}`
      : (session.notes ?? 'Recovery day');
  const detailsId = `weekly-day-details-${session.date}`;

  const borderColor = hasRun
    ? (SESSION_TYPE_BORDER_COLORS[session.run!.type] ?? 'border-l-muted-foreground')
    : hasStrengthSlot
      ? 'border-l-secondary'
    : hasPhysio
      ? (SESSION_TYPE_BORDER_COLORS[session.physio!.type] ?? 'border-l-secondary')
      : 'border-l-muted-foreground';

  return (
    <div
      className={`border-3 border-border bg-background p-3 transition-all border-l-[6px] overflow-hidden min-w-0 ${
        isExpanded
          ? 'shadow-neo border-primary/60'
          : 'shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px]'
      } ${borderColor}`}
      role='article'
      aria-label={`${session.day} — ${session.date}`}
    >
      <div className='flex items-start gap-2'>
        <button
          type='button'
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${session.day} details`}
          className='flex-1 text-left min-w-0'
        >
          <div className='flex items-start justify-between gap-2'>
            <div className='flex items-center gap-2 shrink-0'>
              <span className='font-black text-sm uppercase tracking-wider'>
                {session.day}
              </span>
              <span className='text-[11px] text-muted-foreground font-bold'>
                {formatSessionDate(session.date)}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
          <div className='mt-2 flex flex-wrap items-center gap-1'>
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
            {hasStrengthSlot && (
              <span className='px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-secondary/10 text-secondary'>
                <Dumbbell className='h-3 w-3 inline mr-0.5 -mt-0.5' />
                strength slot
              </span>
            )}
            {isRest && (
              <span className='px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-muted text-muted-foreground'>
                <Moon className='h-3 w-3 inline mr-0.5 -mt-0.5' />
                rest
              </span>
            )}
            {session.status && (
              <span className='px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-primary/10 text-primary'>
                {session.status}
              </span>
            )}
          </div>
          <p className='mt-2 text-base font-black leading-none'>{compactMetric}</p>
          {compactSubline && (
            <p className='mt-1 text-xs text-muted-foreground font-medium line-clamp-2'>
              {compactSubline}
            </p>
          )}
        </button>
        <div className='shrink-0'>
          <button
            type='button'
            aria-label={
              canDrag
                ? `Drag ${session.day} workout to another day`
                : `${session.day} is locked and cannot be moved`
            }
            disabled={!canDrag}
            className='p-1 border-2 border-border bg-muted/40 text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed'
            {...(canDrag ? dragHandleProps : {})}
          >
            <GripVertical className='h-3 w-3' />
          </button>
        </div>
      </div>
      <div
        id={detailsId}
        className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
          isExpanded ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0 mt-0'
        }`}
      >
        <div className='overflow-hidden space-y-3'>
          {hasRun && (
            <div>
              <p className='text-sm font-medium leading-relaxed'>
                {session.run!.description}
              </p>
              <RunPhaseTable run={session.run!} />
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

          {hasRun && hasPhysio && (
            <div className='border-t-2 border-border/30' />
          )}

          {hasStrengthSlot && (
            <div>
              <div className='flex items-center gap-1.5 mb-2'>
                <Dumbbell className='h-3.5 w-3.5 text-secondary' />
                <span className='text-xs font-black uppercase tracking-wider text-secondary'>
                  Strength slot
                </span>
                {session.strengthSlot?.load && (
                  <span className='text-[10px] text-muted-foreground font-bold ml-auto uppercase'>
                    {session.strengthSlot.load}
                  </span>
                )}
              </div>
              {session.strengthSlot?.focus && (
                <p className='text-xs font-bold'>
                  Focus: {session.strengthSlot.focus}
                </p>
              )}
              <p className='text-xs text-muted-foreground font-medium mt-1'>
                {session.strengthSlot?.notes || 'Coach-defined window for strength work.'}
              </p>
            </div>
          )}

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

          {session.actualActivity && (
            <div className='border-2 border-border bg-muted/30 p-2 space-y-1'>
              <p className='text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
                Completed activity
              </p>
              <p className='text-xs font-bold'>
                {session.actualActivity.name}
              </p>
              <p className='text-xs text-muted-foreground font-medium'>
                {session.actualActivity.distanceKm.toFixed(1)} km · {Math.round(session.actualActivity.durationSec / 60)} min
              </p>
            </div>
          )}

          {session.compliance?.notes && (
            <p className='text-xs text-muted-foreground font-medium'>
              {session.compliance.notes}
            </p>
          )}

          {isRest && session.notes && (
            <p className='text-sm text-muted-foreground font-medium'>
              {session.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const moveSessionPayloadBetweenDays = (
  sessions: UnifiedSession[],
  fromDate: string,
  toDate: string,
): UnifiedSession[] => {
  const fromIndex = sessions.findIndex((session) => session.date === fromDate);
  const toIndex = sessions.findIndex((session) => session.date === toDate);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return sessions;
  }
  const next = [...sessions];
  const source = next[fromIndex];
  const target = next[toIndex];
  const sourcePayload = {
    run: source.run,
    physio: source.physio,
    strengthSlot: source.strengthSlot,
    notes: source.notes,
    blockIntent: source.blockIntent,
  };
  const targetPayload = {
    run: target.run,
    physio: target.physio,
    strengthSlot: target.strengthSlot,
    notes: target.notes,
    blockIntent: target.blockIntent,
  };
  next[fromIndex] = {...source, ...targetPayload};
  next[toIndex] = {...target, ...sourcePayload};
  return next;
};

const SortableDayCard = ({
  session,
  isLocked,
  isExpanded,
  onToggle,
  className,
}: {
  session: UnifiedSession;
  isLocked: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: session.date,
    disabled: isLocked,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`${isDragging ? 'opacity-70' : ''} ${className ?? ''}`}
    >
      <DayCard
        session={session}
        isExpanded={isExpanded}
        onToggle={onToggle}
        canDrag={!isLocked}
        dragHandleProps={{
          ...attributes,
          ...listeners,
        }}
      />
    </div>
  );
};

const EmptyState = ({
}: {
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
        No plan data yet. Ask Coach in AI Chat to create your weekly plan.
      </p>
    </div>
    <Link
      href='/ai-chat?quickAsk=1&action=create_weekly_plan'
      tabIndex={0}
      aria-label='Open AI chat to ask coach for a weekly plan'
      className='inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-black text-sm uppercase tracking-wider border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px]'
    >
      <MessageSquareText className='h-4 w-4' />
      Ask Coach in Chat
    </Link>
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
    href='/training-plan?tab=block'
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

interface WeeklyPlanProps {
  embedded?: boolean;
}

const WeeklyPlan = ({embedded = false}: WeeklyPlanProps) => {
  const router = useRouter();
  const {athlete} = useStravaAuth();
  const athleteId = athlete?.id ?? null;
  const {
    activePlan,
    plans,
    isLoading,
    activatePlan,
    deletePlan,
    lastError,
    reorderActivePlanSessions,
  } = useWeeklyPlan(athleteId);
  const {activeBlock} = useTrainingBlock(athleteId);
  const [fullPlanOpen, setFullPlanOpen] = useState(false);
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState(false);
  const [lockedSessionsOpen, setLockedSessionsOpen] = useState(false);
  const [weekContextOpen, setWeekContextOpen] = useState(true);
  const [distributionOpen, setDistributionOpen] = useState(false);
  const [deletePlanConfirmId, setDeletePlanConfirmId] = useState<string | null>(null);
  const [isDeletingPlan, setIsDeletingPlan] = useState(false);
  const [isSavingReorder, setIsSavingReorder] = useState(false);
  const [expandedSessionDate, setExpandedSessionDate] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 6}}));
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
  const weekAtGlance = useMemo(() => {
    if (!activePlan) return null;
    const runDays = activePlan.sessions.filter((session) => !!session.run).length;
    const physioDays = activePlan.sessions.filter((session) => !!session.physio).length;
    const strengthSlots = activePlan.sessions.filter((session) => !!session.strengthSlot).length;
    const restDays = activePlan.sessions.filter(
      (session) => !session.run && !session.physio && !session.strengthSlot,
    ).length;
    const hardRunDays = activePlan.sessions.filter((session) =>
      isHardSessionType(session.run?.type),
    ).length;
    return {
      runDays,
      physioDays,
      strengthSlots,
      restDays,
      hardRunDays,
    };
  }, [activePlan]);

  const loadLabel = useMemo<'Conservative load' | 'Balanced load' | 'High load'>(() => {
    if (!weekAtGlance) return 'Conservative load';
    if (weekAtGlance.hardRunDays >= 3) return 'High load';
    if (weekAtGlance.hardRunDays === 2) return 'Balanced load';
    return 'Conservative load';
  }, [weekAtGlance]);

  const todayIso = useMemo(() => toIsoDateInTimeZone(new Date(), CLIENT_TIMEZONE), []);
  const isSessionLocked = useCallback(
    (session: UnifiedSession) =>
      Boolean(session.actualActivity) || session.date < todayIso || isSavingReorder,
    [todayIso, isSavingReorder],
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

  const actionableSessions = useMemo(() => {
    if (!activePlan) return [];
    return activePlan.sessions.filter((session) => !isSessionLocked(session));
  }, [activePlan, isSessionLocked]);

  const lockedSessions = useMemo(() => {
    if (!activePlan) return [];
    return activePlan.sessions.filter((session) => isSessionLocked(session));
  }, [activePlan, isSessionLocked]);

  const nextActionableSessions = useMemo(
    () => actionableSessions.slice(0, 3),
    [actionableSessions],
  );


  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!activePlan || isSavingReorder) return;
      const {active, over} = event;
      const sourceDate = String(active.id);
      const targetDate = over ? String(over.id) : null;
      if (!targetDate || sourceDate === targetDate) return;
      const sourceSession = activePlan.sessions.find((session) => session.date === sourceDate);
      const targetSession = activePlan.sessions.find((session) => session.date === targetDate);
      if (!sourceSession || !targetSession) return;
      if (isSessionLocked(sourceSession) || isSessionLocked(targetSession)) return;
      const nextSessions = moveSessionPayloadBetweenDays(
        activePlan.sessions,
        sourceDate,
        targetDate,
      );
      if (nextSessions === activePlan.sessions) return;
      setIsSavingReorder(true);
      try {
        await reorderActivePlanSessions(nextSessions);
      } finally {
        setIsSavingReorder(false);
      }
    },
    [activePlan, isSavingReorder, isSessionLocked, reorderActivePlanSessions],
  );

  const handleToggleFullPlan = () => {
    setFullPlanOpen((prev) => !prev);
  };

  const handleToggleDayDetails = useCallback((sessionDate: string) => {
    setExpandedSessionDate((prev) => (prev === sessionDate ? null : sessionDate));
  }, []);

  const handleDeletePlanRequest = useCallback((planId: string) => {
    setDeletePlanConfirmId(planId);
  }, []);

  const handleDeletePlanConfirm = useCallback(async () => {
    if (!deletePlanConfirmId || isDeletingPlan) return;
    setIsDeletingPlan(true);
    try {
      await deletePlan(deletePlanConfirmId);
      setDeletePlanConfirmId(null);
    } finally {
      setIsDeletingPlan(false);
    }
  }, [deletePlan, deletePlanConfirmId, isDeletingPlan]);

  const planToDelete = useMemo(
    () => plans.find((plan) => plan.id === deletePlanConfirmId) ?? null,
    [deletePlanConfirmId, plans],
  );

  useEffect(() => {
    setExpandedSessionDate(null);
  }, [activePlan?.id]);

  const handleQuickAskCoach = useCallback(
    (action: WeeklyPlanQuickAskAction) => {
      if (!activePlan) return;
      const params = new URLSearchParams({
        quickAsk: '1',
        action,
        weekStart: activePlan.weekStart,
        title: activePlan.title,
      });
      router.push(`/ai-chat?${params.toString()}`);
    },
    [activePlan, router],
  );

  const handleOpenHistorySidebar = useCallback(() => {
    setIsHistorySidebarOpen(true);
  }, []);

  const handleCloseHistorySidebar = useCallback(() => {
    setIsHistorySidebarOpen(false);
  }, []);

  if (isLoading) {
    return (
      <div className='space-y-4 md:space-y-6'>
        {!embedded && (
          <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
            Weekly Plan
          </h1>
        )}
        <div className='border-3 border-border bg-background shadow-neo p-8 flex items-center justify-center'>
          <NeoLoader label='Loading plan' size='sm' />
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-4 md:space-y-6 min-w-0 max-w-full overflow-x-hidden'>
      {/* Page title */}
      {!embedded && (
        <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
          Weekly Plan
        </h1>
      )}

      {lastError && (
        <AiErrorBanner error={lastError} />
      )}

      {/* Empty state */}
      {!activePlan && (
        <div className='space-y-3'>
          <EmptyState />
          {plans.length > 0 && (
            <div className='border-3 border-border bg-background shadow-neo-sm p-4'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <p className='text-sm font-bold'>
                  No active plan selected. Choose one from history.
                </p>
                <button
                  onClick={handleOpenHistorySidebar}
                  tabIndex={0}
                  aria-label='Open plan history'
                  className='inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-background hover:bg-muted transition-colors'
                >
                  Open History
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active plan */}
      {activePlan && (
        <>
          <WeeklyDecisionHeader
            title={activePlan.title}
            summary={activePlan.summary}
            weekRange={formatWeekRange(activePlan.weekStart)}
            loadLabel={loadLabel}
            strategyLabel={activePlanStrategyMeta?.strategyLabel ?? 'Not specified'}
            priorityLabel={activePlanStrategyMeta?.optimizationPriorityLabel ?? 'Balanced progression'}
            weekMixLabel={`${weekAtGlance?.runDays ?? 0} runs · ${weekAtGlance?.strengthSlots ?? 0} strength slots · ${weekAtGlance?.restDays ?? 0} rest`}
            onOpenHistory={handleOpenHistorySidebar}
            historyCount={plans.length}
            quickAskOptions={WEEKLY_PLAN_QUICK_ASK_OPTIONS}
            onQuickAsk={handleQuickAskCoach}
          />

          {blockBannerData && (
            <div className='space-y-2'>
              <BlockContextBanner
                weekNumber={blockBannerData.weekNumber}
                totalWeeks={blockBannerData.totalWeeks}
                phaseName={blockBannerData.phaseName}
                goalEvent={blockBannerData.goalEvent}
              />
              {activePlan.sessions.some((session) => session.blockIntent) && (
                <div className='border-3 border-border bg-background shadow-neo-sm p-4 space-y-1'>
                  <p className='text-[10px] font-black uppercase tracking-widest text-primary'>
                    This week inside your block
                  </p>
                  <p className='text-sm font-medium'>
                    {activePlan.sessions.find((session) => session.blockIntent)?.blockIntent?.weekType} week with a target of{' '}
                    {activePlan.sessions.find((session) => session.blockIntent)?.blockIntent?.volumeTargetKm ?? 0} km.
                  </p>
                  <p className='text-xs text-muted-foreground font-medium'>
                    Key intent: {(activePlan.sessions.find((session) => session.blockIntent)?.blockIntent?.keyWorkouts ?? []).join(' · ') || 'Maintain quality sessions while preserving recovery.'}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className='border-3 border-border bg-background shadow-neo-sm p-4 space-y-3'>
            <div className='space-y-1'>
              <p className='text-[10px] font-black uppercase tracking-widest text-primary'>
                Weekly execution board
              </p>
              <p className='text-xs text-muted-foreground font-medium'>
                Actionable days first. Completed or locked days are grouped below.
              </p>
            </div>
            {nextActionableSessions.length > 0 && (
              <div className='md:hidden border-2 border-border bg-primary/5 p-2 space-y-1'>
                <p className='text-[10px] font-black uppercase tracking-widest text-primary'>
                  Next 3 actionable days
                </p>
                <p className='text-xs font-medium'>
                  {nextActionableSessions.map((session) => session.day).join(' · ')}
                </p>
              </div>
            )}
            <p className='text-[11px] font-bold uppercase tracking-widest text-muted-foreground'>
              Click a day to expand details. Drag unlocked cards by the grip handle to swap workouts.
            </p>
            <div className='md:hidden'>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={actionableSessions.map((session) => session.date)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className='space-y-3'>
                    {actionableSessions.map((session) => (
                      <SortableDayCard
                        key={session.date}
                        session={session}
                        isLocked={false}
                        isExpanded={expandedSessionDate === session.date}
                        onToggle={() => handleToggleDayDetails(session.date)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
            <div className='hidden md:block'>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={actionableSessions.map((session) => session.date)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className='flex gap-3 overflow-x-auto pb-1'>
                    {actionableSessions.map((session) => (
                      <SortableDayCard
                        key={session.date}
                        session={session}
                        isLocked={false}
                        isExpanded={expandedSessionDate === session.date}
                        onToggle={() => handleToggleDayDetails(session.date)}
                        className='w-[clamp(220px,23vw,280px)] shrink-0'
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
            <TrainingPlanPanel
              title={`Completed or Locked (${lockedSessions.length})`}
              open={lockedSessionsOpen}
              onToggle={() => setLockedSessionsOpen((prev) => !prev)}
            >
              <div className='space-y-3 md:hidden'>
                {lockedSessions.map((session) => (
                  <DayCard
                    key={session.date}
                    session={session}
                    isExpanded={expandedSessionDate === session.date}
                    onToggle={() => handleToggleDayDetails(session.date)}
                    canDrag={false}
                  />
                ))}
              </div>
              <div className='hidden md:flex gap-3 overflow-x-auto pb-1'>
                {lockedSessions.map((session) => (
                  <div key={session.date} className='w-[clamp(220px,23vw,280px)] shrink-0'>
                    <DayCard
                      session={session}
                      isExpanded={expandedSessionDate === session.date}
                      onToggle={() => handleToggleDayDetails(session.date)}
                      canDrag={false}
                    />
                  </div>
                ))}
              </div>
            </TrainingPlanPanel>
            {isSavingReorder && (
              <p className='text-xs text-muted-foreground font-medium'>
                Saving updated week order...
              </p>
            )}
          </div>

          <TrainingPlanPanel
            title='Why This Week Looks Like This'
            open={weekContextOpen}
            onToggle={() => setWeekContextOpen((prev) => !prev)}
          >
            <div className='space-y-3'>
              <div className='border-2 border-border bg-background p-3 space-y-2'>
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
                <div className='border-2 border-border bg-background p-3 space-y-2'>
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
            </div>
          </TrainingPlanPanel>

          {activePlanContent && (
            <TrainingPlanPanel
              title='Full AI Plan Narrative'
              open={fullPlanOpen}
              onToggle={handleToggleFullPlan}
            >
              <div className='prose-sm max-w-none overflow-hidden break-words'>
                <MarkdownContent content={activePlanContent} />
              </div>
            </TrainingPlanPanel>
          )}

          <TrainingPlanPanel
            title='Weekly Distribution'
            open={distributionOpen}
            onToggle={() => setDistributionOpen((prev) => !prev)}
          >
            <WeeklyPlanDistribution
              weekStart={activePlan.weekStart}
              sessions={activePlan.sessions}
            />
          </TrainingPlanPanel>

        </>
      )}

      <Sheet open={isHistorySidebarOpen} onOpenChange={setIsHistorySidebarOpen}>
        <SheetContent
          side='right'
          className='p-0 w-[320px] sm:max-w-[320px]'
          aria-describedby={undefined}
        >
          <SheetTitle className='sr-only'>Plan History</SheetTitle>
          <div className='flex flex-col h-full min-h-0'>
            <div className='px-3 py-2.5 border-b-3 border-border flex items-center justify-between bg-foreground text-background'>
              <span className='font-black text-xs uppercase tracking-widest'>
                Plan History ({plans.length})
              </span>
            </div>
            <div className='flex-1 overflow-y-auto p-2 space-y-1 bg-muted/20'>
              {plans.length === 0 ? (
                <div className='border-2 border-border bg-background px-3 py-4 text-center text-xs text-muted-foreground font-medium'>
                  No plans yet
                </div>
              ) : (
                plans.map((plan) => (
                  <PlanHistoryItem
                    key={plan.id}
                    plan={plan}
                    isActive={plan.isActive}
                    onActivate={() => {
                      activatePlan(plan.id);
                      handleCloseHistorySidebar();
                    }}
                    onDelete={() => handleDeletePlanRequest(plan.id)}
                  />
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!deletePlanConfirmId}
        onOpenChange={(open) => {
          if (!open && !isDeletingPlan) setDeletePlanConfirmId(null);
        }}
      >
        <AlertDialogContent className='border-3 border-border max-w-[320px] p-4 gap-3'>
          <AlertDialogHeader>
            <AlertDialogTitle className='font-black text-base'>
              Delete weekly plan?
            </AlertDialogTitle>
            <AlertDialogDescription className='text-sm text-muted-foreground space-y-2'>
              <span className='block'>
                This will permanently delete
                {planToDelete ? ` "${planToDelete.title}"` : ' this plan'}.
              </span>
              <span className='block font-bold text-foreground text-xs'>
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeletingPlan}
              className='border-2 border-border font-bold text-xs'
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePlanConfirm}
              disabled={isDeletingPlan}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90 border-2 border-border font-black text-xs'
            >
              {isDeletingPlan ? 'Deleting...' : 'Delete plan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WeeklyPlan;
