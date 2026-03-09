'use client';

import {AlertTriangle, CalendarDays, Menu, Sparkles, Target} from 'lucide-react';
import type {WeeklyPlanQuickAskOption, WeeklyPlanQuickAskAction} from '@/lib/weeklyPlanQuickAsk';

interface WeeklyDecisionHeaderProps {
  title: string;
  summary: string | null;
  weekRange: string;
  loadLabel: 'Conservative load' | 'Balanced load' | 'High load';
  strategyLabel: string;
  priorityLabel: string;
  weekMixLabel: string;
  onOpenHistory: () => void;
  historyCount: number;
  quickAskOptions?: WeeklyPlanQuickAskOption[];
  onQuickAsk?: (action: WeeklyPlanQuickAskAction) => void;
}

const WeeklyDecisionHeader = ({
  title,
  summary,
  weekRange,
  loadLabel,
  strategyLabel,
  priorityLabel,
  weekMixLabel,
  onOpenHistory,
  historyCount,
  quickAskOptions = [],
  onQuickAsk,
}: WeeklyDecisionHeaderProps) => {
  const loadStyle =
    loadLabel === 'High load'
      ? 'bg-destructive/10 text-destructive'
      : loadLabel === 'Balanced load'
        ? 'bg-secondary/10 text-secondary'
        : 'bg-zone-1/20 text-zone-1';

  return (
    <section className='md:static sticky top-0 z-10 border-3 border-border bg-background shadow-neo p-4 md:p-5 space-y-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <span className='inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-secondary/10 text-secondary'>
            <CalendarDays className='h-3 w-3' />
            {weekRange}
          </span>
          <span className='font-black text-[10px] uppercase tracking-widest text-primary'>
            Coach Console
          </span>
          <h2 className='font-black text-lg md:text-2xl uppercase tracking-tight leading-tight'>
            {title}
          </h2>
          {summary && (
            <p className='text-sm text-muted-foreground font-medium leading-relaxed'>
              {summary}
            </p>
          )}
        </div>
        <div className='flex items-center gap-2 shrink-0'>
          <button
            onClick={onOpenHistory}
            className='inline-flex items-center gap-1.5 px-2.5 py-2 text-muted-foreground hover:text-primary hover:bg-primary/10 border-2 border-border transition-all'
            aria-label='Open plan history'
          >
            <Menu className='h-4 w-4' />
            <span className='hidden md:inline text-[10px] font-black uppercase tracking-wider'>
              History ({historyCount})
            </span>
          </button>
        </div>
      </div>

      <div className='flex flex-wrap gap-2'>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-border ${loadStyle}`}>
          <AlertTriangle className='h-3 w-3' />
          {loadLabel}
        </span>
        <span className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-border bg-muted'>
          {weekMixLabel}
        </span>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
        <div className='border-2 border-border bg-muted/40 px-3 py-2'>
          <p className='text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
            Strategy
          </p>
          <p className='text-sm font-bold'>{strategyLabel}</p>
        </div>
        <div className='border-2 border-border bg-muted/40 px-3 py-2'>
          <p className='text-[10px] font-black uppercase tracking-widest text-muted-foreground'>
            Priority
          </p>
          <p className='text-sm font-bold inline-flex items-center gap-1.5'>
            <Target className='h-3.5 w-3.5 text-primary' />
            {priorityLabel}
          </p>
        </div>
      </div>

      {quickAskOptions.length > 0 && onQuickAsk && (
        <div className='space-y-2'>
          <p className='text-[10px] font-black uppercase tracking-widest text-primary'>
            Quick Ask Coach
          </p>
          <div className='flex flex-wrap gap-2'>
            {quickAskOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => onQuickAsk(option.id)}
                aria-label={`Ask coach to ${option.label.toLowerCase()}`}
                className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-border bg-background hover:bg-primary/10 transition-colors'
              >
                {option.id === 'regenerate' && (
                  <Sparkles className='h-3 w-3' />
                )}
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default WeeklyDecisionHeader;
