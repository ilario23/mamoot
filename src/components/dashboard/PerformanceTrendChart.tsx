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
  Legend,
} from 'recharts';
import {useAdvancedMetricsData} from '@/hooks/useStrava';
import {useIsMobile} from '@/hooks/use-mobile';
import {formatPace} from '@/lib/activityModel';

const PERIOD_OPTIONS = [
  {label: '8 weeks', value: 56},
  {label: '12 weeks', value: 84},
  {label: '24 weeks', value: 168},
] as const;

const PerformanceTrendChart = ({embedded = false}: {embedded?: boolean}) => {
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
  const hasThreshold = chartData.some((d) => d.thresholdPace != null);
  const hasEf = chartData.some((d) => d.efficiencyFactor != null);
  const formatPaceTick = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '—';
    const pace = formatPace(value);
    const [mins, secs = '00'] = pace.split(':');
    return `${mins}'${secs}"`;
  };

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
              Performance Trend
            </h3>
            <p className='text-xs font-bold text-muted-foreground'>
              Threshold pace and efficiency factor
            </p>
          </div>
        )}
        <select
          value={daysBack}
          onChange={(e) => setDaysBack(Number(e.target.value))}
          className='px-3 py-1.5 border-3 border-border font-bold text-xs uppercase tracking-wider bg-background focus:outline-none focus:ring-2 focus:ring-primary'
          aria-label='Select performance trend period'
        >
          {PERIOD_OPTIONS.map((period) => (
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
            tickFormatter={(value) =>
              new Date(value + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
            }
            tick={{fontWeight: 700, fontSize: 11}}
            stroke='#000'
          />
          <YAxis
            yAxisId='pace'
            tickFormatter={formatPaceTick}
            tick={{fontWeight: 700, fontSize: 11}}
            reversed
            domain={['auto', 'auto']}
          />
          <YAxis
            yAxisId='ef'
            orientation='right'
            tick={{fontWeight: 700, fontSize: 11}}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{border: '3px solid #000', borderRadius: 0, fontWeight: 700}}
            formatter={(value: number, name: string) => {
              if (name === 'thresholdPace') return [value ? `${formatPace(value)}/km` : '—', 'Threshold pace'];
              if (name === 'efficiencyFactor')
                return [value ? value.toFixed(4) : '—', 'Efficiency factor'];
              return [value, name];
            }}
          />
          <Legend
            formatter={(value) =>
              value === 'thresholdPace'
                ? 'Threshold pace'
                : value === 'efficiencyFactor'
                  ? 'Efficiency factor'
                  : value
            }
          />
          {hasThreshold && (
            <Line
              yAxisId='pace'
              type='monotone'
              dataKey='thresholdPace'
              stroke='hsl(312 100% 67%)'
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />
          )}
          {hasEf && (
            <Line
              yAxisId='ef'
              type='monotone'
              dataKey='efficiencyFactor'
              stroke='hsl(84 78% 55%)'
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PerformanceTrendChart;
