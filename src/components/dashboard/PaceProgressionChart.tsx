'use client';

import {useMemo, useState} from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from 'recharts';
import {formatPace} from '@/lib/mockData';
import {useActivities} from '@/hooks/useStrava';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {Loader2} from 'lucide-react';

const PERIOD_OPTIONS = [
  {label: '3 months', value: 90},
  {label: '6 months', value: 180},
  {label: '1 year', value: 365},
] as const;

interface PaceDataPoint {
  date: string;
  dateTs: number; // timestamp for X axis
  avgPace: number; // min/km
  distance: number; // km — for dot size
  name: string;
}

interface TrendPoint {
  dateTs: number;
  trend: number;
}

/** Simple linear regression to compute trend line */
const linearRegression = (
  points: {x: number; y: number}[],
): {slope: number; intercept: number} => {
  const n = points.length;
  if (n === 0) return {slope: 0, intercept: 0};

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return {slope: 0, intercept: sumY / n};

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return {slope, intercept};
};

const PaceProgressionChart = () => {
  const {isAuthenticated} = useStravaAuth();
  const {data: activities, isLoading} = useActivities();
  const [daysBack, setDaysBack] = useState(180);

  const {scatterData, trendData, yDomain} = useMemo(() => {
    const empty = {
      scatterData: [] as PaceDataPoint[],
      trendData: [] as TrendPoint[],
      yDomain: [0, 10] as [number, number],
    };
    if (!activities || activities.length === 0) return empty;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);

    // Only include runs with pace data
    const runs = activities.filter((a) => {
      if (a.type !== 'Run') return false;
      if (a.avgPace <= 0 || a.avgPace > 15) return false; // filter outliers
      return new Date(a.date) >= cutoff;
    });

    if (runs.length === 0) return empty;

    const scatter: PaceDataPoint[] = runs.map((r) => ({
      date: r.date,
      dateTs: new Date(r.date + 'T00:00:00').getTime(),
      avgPace: Number(r.avgPace.toFixed(2)),
      distance: r.distance,
      name: r.name,
    }));

    // Sort by date
    scatter.sort((a, b) => a.dateTs - b.dateTs);

    // Linear regression for trend line
    const regressionPoints = scatter.map((p) => ({
      x: p.dateTs,
      y: p.avgPace,
    }));
    const {slope, intercept} = linearRegression(regressionPoints);

    const trend: TrendPoint[] = [
      {
        dateTs: scatter[0].dateTs,
        trend: Number((slope * scatter[0].dateTs + intercept).toFixed(2)),
      },
      {
        dateTs: scatter[scatter.length - 1].dateTs,
        trend: Number(
          (slope * scatter[scatter.length - 1].dateTs + intercept).toFixed(2),
        ),
      },
    ];

    // Y domain with some padding
    const allPaces = scatter.map((p) => p.avgPace);
    const minPace = Math.floor(Math.min(...allPaces) - 0.5);
    const maxPace = Math.ceil(Math.max(...allPaces) + 0.5);

    return {
      scatterData: scatter,
      trendData: trend,
      yDomain: [minPace, maxPace] as [number, number],
    };
  }, [activities, daysBack]);

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className='border-3 border-border p-5 bg-background shadow-neo flex items-center justify-center min-h-[300px]'>
        <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
      </div>
    );
  }

  if (scatterData.length === 0) return null;

  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDaysBack(Number(e.target.value));
  };

  const formatXTick = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  };

  const formatYTick = (pace: number) => formatPace(pace);

  return (
    <div className='border-3 border-border p-5 bg-background shadow-neo'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4'>
        <div>
          <h3 className='font-black text-lg uppercase tracking-wider'>
            Pace Progression
          </h3>
          <p className='text-xs font-bold text-muted-foreground mt-0.5'>
            Average pace per run with trend line
          </p>
        </div>
        <select
          value={daysBack}
          onChange={handlePeriodChange}
          className='px-3 py-1.5 border-3 border-border font-bold text-xs uppercase tracking-wider bg-background focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer'
          aria-label='Select time period'
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Chart */}
      <ResponsiveContainer width='100%' height={300}>
        <ComposedChart data={scatterData}>
          <CartesianGrid
            strokeDasharray='0'
            stroke='#000'
            strokeWidth={1}
            strokeOpacity={0.1}
          />
          <XAxis
            dataKey='dateTs'
            type='number'
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatXTick}
            tick={{fontWeight: 700, fontSize: 11}}
            stroke='#000'
            strokeWidth={2}
            scale='time'
          />
          <YAxis
            dataKey='avgPace'
            type='number'
            domain={yDomain}
            tickFormatter={formatYTick}
            tick={{fontWeight: 700, fontSize: 12}}
            stroke='#000'
            strokeWidth={2}
            reversed
            label={{
              value: 'min/km',
              angle: -90,
              position: 'insideLeft',
              style: {fontWeight: 700, fontSize: 12},
            }}
          />
          <Tooltip
            contentStyle={{
              border: '3px solid #000',
              borderRadius: 0,
              fontWeight: 700,
              backgroundColor: '#fff',
            }}
            labelFormatter={(ts: number) => {
              const d = new Date(ts);
              return d.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
            }}
            formatter={(value: number, name: string) => {
              if (name === 'avgPace') return [formatPace(value), 'Pace'];
              if (name === 'distance')
                return [`${value.toFixed(1)} km`, 'Distance'];
              if (name === 'trend') return [formatPace(value), 'Trend'];
              return [value, name];
            }}
          />
          <Scatter
            dataKey='avgPace'
            fill='hsl(217 91% 60%)'
            stroke='#000'
            strokeWidth={1.5}
            r={5}
          />
          <Line
            data={trendData}
            dataKey='trend'
            type='linear'
            stroke='hsl(0 84% 60%)'
            strokeWidth={2.5}
            strokeDasharray='8 4'
            dot={false}
            legendType='none'
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PaceProgressionChart;
