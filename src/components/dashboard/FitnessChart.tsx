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
import {useActivities} from '@/hooks/useStrava';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import {calcFitnessData} from '@/utils/trainingLoad';
import {Loader2} from 'lucide-react';

const PERIOD_OPTIONS = [
  {label: '3 months', value: 90},
  {label: '6 months', value: 180},
  {label: '1 year', value: 365},
] as const;

const FitnessChart = () => {
  const {isAuthenticated} = useStravaAuth();
  const {settings} = useSettings();
  const {data: activities, isLoading} = useActivities();
  const [daysBack, setDaysBack] = useState(180);

  const chartData = useMemo(() => {
    if (!activities || activities.length === 0) return [];
    return calcFitnessData(
      activities,
      settings.restingHr,
      settings.maxHr,
      daysBack,
    );
  }, [activities, settings.restingHr, settings.maxHr, daysBack]);

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className='border-3 border-border p-5 bg-background shadow-neo flex items-center justify-center min-h-[350px]'>
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
    <div className='border-3 border-border p-5 bg-background shadow-neo'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4'>
        <div>
          <h3 className='font-black text-lg uppercase tracking-wider'>
            Fitness & Freshness
          </h3>
          <p className='text-xs font-bold text-muted-foreground mt-0.5'>
            CTL (Fitness) / ATL (Fatigue) / TSB (Form)
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
      <ResponsiveContainer width='100%' height={350}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id='ctlGradient' x1='0' y1='0' x2='0' y2='1'>
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
            <linearGradient id='atlGradient' x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor='hsl(0 84% 60%)' stopOpacity={0.3} />
              <stop
                offset='100%'
                stopColor='hsl(0 84% 60%)'
                stopOpacity={0.05}
              />
            </linearGradient>
            <linearGradient id='tsbGradientPos' x1='0' y1='0' x2='0' y2='1'>
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
                ctl: 'Fitness (CTL)',
                atl: 'Fatigue (ATL)',
                tsb: 'Form (TSB)',
              };
              return [value.toFixed(1), labels[name] ?? name];
            }}
          />
          <Legend
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                ctl: 'Fitness (CTL)',
                atl: 'Fatigue (ATL)',
                tsb: 'Form (TSB)',
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
            dataKey='ctl'
            stroke='hsl(217 91% 60%)'
            strokeWidth={2.5}
            fill='url(#ctlGradient)'
            dot={false}
            activeDot={{r: 4, strokeWidth: 2, stroke: '#000'}}
          />
          <Area
            type='monotone'
            dataKey='atl'
            stroke='hsl(0 84% 60%)'
            strokeWidth={2.5}
            fill='url(#atlGradient)'
            dot={false}
            activeDot={{r: 4, strokeWidth: 2, stroke: '#000'}}
          />
          <Area
            type='monotone'
            dataKey='tsb'
            stroke='hsl(84 78% 55%)'
            strokeWidth={2}
            fill='url(#tsbGradientPos)'
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
          TSB &gt; 0 = Fresh
        </span>
        <span>
          <span
            className='inline-block w-3 h-3 mr-1'
            style={{backgroundColor: 'hsl(0 84% 60%)'}}
          />
          TSB &lt; 0 = Fatigued
        </span>
      </div>
    </div>
  );
};

export default FitnessChart;
