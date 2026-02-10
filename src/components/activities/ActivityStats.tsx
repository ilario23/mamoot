'use client';

import type {ActivitySummary} from '@/lib/mockData';
import {formatDuration} from '@/lib/mockData';
import {Activity, Route, Clock, TrendingUp, ChevronDown} from 'lucide-react';
import {useMemo, useState} from 'react';
import {useIsMobile} from '@/hooks/use-mobile';

interface ActivityStatsProps {
  activities: ActivitySummary[];
}

const ActivityStats = ({activities}: ActivityStatsProps) => {
  const isMobile = useIsMobile();
  const [showAll, setShowAll] = useState(false);

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

  const visibleCards = isMobile && !showAll ? cards.slice(0, 2) : cards;

  const handleToggleShowAll = () => {
    setShowAll((prev) => !prev);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {visibleCards.map((card) => (
          <div
            key={card.label}
            className="border-3 border-border bg-background shadow-neo p-3 md:p-4"
          >
            <div className="flex items-center gap-2 mb-1">
              <card.icon
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {card.label}
              </span>
            </div>
            <p className="text-lg md:text-xl font-black">{card.value}</p>
          </div>
        ))}
      </div>
      {isMobile && (
        <button
          onClick={handleToggleShowAll}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-black uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          aria-label={showAll ? 'Show fewer stats' : 'Show all stats'}
          tabIndex={0}
        >
          {showAll ? 'Show less' : 'Show more'}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
};

export default ActivityStats;
