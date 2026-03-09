'use client';

import {BarChart3, Link2, TrendingUp} from 'lucide-react';
import {Area, AreaChart, CartesianGrid, XAxis, YAxis} from 'recharts';
import {ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent} from '@/components/ui/chart';
import type {WeekOutline} from '@/lib/cacheTypes';
import {ZONE_COLORS, ZONE_NAMES} from '@/lib/activityModel';

interface LinkedWeekPlanRef {
  id: string;
  title: string;
  weekStart: string;
}

interface BlockPeriodizationOverviewProps {
  weekOutlines: WeekOutline[];
  linkedWeekPlanByWeek: Record<number, LinkedWeekPlanRef>;
  onOpenLinkedWeekPlan: (planId: string) => void;
}

const chartConfig = {
  z1: {label: `Z1 ${ZONE_NAMES[1]}`, color: ZONE_COLORS[1]},
  z2: {label: `Z2 ${ZONE_NAMES[2]}`, color: ZONE_COLORS[2]},
  z3: {label: `Z3 ${ZONE_NAMES[3]}`, color: ZONE_COLORS[3]},
  z4: {label: `Z4 ${ZONE_NAMES[4]}`, color: ZONE_COLORS[4]},
  z5: {label: `Z5 ${ZONE_NAMES[5]}`, color: ZONE_COLORS[5]},
  z6: {label: `Z6 ${ZONE_NAMES[6]}`, color: ZONE_COLORS[6]},
};

const getZoneMix = (outline: WeekOutline) => {
  if (outline.weekType === 'recovery' || outline.weekType === 'off-load') {
    return {z1: 35, z2: 35, z3: 20, z4: 7, z5: 2, z6: 1};
  }
  if (outline.weekType === 'race') {
    return {z1: 10, z2: 20, z3: 20, z4: 20, z5: 20, z6: 10};
  }
  if (outline.weekType === 'taper') {
    return {z1: 25, z2: 30, z3: 20, z4: 15, z5: 7, z6: 3};
  }
  if (outline.intensityLevel === 'high') {
    return {z1: 15, z2: 25, z3: 25, z4: 18, z5: 12, z6: 5};
  }
  if (outline.intensityLevel === 'moderate') {
    return {z1: 20, z2: 30, z3: 25, z4: 15, z5: 7, z6: 3};
  }
  return {z1: 30, z2: 35, z3: 20, z4: 10, z5: 4, z6: 1};
};

const getSessionMix = (outline: WeekOutline) => {
  if (outline.weekType === 'recovery' || outline.weekType === 'off-load') {
    return {easy: 45, tempo: 0, interval: 0, long: 35, recovery: 20};
  }
  if (outline.weekType === 'race') {
    return {easy: 15, tempo: 20, interval: 25, long: 20, recovery: 20};
  }
  if (outline.intensityLevel === 'high') {
    return {easy: 18, tempo: 22, interval: 24, long: 30, recovery: 6};
  }
  if (outline.intensityLevel === 'moderate') {
    return {easy: 24, tempo: 20, interval: 18, long: 30, recovery: 8};
  }
  return {easy: 32, tempo: 15, interval: 10, long: 33, recovery: 10};
};

const BlockPeriodizationOverview = ({
  weekOutlines,
  linkedWeekPlanByWeek,
  onOpenLinkedWeekPlan,
}: BlockPeriodizationOverviewProps) => {
  const zoneTrendData = weekOutlines.map((outline) => ({
    week: `W${outline.weekNumber}`,
    ...getZoneMix(outline),
  }));

  return (
    <div className='space-y-4'>
      <section className='border-3 border-border bg-background shadow-neo-sm p-4 space-y-3 overflow-hidden'>
        <div className='flex items-center gap-2'>
          <TrendingUp className='h-4 w-4 text-primary' />
          <h3 className='font-black text-sm uppercase tracking-wider'>
            Zone Distribution Trend
          </h3>
        </div>
        <ChartContainer config={chartConfig} className='h-[220px] w-full'>
          <AreaChart data={zoneTrendData}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey='week' tickLine={false} axisLine={false} />
            <YAxis
              domain={[0, 100]}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
            />
            <ChartTooltip content={<ChartTooltipContent indicator='line' />} />
            <Area type='monotone' dataKey='z1' stackId='zones' stroke='var(--color-z1)' fill='var(--color-z1)' fillOpacity={0.8} />
            <Area type='monotone' dataKey='z2' stackId='zones' stroke='var(--color-z2)' fill='var(--color-z2)' fillOpacity={0.8} />
            <Area type='monotone' dataKey='z3' stackId='zones' stroke='var(--color-z3)' fill='var(--color-z3)' fillOpacity={0.8} />
            <Area type='monotone' dataKey='z4' stackId='zones' stroke='var(--color-z4)' fill='var(--color-z4)' fillOpacity={0.8} />
            <Area type='monotone' dataKey='z5' stackId='zones' stroke='var(--color-z5)' fill='var(--color-z5)' fillOpacity={0.8} />
            <Area type='monotone' dataKey='z6' stackId='zones' stroke='var(--color-z6)' fill='var(--color-z6)' fillOpacity={0.8} />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </section>

      <section className='border-3 border-border bg-background shadow-neo-sm p-4 space-y-3 overflow-hidden'>
        <div className='flex items-center gap-2'>
          <BarChart3 className='h-4 w-4 text-primary' />
          <h3 className='font-black text-sm uppercase tracking-wider'>
            Weekly Volume
          </h3>
        </div>
        <div className='space-y-2'>
          {weekOutlines.map((outline) => {
            const mix = getSessionMix(outline);
            const linkedPlan = linkedWeekPlanByWeek[outline.weekNumber];
            return (
              <div key={outline.weekNumber} className='grid grid-cols-[42px_1fr_auto] items-center gap-3'>
                <div className='text-xs font-black uppercase tracking-wider'>
                  W{outline.weekNumber}
                </div>
                <button
                  type='button'
                  disabled={!linkedPlan}
                  onClick={() => linkedPlan && onOpenLinkedWeekPlan(linkedPlan.id)}
                  className={`h-6 w-full border-2 border-border overflow-hidden rounded-sm flex ${
                    linkedPlan
                      ? 'cursor-pointer hover:shadow-neo-sm transition-all'
                      : 'cursor-default'
                  }`}
                  aria-label={
                    linkedPlan
                      ? `Open linked weekly plan for week ${outline.weekNumber}`
                      : `Week ${outline.weekNumber} has no linked weekly plan`
                  }
                >
                  <span style={{width: `${mix.easy}%`}} className='bg-zone-2/80 h-full' />
                  <span style={{width: `${mix.tempo}%`}} className='bg-zone-3/80 h-full' />
                  <span style={{width: `${mix.interval}%`}} className='bg-zone-4/80 h-full' />
                  <span style={{width: `${mix.long}%`}} className='bg-primary/70 h-full' />
                  <span style={{width: `${mix.recovery}%`}} className='bg-zone-1/80 h-full' />
                </button>
                <div className='flex items-center gap-2'>
                  <span className='text-xs font-bold whitespace-nowrap'>{outline.volumeTargetKm} km</span>
                  {linkedPlan && (
                    <button
                      type='button'
                      onClick={() => onOpenLinkedWeekPlan(linkedPlan.id)}
                      className='inline-flex items-center gap-1 px-1.5 py-1 text-[10px] font-black uppercase tracking-wider border border-border bg-primary/10 text-primary hover:bg-primary/20'
                      aria-label={`Open linked plan ${linkedPlan.title}`}
                    >
                      <Link2 className='h-3 w-3' />
                      linked
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className='flex flex-wrap gap-3 text-[10px] font-bold text-muted-foreground'>
          <span className='inline-flex items-center gap-1'><span className='h-2 w-2 bg-zone-2/80' />Easy</span>
          <span className='inline-flex items-center gap-1'><span className='h-2 w-2 bg-zone-3/80' />Tempo</span>
          <span className='inline-flex items-center gap-1'><span className='h-2 w-2 bg-zone-4/80' />Interval</span>
          <span className='inline-flex items-center gap-1'><span className='h-2 w-2 bg-primary/70' />Long</span>
          <span className='inline-flex items-center gap-1'><span className='h-2 w-2 bg-zone-1/80' />Recovery</span>
        </div>
      </section>
    </div>
  );
};

export default BlockPeriodizationOverview;
