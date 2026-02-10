'use client';

import {formatDuration} from '@/lib/mockData';
import {useActivities, useAthleteStats} from '@/hooks/useStrava';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import {calcStreak} from '@/utils/trainingLoad';
import {Loader2, ChevronDown} from 'lucide-react';
import {useMemo, useState} from 'react';
import {useIsMobile} from '@/hooks/use-mobile';

interface StatCard {
  label: string;
  value: string;
  sub: string;
  accentClass: string;
}

const StatCards = () => {
  const {isAuthenticated} = useStravaAuth();
  const {data: activities, isLoading} = useActivities();
  const {data: stats} = useAthleteStats();
  const {settings} = useSettings();

  const cards = useMemo<StatCard[]>(() => {
    const allActivities = activities ?? [];
    if (allActivities.length === 0) return [];

    // Current week (Mon–Sun)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    const weekActivities = allActivities.filter(
      (r) => new Date(r.date) >= monday,
    );
    const weekDistance = weekActivities.reduce((sum, r) => sum + r.distance, 0);
    const weekDuration = weekActivities.reduce((sum, r) => sum + r.duration, 0);

    // Average weekly distance (previous 4 weeks)
    const fourWeeksAgo = new Date(monday);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const prevActivities = allActivities.filter(
      (r) => new Date(r.date) >= fourWeeksAgo && new Date(r.date) < monday,
    );
    const prevWeeksAvg =
      prevActivities.reduce((sum, r) => sum + r.distance, 0) / 4;
    const loadRatio =
      prevWeeksAvg > 0 ? ((weekDistance / prevWeeksAvg) * 100).toFixed(0) : '—';

    // Total activities
    const totalActivities = stats
      ? stats.all_run_totals.count +
        stats.all_ride_totals.count +
        stats.all_swim_totals.count
      : allActivities.length;

    // Weekly elevation gain
    const weekElevation = weekActivities.reduce(
      (sum, r) => sum + r.elevationGain,
      0,
    );

    // YTD distance (from stats or computed)
    const ytdDistance = stats
      ? (stats.ytd_run_totals.distance +
          stats.ytd_ride_totals.distance +
          stats.ytd_swim_totals.distance) /
        1000
      : (() => {
          const yearStart = new Date(now.getFullYear(), 0, 1);
          return allActivities
            .filter((a) => new Date(a.date) >= yearStart)
            .reduce((sum, a) => sum + a.distance, 0);
        })();

    // Training streak
    const streak = calcStreak(allActivities);

    return [
      {
        label: 'Weekly Volume',
        value: `${weekDistance.toFixed(1)} km`,
        sub: formatDuration(weekDuration),
        accentClass: 'bg-secondary',
      },
      {
        label: 'Acute Load',
        value: `${loadRatio}%`,
        sub: `${weekDistance.toFixed(1)} vs ${prevWeeksAvg.toFixed(1)} km/wk`,
        accentClass: 'bg-accent',
      },
      {
        label: 'Weekly Elevation',
        value: `${Math.round(weekElevation)} m`,
        sub: 'elevation gain this week',
        accentClass: 'bg-primary',
      },
      {
        label: 'Weekly Activities',
        value: `${weekActivities.length}`,
        sub: `${weekActivities.length === 1 ? 'activity' : 'activities'} this week`,
        accentClass: 'bg-secondary',
      },
      {
        label: 'YTD Distance',
        value: `${ytdDistance.toFixed(0)} km`,
        sub: `${new Date().getFullYear()} total`,
        accentClass: 'bg-accent',
      },
      {
        label: 'Streak',
        value: `${streak.weeks} wk`,
        sub: `${streak.days} consecutive days`,
        accentClass: 'bg-primary',
      },
    ];
  }, [activities, stats, settings]);

  if (!isAuthenticated) {
    return (
      <div className='border-3 border-border p-8 bg-background shadow-neo text-center'>
        <p className='font-black text-lg'>Connect Strava to see your stats</p>
        <p className='text-sm font-bold text-muted-foreground mt-2'>
          Go to Settings to link your Strava account
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className='space-y-4'>
        <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className='border-3 border-border p-5 bg-background shadow-neo flex items-center justify-center min-h-[120px]'
            >
              <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
            </div>
          ))}
        </div>
        <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
          {[5, 6].map((i) => (
            <div
              key={i}
              className='border-3 border-border p-5 bg-background shadow-neo flex items-center justify-center min-h-[120px]'
            >
              <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (cards.length === 0) return null;

  const isMobile = useIsMobile();
  const [showAll, setShowAll] = useState(false);

  const topRow = cards.slice(0, 4);
  const bottomRow = cards.slice(4);
  const showBottomRow = !isMobile || showAll;

  const handleToggleShowAll = () => {
    setShowAll((prev) => !prev);
  };

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {topRow.map((card, i) => (
          <div
            key={i}
            className="border-3 border-border p-3 md:p-5 bg-background shadow-neo"
          >
            <p className="text-[10px] md:text-xs font-black uppercase tracking-wider mb-1.5 md:mb-2">
              {card.label}
            </p>
            <p className="text-2xl md:text-3xl lg:text-2xl xl:text-3xl font-black leading-tight">
              {card.value}
            </p>
            <p className="text-xs md:text-sm font-bold text-muted-foreground mt-1">
              {card.sub}
            </p>
            <div className={`h-1.5 md:h-2 w-12 md:w-16 mt-2 md:mt-3 ${card.accentClass}`} />
          </div>
        ))}
      </div>
      {showBottomRow && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {bottomRow.map((card, i) => (
            <div
              key={i + 4}
              className="border-3 border-border p-3 md:p-5 bg-background shadow-neo"
            >
              <p className="text-[10px] md:text-xs font-black uppercase tracking-wider mb-1.5 md:mb-2">
                {card.label}
              </p>
              <p className="text-2xl md:text-3xl lg:text-2xl xl:text-3xl font-black leading-tight">
                {card.value}
              </p>
              <p className="text-xs md:text-sm font-bold text-muted-foreground mt-1">
                {card.sub}
              </p>
              <div className={`h-1.5 md:h-2 w-12 md:w-16 mt-2 md:mt-3 ${card.accentClass}`} />
            </div>
          ))}
        </div>
      )}
      {isMobile && (
        <button
          onClick={handleToggleShowAll}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-black uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          aria-label={showAll ? 'Show fewer stats' : 'Show all stats'}
          tabIndex={0}
        >
          {showAll ? 'Show less' : 'Show all stats'}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
};

export default StatCards;
