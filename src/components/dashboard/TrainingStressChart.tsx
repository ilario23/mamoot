'use client';

import {useMemo} from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {useAdvancedMetricsData} from '@/hooks/useStrava';
import {useIsMobile} from '@/hooks/use-mobile';

const getWeekStart = (isoDate: string): string => {
  const d = new Date(isoDate + 'T00:00:00');
  const day = d.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
};

const TrainingStressChart = ({embedded = false}: {embedded?: boolean}) => {
  const metrics = useAdvancedMetricsData();
  const isMobile = useIsMobile();

  const weeklyData = useMemo(() => {
    if (metrics.length === 0) return [];
    const grouped = new Map<string, {strain: number; monotony: number; rampRate: number}>();

    for (const point of metrics) {
      const week = getWeekStart(point.date);
      grouped.set(week, {
        strain: point.strain,
        monotony: point.monotony,
        rampRate: point.rampRate,
      });
    }

    return Array.from(grouped.entries())
      .map(([week, values]) => ({week, ...values}))
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-12);
  }, [metrics]);

  if (weeklyData.length === 0) return null;

  return (
    <div
      className={
        embedded ? '' : 'border-3 border-border p-5 bg-background shadow-neo'
      }
    >
      {!embedded && (
        <div className='mb-4'>
          <h3 className='font-black text-lg uppercase tracking-wider'>
            Stress Structure
          </h3>
          <p className='text-xs font-bold text-muted-foreground'>
            Weekly strain, monotony, and ramp rate
          </p>
        </div>
      )}
      <ResponsiveContainer
        width='100%'
        height={embedded ? (isMobile ? 220 : 280) : isMobile ? 250 : 320}
      >
        <ComposedChart data={weeklyData}>
          <CartesianGrid strokeDasharray='0' stroke='#000' strokeOpacity={0.1} />
          <XAxis
            dataKey='week'
            tickFormatter={(value) =>
              new Date(value + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
            }
            tick={{fontWeight: 700, fontSize: 11}}
            stroke='#000'
          />
          <YAxis yAxisId='left' tick={{fontWeight: 700, fontSize: 11}} />
          <YAxis yAxisId='right' orientation='right' tick={{fontWeight: 700, fontSize: 11}} />
          <Tooltip
            contentStyle={{border: '3px solid #000', borderRadius: 0, fontWeight: 700}}
          />
          <Legend />
          <Bar
            yAxisId='left'
            dataKey='strain'
            name='Strain'
            fill='hsl(217 91% 60%)'
            opacity={0.75}
          />
          <Line
            yAxisId='right'
            type='monotone'
            dataKey='monotony'
            name='Monotony'
            stroke='hsl(0 84% 60%)'
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId='right'
            type='monotone'
            dataKey='rampRate'
            name='Ramp %'
            stroke='hsl(84 78% 55%)'
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TrainingStressChart;
