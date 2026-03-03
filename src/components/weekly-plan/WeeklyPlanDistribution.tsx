'use client';

import {CalendarDays, Dumbbell, Footprints, Moon} from 'lucide-react';
import type {UnifiedSession} from '@/lib/cacheTypes';
import {SESSION_TYPE_COLORS} from '@/lib/planConstants';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface WeeklyPlanDistributionProps {
  weekStart: string;
  sessions: UnifiedSession[];
}

interface DayDistribution {
  dayLabel: string;
  isoDate: string;
  session: UnifiedSession | null;
}

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

const buildWeekDays = (weekStart: string, sessions: UnifiedSession[]): DayDistribution[] => {
  const start = new Date(weekStart);
  const sessionByDate = new Map(sessions.map((session) => [session.date, session]));

  return WEEKDAY_LABELS.map((dayLabel, index) => {
    const dayDate = new Date(start);
    dayDate.setDate(start.getDate() + index);
    const isoDate = toIsoDate(dayDate);

    return {
      dayLabel,
      isoDate,
      session: sessionByDate.get(isoDate) ?? null,
    };
  });
};

const formatShortDate = (isoDate: string): string =>
  new Date(isoDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

const WeeklyPlanDistribution = ({weekStart, sessions}: WeeklyPlanDistributionProps) => {
  const weekDays = buildWeekDays(weekStart, sessions);
  const runDays = weekDays.filter((day) => day.session?.run).length;
  const physioDays = weekDays.filter((day) => day.session?.physio).length;
  const restDays = weekDays.filter((day) => !day.session?.run && !day.session?.physio).length;

  return (
    <section
      aria-label='Weekly planned activity distribution'
      className='border-3 border-border bg-background shadow-neo overflow-hidden'
    >
      <div className='p-4 md:p-5 border-b-3 border-border space-y-3'>
        <div className='flex items-center gap-2'>
          <CalendarDays className='h-4 w-4 text-primary' />
          <h3 className='font-black text-base md:text-lg uppercase tracking-wider'>
            Weekly Distribution
          </h3>
        </div>

        <div className='flex flex-wrap gap-2'>
          <span className='inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-secondary/10 text-secondary'>
            <Footprints className='h-3 w-3' />
            {runDays} run days
          </span>
          <span className='inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-primary/10 text-primary'>
            <Dumbbell className='h-3 w-3' />
            {physioDays} physio days
          </span>
          <span className='inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-muted text-muted-foreground'>
            <Moon className='h-3 w-3' />
            {restDays} rest days
          </span>
        </div>
      </div>

      <div className='p-4 md:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 md:gap-3'>
        {weekDays.map((day) => {
          const hasRun = !!day.session?.run;
          const hasPhysio = !!day.session?.physio;
          const isRest = !hasRun && !hasPhysio;

          return (
            <article
              key={day.isoDate}
              aria-label={`${day.dayLabel} plan distribution`}
              className='border-3 border-border bg-background p-3 space-y-2 min-w-0'
            >
              <div className='space-y-0.5'>
                <p className='text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
                  {day.dayLabel}
                </p>
                <p className='text-xs font-bold'>
                  {formatShortDate(day.isoDate)}
                </p>
              </div>

              <div className='flex flex-wrap gap-1.5'>
                {hasRun && day.session?.run && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border ${
                      SESSION_TYPE_COLORS[day.session.run.type] ?? 'bg-secondary/10 text-secondary'
                    }`}
                  >
                    <Footprints className='h-2.5 w-2.5' />
                    Run
                  </span>
                )}

                {hasPhysio && day.session?.physio && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border ${
                      SESSION_TYPE_COLORS[day.session.physio.type] ?? 'bg-primary/10 text-primary'
                    }`}
                  >
                    <Dumbbell className='h-2.5 w-2.5' />
                    Physio
                  </span>
                )}

                {isRest && (
                  <span className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-muted text-muted-foreground'>
                    <Moon className='h-2.5 w-2.5' />
                    Rest
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default WeeklyPlanDistribution;
