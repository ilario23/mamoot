'use client';

import {useMemo, useState} from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import {useFitnessData} from '@/hooks/useStrava';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {calcACWRData} from '@/utils/trainingLoad';
import {useIsMobile} from '@/hooks/use-mobile';
import {NeoLoader} from '@/components/ui/neo-loader';

const PERIOD_OPTIONS = [
  {label: '2 months', value: 60},
  {label: '3 months', value: 90},
  {label: '6 months', value: 180},
] as const;

const ACWRChart = ({embedded = false}: {embedded?: boolean}) => {
  const {isAuthenticated} = useStravaAuth();
  const {data: fitnessData, isLoading} = useFitnessData();
  const isMobile = useIsMobile();
  const [daysBack, setDaysBack] = useState(90);

  // Derive ACWR from cached fitness data, sliced to selected period
  const chartData = useMemo(() => {
    if (!fitnessData || fitnessData.length === 0) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const sliced = fitnessData.filter((d) => d.date >= cutoffStr);
    return calcACWRData(sliced);
  }, [fitnessData, daysBack]);

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div
        className={`${embedded ? '' : 'border-3 border-border p-5 bg-background shadow-neo'} flex items-center justify-center min-h-[220px] md:min-h-[300px]`}
      >
        <NeoLoader label='Loading ACWR' size='sm' colorClass='bg-accent' />
      </div>
    );
  }

  if (chartData.length === 0) return null;

  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDaysBack(Number(e.target.value));
  };

  const formatXTick = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  };
  const formatYTick = (value: number) => {
    return Number(value.toFixed(2)).toString();
  };

  const tickInterval = Math.max(1, Math.floor(chartData.length / 10));

  // Determine current ACWR status
  const latestACWR = chartData[chartData.length - 1]?.acwr ?? 0;
  const statusLabel =
    latestACWR < 0.8
      ? 'Under-trained'
      : latestACWR <= 1.3
        ? 'Sweet Spot'
        : latestACWR <= 1.5
          ? 'Moderate Risk'
          : 'High Risk';
  const statusColor =
    latestACWR < 0.8
      ? 'text-yellow-600'
      : latestACWR <= 1.3
        ? 'text-green-600'
        : latestACWR <= 1.5
          ? 'text-orange-500'
          : 'text-red-600';

  // Max ACWR for chart domain — cap at 2.5 for readability
  const maxACWR = Math.min(
    2.5,
    Math.max(2, ...chartData.map((d) => d.acwr)) + 0.2,
  );

  return (
    <div
      className={
        embedded ? '' : 'border-3 border-border p-5 bg-background shadow-neo'
      }
    >
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4'>
        <div>
          {!embedded && (
            <h3 className='font-black text-lg uppercase tracking-wider'>
              Workload Ratio
              <span className='text-xs font-bold text-muted-foreground ml-2 normal-case'>
                (ACWR)
              </span>
            </h3>
          )}
          <p className='text-xs font-bold text-muted-foreground mt-0.5'>
            Current:{' '}
            <span className={`font-black ${statusColor}`}>
              {latestACWR.toFixed(2)} — {statusLabel}
            </span>
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
      <ResponsiveContainer
        width='100%'
        height={embedded ? (isMobile ? 220 : 260) : isMobile ? 250 : 300}
      >
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id='acwrGradient' x1='0' y1='0' x2='0' y2='1'>
              <stop
                offset='0%'
                stopColor='hsl(217 91% 60%)'
                stopOpacity={0.4}
              />
              <stop
                offset='100%'
                stopColor='hsl(217 91% 60%)'
                stopOpacity={0.05}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray='0'
            stroke='#000'
            strokeWidth={1}
            strokeOpacity={0.1}
          />

          {/* Risk zone backgrounds */}
          <ReferenceArea
            y1={0}
            y2={0.8}
            fill='hsl(48 96% 53%)'
            fillOpacity={0.08}
            label={{
              value: 'Under-trained',
              position: 'insideTopLeft',
              fontSize: 10,
              fontWeight: 700,
              fill: 'hsl(48 96% 40%)',
            }}
          />
          <ReferenceArea
            y1={0.8}
            y2={1.3}
            fill='hsl(84 78% 55%)'
            fillOpacity={0.08}
            label={{
              value: 'Sweet Spot',
              position: 'insideTopLeft',
              fontSize: 10,
              fontWeight: 700,
              fill: 'hsl(84 78% 40%)',
            }}
          />
          <ReferenceArea
            y1={1.3}
            y2={1.5}
            fill='hsl(25 95% 53%)'
            fillOpacity={0.08}
          />
          <ReferenceArea
            y1={1.5}
            y2={maxACWR}
            fill='hsl(0 84% 60%)'
            fillOpacity={0.08}
            label={{
              value: 'High Risk',
              position: 'insideTopLeft',
              fontSize: 10,
              fontWeight: 700,
              fill: 'hsl(0 84% 50%)',
            }}
          />

          <ReferenceLine
            y={1.0}
            stroke='#000'
            strokeWidth={1}
            strokeOpacity={0.2}
            strokeDasharray='4 4'
          />

          <XAxis
            dataKey='date'
            tickFormatter={formatXTick}
            interval={tickInterval}
            tick={{fontWeight: 700, fontSize: 11}}
            stroke='#000'
            strokeWidth={2}
          />
          <YAxis
            domain={[0, maxACWR]}
            tickFormatter={formatYTick}
            tick={{fontWeight: 700, fontSize: 12}}
            stroke='#000'
            strokeWidth={2}
          />
          <Tooltip
            contentStyle={{
              border: '3px solid #000',
              borderRadius: 0,
              fontWeight: 700,
              backgroundColor: '#fff',
            }}
            labelFormatter={(label: string) => {
              const d = new Date(label + 'T00:00:00');
              return d.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
            }}
            formatter={(value: number, name: string) => {
              if (name === 'acwr') return [value.toFixed(2), 'ACWR'];
              return [value, name];
            }}
          />
          <Area
            type='monotone'
            dataKey='acwr'
            stroke='hsl(217 91% 60%)'
            strokeWidth={2.5}
            fill='url(#acwrGradient)'
            dot={false}
            activeDot={{r: 4, strokeWidth: 2, stroke: '#000'}}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Zone legend */}
      <div className='flex flex-wrap gap-4 mt-3 text-xs font-bold text-muted-foreground'>
        <span>
          <span
            className='inline-block w-3 h-3 mr-1'
            style={{backgroundColor: 'hsl(48 96% 53%)', opacity: 0.6}}
          />
          &lt; 0.8 Under-trained
        </span>
        <span>
          <span
            className='inline-block w-3 h-3 mr-1'
            style={{backgroundColor: 'hsl(84 78% 55%)', opacity: 0.6}}
          />
          0.8–1.3 Sweet Spot
        </span>
        <span>
          <span
            className='inline-block w-3 h-3 mr-1'
            style={{backgroundColor: 'hsl(25 95% 53%)', opacity: 0.6}}
          />
          1.3–1.5 Moderate Risk
        </span>
        <span>
          <span
            className='inline-block w-3 h-3 mr-1'
            style={{backgroundColor: 'hsl(0 84% 60%)', opacity: 0.6}}
          />
          &gt; 1.5 High Risk
        </span>
      </div>
    </div>
  );
};

export default ACWRChart;
