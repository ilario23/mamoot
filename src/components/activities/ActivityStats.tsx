'use client';

import type {ActivitySummary} from '@/lib/mockData';
import {formatDuration} from '@/lib/mockData';
import {Activity, Route, Clock, TrendingUp} from 'lucide-react';
import {useMemo} from 'react';

interface ActivityStatsProps {
  activities: ActivitySummary[];
}

const ActivityStats = ({activities}: ActivityStatsProps) => {
  const stats = useMemo(() => {
    const totalActivities = activities.length;
    const totalDistance = activities.reduce((sum, a) => sum + a.distance, 0);
    const totalDuration = activities.reduce((sum, a) => sum + a.duration, 0);
    const totalElevation = activities.reduce(
      (sum, a) => sum + a.elevationGain,
      0,
    );

    return {totalActivities, totalDistance, totalDuration, totalElevation};
  }, [activities]);

  const cards = [
    {
      label: 'Activities',
      value: String(stats.totalActivities),
      icon: Activity,
    },
    {
      label: 'Distance',
      value: `${stats.totalDistance.toFixed(1)} km`,
      icon: Route,
    },
    {
      label: 'Time',
      value: formatDuration(stats.totalDuration),
      icon: Clock,
    },
    {
      label: 'Elevation',
      value: `${Math.round(stats.totalElevation)} m`,
      icon: TrendingUp,
    },
  ];

  return (
    <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
      {cards.map((card) => (
        <div
          key={card.label}
          className='border-3 border-border bg-background shadow-neo p-4'
        >
          <div className='flex items-center gap-2 mb-1'>
            <card.icon
              className='h-4 w-4 text-muted-foreground'
              aria-hidden='true'
            />
            <span className='text-xs font-bold uppercase tracking-wider text-muted-foreground'>
              {card.label}
            </span>
          </div>
          <p className='text-xl font-black'>{card.value}</p>
        </div>
      ))}
    </div>
  );
};

export default ActivityStats;
