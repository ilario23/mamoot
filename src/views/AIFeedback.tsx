'use client';

import {useCallback, useEffect, useMemo, useState} from 'react';
import {AlertCircle, BarChart3, TrendingUp, MessageSquareWarning} from 'lucide-react';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {NeoLoader} from '@/components/ui/neo-loader';

interface BucketStat {
  key: string;
  total: number;
  negative: number;
  negativeRatio: number;
}

interface RegressionStat {
  dimension: 'persona' | 'route' | 'reason' | 'model';
  key: string;
  currentNegativeRatio: number;
  previousNegativeRatio: number;
  delta: number;
  currentTotal: number;
  previousTotal: number;
}

interface FeedbackDashboardData {
  summary: {
    totalFeedback: number;
    negativeCount: number;
    negativeRatio: number;
  };
  series: Array<{
    date: string;
    total: number;
    negative: number;
    negativeRatio: number;
  }>;
  byPersona: BucketStat[];
  byRoute: BucketStat[];
  byReason: BucketStat[];
  byModel: BucketStat[];
  topRegressions: RegressionStat[];
}

const formatPct = (value: number): string => `${(value * 100).toFixed(1)}%`;

const AIFeedback = () => {
  const {athlete} = useStravaAuth();
  const athleteId = athlete?.id ?? null;
  const [days, setDays] = useState(30);
  const [persona, setPersona] = useState('');
  const [route, setRoute] = useState('');
  const [model, setModel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FeedbackDashboardData | null>(null);

  const loadFeedbackDashboard = useCallback(async () => {
    if (!athleteId) return;
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({
      athleteId: String(athleteId),
      days: String(days),
    });
    if (persona) params.set('persona', persona);
    if (route) params.set('route', route);
    if (model) params.set('model', model);

    try {
      const res = await fetch(`/api/ai/feedback-dashboard?${params.toString()}`);
      if (!res.ok) {
        let message = 'Failed to load feedback dashboard';
        try {
          const body = await res.json();
          if (typeof body?.error === 'string') message = body.error;
        } catch {
          // noop
        }
        throw new Error(message);
      }
      const next = (await res.json()) as FeedbackDashboardData;
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setIsLoading(false);
    }
  }, [athleteId, days, persona, route, model]);

  useEffect(() => {
    void loadFeedbackDashboard();
  }, [loadFeedbackDashboard]);

  const personaOptions = useMemo(
    () => (data?.byPersona ?? []).map((item) => item.key),
    [data?.byPersona],
  );
  const routeOptions = useMemo(
    () => (data?.byRoute ?? []).map((item) => item.key),
    [data?.byRoute],
  );
  const modelOptions = useMemo(
    () => (data?.byModel ?? []).map((item) => item.key),
    [data?.byModel],
  );
  const bucketSections: Array<{title: string; buckets: BucketStat[]}> = [
    {title: 'By Persona', buckets: data?.byPersona ?? []},
    {title: 'By Route', buckets: data?.byRoute ?? []},
    {title: 'By Reason', buckets: data?.byReason ?? []},
    {title: 'By Model', buckets: data?.byModel ?? []},
  ];

  return (
    <div className='space-y-4 md:space-y-6'>
      <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
        AI Feedback
      </h1>

      <div className='border-3 border-border bg-background shadow-neo-sm p-3 md:p-4 grid grid-cols-1 md:grid-cols-4 gap-2'>
        <label className='space-y-1'>
          <span className='text-[10px] uppercase tracking-wider font-black text-muted-foreground'>
            Window
          </span>
          <select
            value={String(days)}
            onChange={(e) => setDays(Number(e.target.value))}
            className='w-full border-2 border-border bg-muted/50 px-2 py-1.5 text-sm font-medium'
          >
            <option value='7'>7 days</option>
            <option value='14'>14 days</option>
            <option value='30'>30 days</option>
            <option value='60'>60 days</option>
          </select>
        </label>
        <label className='space-y-1'>
          <span className='text-[10px] uppercase tracking-wider font-black text-muted-foreground'>
            Persona
          </span>
          <select
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            className='w-full border-2 border-border bg-muted/50 px-2 py-1.5 text-sm font-medium'
          >
            <option value=''>All</option>
            {personaOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className='space-y-1'>
          <span className='text-[10px] uppercase tracking-wider font-black text-muted-foreground'>
            Route
          </span>
          <select
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            className='w-full border-2 border-border bg-muted/50 px-2 py-1.5 text-sm font-medium'
          >
            <option value=''>All</option>
            {routeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className='space-y-1'>
          <span className='text-[10px] uppercase tracking-wider font-black text-muted-foreground'>
            Model
          </span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className='w-full border-2 border-border bg-muted/50 px-2 py-1.5 text-sm font-medium'
          >
            <option value=''>All</option>
            {modelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && (
        <div className='border-3 border-border bg-background shadow-neo p-8 flex items-center justify-center'>
          <NeoLoader label='Loading feedback metrics' size='sm' />
        </div>
      )}

      {error && (
        <div className='border-3 border-border bg-destructive/10 text-destructive shadow-neo-sm p-3 flex items-center gap-2'>
          <AlertCircle className='h-4 w-4 shrink-0' />
          <span className='text-sm font-medium'>{error}</span>
        </div>
      )}

      {!isLoading && !error && data && (
        <>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
            <div className='border-3 border-border bg-background shadow-neo-sm p-4'>
              <p className='text-[10px] uppercase tracking-wider font-black text-muted-foreground'>
                Total Feedback
              </p>
              <p className='text-2xl font-black mt-1'>{data.summary.totalFeedback}</p>
            </div>
            <div className='border-3 border-border bg-background shadow-neo-sm p-4'>
              <p className='text-[10px] uppercase tracking-wider font-black text-muted-foreground'>
                Negative Count
              </p>
              <p className='text-2xl font-black mt-1'>{data.summary.negativeCount}</p>
            </div>
            <div className='border-3 border-border bg-background shadow-neo-sm p-4'>
              <p className='text-[10px] uppercase tracking-wider font-black text-muted-foreground'>
                Negative Ratio
              </p>
              <p className='text-2xl font-black mt-1'>
                {formatPct(data.summary.negativeRatio)}
              </p>
            </div>
          </div>

          <div className='border-3 border-border bg-background shadow-neo-sm p-4 space-y-2'>
            <div className='flex items-center gap-2'>
              <BarChart3 className='h-4 w-4 text-primary' />
              <h2 className='font-black uppercase tracking-wider text-sm'>
                Daily Trend
              </h2>
            </div>
            <div className='space-y-1'>
              {data.series.map((point) => (
                <div key={point.date} className='flex items-center gap-2'>
                  <span className='text-[11px] font-bold text-muted-foreground w-[90px] shrink-0'>
                    {point.date}
                  </span>
                  <div className='h-2 border-2 border-border bg-muted flex-1 overflow-hidden'>
                    <div
                      className='h-full bg-primary'
                      style={{
                        width: `${Math.min(100, point.negativeRatio * 100) || 2}%`,
                      }}
                    />
                  </div>
                  <span className='text-[11px] font-black w-[70px] text-right'>
                    {formatPct(point.negativeRatio)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            {bucketSections.map(({title, buckets}) => (
              <div
                key={title}
                className='border-3 border-border bg-background shadow-neo-sm p-4 space-y-2'
              >
                <h3 className='font-black uppercase tracking-wider text-sm'>{title}</h3>
                {buckets.map((bucket) => (
                  <div key={`${title}-${bucket.key}`} className='text-xs'>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='font-bold truncate'>{bucket.key}</span>
                      <span className='font-black'>
                        {formatPct(bucket.negativeRatio)}
                      </span>
                    </div>
                    <p className='text-muted-foreground font-medium'>
                      {bucket.negative} negative / {bucket.total} total
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className='border-3 border-border bg-background shadow-neo-sm p-4 space-y-2'>
            <div className='flex items-center gap-2'>
              <TrendingUp className='h-4 w-4 text-destructive' />
              <h3 className='font-black uppercase tracking-wider text-sm'>
                Top Regressions
              </h3>
            </div>
            {data.topRegressions.length === 0 ? (
              <p className='text-sm text-muted-foreground font-medium'>
                No regressions detected for the selected window.
              </p>
            ) : (
              <div className='space-y-2'>
                {data.topRegressions.map((item) => (
                  <div
                    key={`${item.dimension}-${item.key}`}
                    className='border-2 border-border p-2 bg-destructive/5'
                  >
                    <p className='text-xs font-black uppercase tracking-wider'>
                      {item.dimension}: {item.key}
                    </p>
                    <p className='text-xs font-medium text-muted-foreground'>
                      {formatPct(item.previousNegativeRatio)} {'->'}{' '}
                      {formatPct(item.currentNegativeRatio)} (delta{' '}
                      {formatPct(item.delta)})
                    </p>
                    <p className='text-[11px] font-medium text-muted-foreground'>
                      Current: {item.currentTotal} samples · Previous:{' '}
                      {item.previousTotal} samples
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!isLoading && !error && data && data.summary.totalFeedback === 0 && (
        <div className='border-3 border-border bg-background shadow-neo-sm p-6 flex items-center gap-2 text-muted-foreground'>
          <MessageSquareWarning className='h-4 w-4 shrink-0' />
          <p className='text-sm font-medium'>
            No feedback data yet for the selected filters.
          </p>
        </div>
      )}
    </div>
  );
};

export default AIFeedback;
