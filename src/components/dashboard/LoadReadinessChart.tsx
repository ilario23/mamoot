'use client';

import {useMemo, useState} from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import {useAdvancedMetricsData} from '@/hooks/useStrava';
import {useIsMobile} from '@/hooks/use-mobile';

const PERIODS = [
  {label: '6 weeks', value: 42},
  {label: '12 weeks', value: 84},
  {label: '24 weeks', value: 168},
] as const;

const formatTickDate = (dateStr: string): string =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

const LoadReadinessChart = ({embedded = false}: {embedded?: boolean}) => {
  const metrics = useAdvancedMetricsData();
  const isMobile = useIsMobile();
  const [daysBack, setDaysBack] = useState(84);

  const chartData = useMemo(() => {
    if (metrics.length === 0) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return metrics.filter((m) => m.date >= cutoffStr);
  }, [metrics, daysBack]);

  if (chartData.length === 0) return null;
  const tickInterval = Math.max(1, Math.floor(chartData.length / 10));

  return (
    <div
      className={
        embedded ? '' : 'border-3 border-border p-5 bg-background shadow-neo'
      }
    >
      <div className='flex items-center justify-between gap-3 mb-4'>
        {!embedded && (
          <div>
            <h3 className='font-black text-lg uppercase tracking-wider'>
              Load & Readiness
            </h3>
            <p className='text-xs font-bold text-muted-foreground'>
              CTL / ATL / TSB trends
            </p>
          </div>
        )}
        <select
          value={daysBack}
          onChange={(e) => setDaysBack(Number(e.target.value))}
          className='px-3 py-1.5 border-3 border-border font-bold text-xs uppercase tracking-wider bg-background focus:outline-none focus:ring-2 focus:ring-primary'
          aria-label='Select load readiness period'
        >
          {PERIODS.map((period) => (
            <option key={period.value} value={period.value}>
              {period.label}
            </option>
          ))}
        </select>
      </div>
      <ResponsiveContainer
        width='100%'
        height={embedded ? (isMobile ? 220 : 280) : isMobile ? 250 : 320}
      >
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray='0' stroke='#000' strokeOpacity={0.1} />
          <XAxis
            dataKey='date'
            tickFormatter={formatTickDate}
            interval={tickInterval}
            tick={{fontWeight: 700, fontSize: 11}}
            stroke='#000'
            strokeWidth={2}
          />
          <YAxis tick={{fontWeight: 700, fontSize: 11}} stroke='#000' />
          <Tooltip
            contentStyle={{
              border: '3px solid #000',
              borderRadius: 0,
              fontWeight: 700,
            }}
          />
          <ReferenceArea y1={-25} y2={-12} fill='hsl(0 84% 60%)' fillOpacity={0.08} />
          <ReferenceArea y1={-12} y2={8} fill='hsl(84 78% 55%)' fillOpacity={0.1} />
          <ReferenceLine y={0} stroke='#000' strokeOpacity={0.25} />
          <Line
            type='monotone'
            dataKey='ctl'
            name='CTL'
            stroke='hsl(217 91% 60%)'
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            type='monotone'
            dataKey='atl'
            name='ATL'
            stroke='hsl(0 84% 60%)'
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            type='monotone'
            dataKey='tsb'
            name='TSB'
            stroke='hsl(48 96% 53%)'
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default LoadReadinessChart;
