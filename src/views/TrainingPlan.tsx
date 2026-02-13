'use client';

import {useState, useMemo} from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Target,
  Calendar,
  Clock,
  Gauge,
  ChevronLeft,
  ChevronRight,
  Bot,
  Zap,
  ChevronDown,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {NeoLoader} from '@/components/ui/neo-loader';
import {useCoachPlan} from '@/hooks/useCoachPlan';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {SESSION_TYPE_COLORS, SESSION_TYPE_BORDER_COLORS} from '@/lib/planConstants';
import type {PlanSession} from '@/lib/cacheTypes';

// ----- Week grouping helpers -----

/** Get ISO week number from a date string */
const getISOWeek = (dateStr: string): number => {
  const date = new Date(dateStr);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

/** Group sessions into weeks */
const groupSessionsByWeek = (sessions: PlanSession[]): PlanSession[][] => {
  if (sessions.length === 0) return [];

  const hasAllDates = sessions.every((s) => !!s.date);

  if (hasAllDates) {
    // Group by ISO week
    const weekMap = new Map<number, PlanSession[]>();
    for (const session of sessions) {
      const week = getISOWeek(session.date!);
      const existing = weekMap.get(week) ?? [];
      existing.push(session);
      weekMap.set(week, existing);
    }
    return Array.from(weekMap.values());
  }

  // Fallback: chunk into groups of 7
  const weeks: PlanSession[][] = [];
  for (let i = 0; i < sessions.length; i += 7) {
    weeks.push(sessions.slice(i, i + 7));
  }
  return weeks;
};

// ----- Session card -----

const SessionCard = ({session, index}: {session: PlanSession; index: number}) => {
  const borderColor = SESSION_TYPE_BORDER_COLORS[session.type] ?? 'border-l-muted-foreground';
  const badgeColor = SESSION_TYPE_COLORS[session.type] ?? 'bg-muted text-foreground';

  return (
    <div
      className={`border-3 border-border bg-background shadow-neo-sm p-4 transition-all hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] border-l-[6px] ${borderColor}`}
      role='article'
      aria-label={`${session.day} — ${session.type}: ${session.description}`}
    >
      {/* Day + type badge row */}
      <div className='flex items-center justify-between gap-2 mb-2'>
        <span className='font-black text-sm uppercase tracking-wider truncate'>
          {session.day}
        </span>
        <span
          className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider shrink-0 border-2 border-border ${badgeColor}`}
        >
          {session.type}
        </span>
      </div>

      {/* Date */}
      {session.date && (
        <div className='flex items-center gap-1 text-[11px] text-muted-foreground font-bold mb-2'>
          <Calendar className='h-3 w-3 shrink-0' />
          {new Date(session.date).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </div>
      )}

      {/* Description */}
      <p className='text-sm font-medium leading-relaxed'>{session.description}</p>

      {/* Detail pills */}
      {(session.duration || session.targetPace || session.targetZone) && (
        <div className='flex flex-wrap gap-1.5 mt-3'>
          {session.duration && (
            <span className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-muted border-2 border-border'>
              <Clock className='h-2.5 w-2.5' />
              {session.duration}
            </span>
          )}
          {session.targetPace && (
            <span className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-secondary/10 text-secondary border-2 border-border'>
              <Gauge className='h-2.5 w-2.5' />
              {session.targetPace}
            </span>
          )}
          {session.targetZone && (
            <span className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border-2 border-border'>
              <Zap className='h-2.5 w-2.5' />
              {session.targetZone}
            </span>
          )}
        </div>
      )}

      {/* Notes */}
      {session.notes && (
        <p className='text-xs text-muted-foreground font-medium mt-2 italic border-t-2 border-border/30 pt-2'>
          {session.notes}
        </p>
      )}
    </div>
  );
};

// ----- Empty state -----

const EmptyState = () => (
  <div className='border-3 border-border bg-background shadow-neo p-8 md:p-12 text-center space-y-4'>
    <div className='w-16 h-16 mx-auto bg-muted border-3 border-border shadow-neo-sm flex items-center justify-center'>
      <ClipboardList className='h-8 w-8 text-muted-foreground' />
    </div>
    <div className='space-y-1'>
      <h2 className='font-black text-lg uppercase tracking-wider'>
        No Active Plan
      </h2>
      <p className='text-sm text-muted-foreground font-medium max-w-sm mx-auto'>
        Ask the AI Coach to create a training plan for you. Once shared and activated, it will appear here.
      </p>
    </div>
    <Link
      href='/ai-chat'
      tabIndex={0}
      aria-label='Go to AI Coach chat'
      className='inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-black text-sm uppercase tracking-wider border-3 border-border shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px]'
    >
      <Bot className='h-4 w-4' />
      Talk to Coach
    </Link>
  </div>
);

// ----- Markdown renderer -----

const MarkdownContent = ({content}: {content: string}) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      table: ({children}) => (
        <table className='w-full border-collapse border-3 border-border text-sm'>
          {children}
        </table>
      ),
      th: ({children}) => (
        <th className='border-2 border-border px-3 py-2 bg-muted font-black text-xs uppercase tracking-wider text-left'>
          {children}
        </th>
      ),
      td: ({children}) => (
        <td className='border-2 border-border px-3 py-2'>{children}</td>
      ),
    }}
  >
    {content}
  </ReactMarkdown>
);

// ----- Main view -----

const TrainingPlan = () => {
  const {athlete} = useStravaAuth();
  const athleteId = athlete?.id ?? null;
  const {activePlan, isLoading} = useCoachPlan(athleteId);
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
  const [fullPlanOpen, setFullPlanOpen] = useState(false);

  const weeks = useMemo(() => {
    if (!activePlan) return [];
    return groupSessionsByWeek(activePlan.sessions);
  }, [activePlan]);

  const totalWeeks = weeks.length;
  const currentSessions = weeks[currentWeekIndex] ?? [];

  const handlePrevWeek = () => {
    setCurrentWeekIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextWeek = () => {
    setCurrentWeekIndex((prev) => Math.min(totalWeeks - 1, prev + 1));
  };

  const handleToggleFullPlan = () => {
    setFullPlanOpen((prev) => !prev);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className='space-y-4 md:space-y-6'>
        <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
          Training Plan
        </h1>
        <div className='border-3 border-border bg-background shadow-neo p-8 flex items-center justify-center'>
          <NeoLoader label='Loading plan' size='sm' />
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-4 md:space-y-6'>
      {/* Page title */}
      <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
        Training Plan
      </h1>

      {/* Empty state */}
      {!activePlan && <EmptyState />}

      {/* Active plan */}
      {activePlan && (
        <>
          {/* Plan header card */}
          <div className='border-3 border-border bg-background shadow-neo border-l-[6px] border-l-primary p-5 md:p-6 space-y-3'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0 space-y-1'>
                <span className='font-black text-[10px] uppercase tracking-widest text-primary flex items-center gap-1'>
                  <ClipboardList className='h-3 w-3' />
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
              <div className='shrink-0 text-right'>
                <span className='text-[10px] font-black uppercase tracking-wider text-muted-foreground block'>
                  Created
                </span>
                <span className='text-xs font-bold'>
                  {new Date(activePlan.sharedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>

            {/* Meta pills */}
            {(activePlan.goal || activePlan.durationWeeks) && (
              <div className='flex flex-wrap gap-2'>
                {activePlan.goal && (
                  <span className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-3 border-border bg-accent/20 text-accent-foreground shadow-neo-sm'>
                    <Target className='h-3 w-3' />
                    {activePlan.goal}
                  </span>
                )}
                {activePlan.durationWeeks && (
                  <span className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-3 border-border bg-secondary/10 text-secondary shadow-neo-sm'>
                    <Calendar className='h-3 w-3' />
                    {activePlan.durationWeeks} Weeks
                  </span>
                )}
                <span className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-3 border-border bg-muted shadow-neo-sm'>
                  <ClipboardList className='h-3 w-3' />
                  {activePlan.sessions.length} Sessions
                </span>
              </div>
            )}
          </div>

          {/* Week pagination + sessions */}
          {activePlan.sessions.length > 0 && (
            <div className='space-y-4'>
              {/* Week pagination controls */}
              {totalWeeks > 1 && (
                <div className='flex items-center justify-between gap-3'>
                  <button
                    onClick={handlePrevWeek}
                    disabled={currentWeekIndex === 0}
                    aria-label='Previous week'
                    tabIndex={0}
                    className='flex items-center gap-1.5 px-4 py-2.5 font-black text-xs uppercase tracking-wider border-3 border-border bg-background shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none'
                  >
                    <ChevronLeft className='h-4 w-4' />
                    Prev
                  </button>

                  <div className='flex items-center gap-2'>
                    <span className='font-black text-sm md:text-base uppercase tracking-wider'>
                      Week {currentWeekIndex + 1}
                    </span>
                    <span className='text-muted-foreground font-bold text-xs'>
                      of {totalWeeks}
                    </span>
                  </div>

                  <button
                    onClick={handleNextWeek}
                    disabled={currentWeekIndex === totalWeeks - 1}
                    aria-label='Next week'
                    tabIndex={0}
                    className='flex items-center gap-1.5 px-4 py-2.5 font-black text-xs uppercase tracking-wider border-3 border-border bg-background shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none'
                  >
                    Next
                    <ChevronRight className='h-4 w-4' />
                  </button>
                </div>
              )}

              {/* Week progress bar */}
              {totalWeeks > 1 && (
                <div className='flex gap-1'>
                  {Array.from({length: totalWeeks}).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentWeekIndex(i)}
                      aria-label={`Go to week ${i + 1}`}
                      tabIndex={0}
                      className={`flex-1 h-2 border-2 border-border transition-all ${
                        i === currentWeekIndex
                          ? 'bg-primary shadow-neo-sm'
                          : i < currentWeekIndex
                            ? 'bg-primary/30'
                            : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Session cards grid */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4'>
                {currentSessions.map((session, index) => (
                  <SessionCard
                    key={`${currentWeekIndex}-${index}`}
                    session={session}
                    index={index}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Full plan markdown content */}
          {activePlan.content && (
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
                <div className='px-4 pb-4 md:px-5 md:pb-5 prose-sm max-w-none overflow-x-auto'>
                  <MarkdownContent content={activePlan.content} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TrainingPlan;
