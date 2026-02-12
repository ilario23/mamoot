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
  Legend,
  ReferenceLine,
} from 'recharts';
import {useFitnessData} from '@/hooks/useStrava';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useIsMobile} from '@/hooks/use-mobile';
import {Loader2} from 'lucide-react';

const PERIOD_OPTIONS = [
  {label: '3 months', value: 90},
  {label: '6 months', value: 180},
  {label: '1 year', value: 365},
] as const;

const FitnessChart = ({embedded = false}: {embedded?: boolean}) => {
  const {isAuthenticated} = useStravaAuth();
  const {data: fitnessData, isLoading} = useFitnessData();
  const isMobile = useIsMobile();
  const [daysBack, setDaysBack] = useState(180);

  // Slice the full 365-day cached dataset to the selected period
  const chartData = useMemo(() => {
    if (!fitnessData || fitnessData.length === 0) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return fitnessData.filter((d) => d.date >= cutoffStr);
  }, [fitnessData, daysBack]);

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div
        className={`${embedded ? '' : 'border-3 border-border p-5 bg-background shadow-neo'} flex items-center justify-center min-h-[250px] md:min-h-[350px]`}
      >
        <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
      </div>
    );
  }

  if (chartData.length === 0) return null;

  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDaysBack(Number(e.target.value));
  };

  // Format date for X axis — show month abbreviation
  const formatXTick = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  };

  // Show every ~15th label to avoid crowding
  const tickInterval = Math.max(1, Math.floor(chartData.length / 12));

  return (
    <div
      className={
        embedded ? '' : 'border-3 border-border p-5 bg-background shadow-neo'
      }
    >
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4'>
        {!embedded && (
          <div>
            <h3 className='font-black text-lg uppercase tracking-wider'>
              Training Metrics
            </h3>
            <p className='text-xs font-bold text-muted-foreground mt-0.5'>
              BF (Base Fitness) / LI (Load Impact) / IT (Intensity Trend)
            </p>
          </div>
        )}
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
        height={embedded ? (isMobile ? 220 : 280) : isMobile ? 250 : 350}
      >
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id='bfGradient' x1='0' y1='0' x2='0' y2='1'>
              <stop
                offset='0%'
                stopColor='hsl(217 91% 60%)'
                stopOpacity={0.3}
              />
              <stop
                offset='100%'
                stopColor='hsl(217 91% 60%)'
                stopOpacity={0.05}
              />
            </linearGradient>
            <linearGradient id='liGradient' x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor='hsl(0 84% 60%)' stopOpacity={0.3} />
              <stop
                offset='100%'
                stopColor='hsl(0 84% 60%)'
                stopOpacity={0.05}
              />
            </linearGradient>
            <linearGradient id='itGradientPos' x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor='hsl(84 78% 55%)' stopOpacity={0.4} />
              <stop
                offset='100%'
                stopColor='hsl(84 78% 55%)'
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
          <XAxis
            dataKey='date'
            tickFormatter={formatXTick}
            interval={tickInterval}
            tick={{fontWeight: 700, fontSize: 11}}
            stroke='#000'
            strokeWidth={2}
          />
          <YAxis
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
              const labels: Record<string, string> = {
                bf: 'Base Fitness (BF)',
                li: 'Load Impact (LI)',
                it: 'Intensity Trend (IT)',
              };
              return [value.toFixed(1), labels[name] ?? name];
            }}
          />
          <Legend
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                bf: 'Base Fitness (BF)',
                li: 'Load Impact (LI)',
                it: 'Intensity Trend (IT)',
              };
              return labels[value] ?? value;
            }}
          />
          <ReferenceLine
            y={0}
            stroke='#000'
            strokeWidth={1}
            strokeOpacity={0.3}
          />
          <Area
            type='monotone'
            dataKey='bf'
            stroke='hsl(217 91% 60%)'
            strokeWidth={2.5}
            fill='url(#bfGradient)'
            dot={false}
            activeDot={{r: 4, strokeWidth: 2, stroke: '#000'}}
          />
          <Area
            type='monotone'
            dataKey='li'
            stroke='hsl(0 84% 60%)'
            strokeWidth={2.5}
            fill='url(#liGradient)'
            dot={false}
            activeDot={{r: 4, strokeWidth: 2, stroke: '#000'}}
          />
          <Area
            type='monotone'
            dataKey='it'
            stroke='hsl(84 78% 55%)'
            strokeWidth={2}
            fill='url(#itGradientPos)'
            dot={false}
            activeDot={{r: 4, strokeWidth: 2, stroke: '#000'}}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend explanation */}
      <div className='flex flex-wrap gap-4 mt-3 text-xs font-bold text-muted-foreground'>
        <span>
          <span
            className='inline-block w-3 h-3 mr-1'
            style={{backgroundColor: 'hsl(84 78% 55%)'}}
          />
          IT &gt; 0 = Stimulus
        </span>
        <span>
          <span
            className='inline-block w-3 h-3 mr-1'
            style={{backgroundColor: 'hsl(0 84% 60%)'}}
          />
          IT &lt; 0 = Recovery
        </span>
      </div>
    </div>
  );
};

export default FitnessChart;
