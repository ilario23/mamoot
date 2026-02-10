import {useMemo} from 'react';
import {Footprints, Bike, Mountain, Waves} from 'lucide-react';
import {
  type ActivitySummary,
  type ActivityType,
  ACTIVITY_TYPE_CONFIG,
} from '@/lib/mockData';

// ----- Icon map -----

const ICON_MAP: Record<ActivityType, React.ElementType> = {
  Run: Footprints,
  Ride: Bike,
  Hike: Mountain,
  Swim: Waves,
};

// ----- Types -----

interface ActivitySummaryCardsProps {
  activities: ActivitySummary[];
}

interface TypeStats {
  type: ActivityType;
  count: number;
  totalHours: number;
  totalKm: number;
}

// ----- Component -----

const ActivitySummaryCards = ({activities}: ActivitySummaryCardsProps) => {
  const stats = useMemo(() => {
    const map: Record<ActivityType, TypeStats> = {
      Run: {type: 'Run', count: 0, totalHours: 0, totalKm: 0},
      Ride: {type: 'Ride', count: 0, totalHours: 0, totalKm: 0},
      Hike: {type: 'Hike', count: 0, totalHours: 0, totalKm: 0},
      Swim: {type: 'Swim', count: 0, totalHours: 0, totalKm: 0},
    };

    activities.forEach((a) => {
      map[a.type].count += 1;
      map[a.type].totalHours += a.duration / 3600;
      map[a.type].totalKm += a.distance;
    });

    // Only return types that have at least 1 activity
    return (Object.values(map) as TypeStats[]).filter((s) => s.count > 0);
  }, [activities]);

  if (stats.length === 0) {
    return (
      <div className='border-3 border-border p-5 bg-background shadow-neo text-center'>
        <p className='text-sm font-bold text-muted-foreground'>
          No activities recorded this year
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {stats.map((s) => {
        const config = ACTIVITY_TYPE_CONFIG[s.type];
        const Icon = ICON_MAP[s.type];
        return (
          <div
            key={s.type}
            className="border-3 border-border p-3 md:p-4 bg-background shadow-neo"
          >
            <div className="flex items-center gap-1.5 md:gap-2 mb-2 md:mb-3">
              <Icon className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
              <p className="text-[10px] md:text-xs font-black uppercase tracking-wider">
                {config.label}
              </p>
            </div>
            <p className="text-2xl md:text-3xl font-black leading-tight">{s.count}</p>
            <p className="text-[10px] md:text-xs font-bold text-muted-foreground mt-0.5">
              {s.count === 1 ? 'activity' : 'activities'}
            </p>
            <div className="flex gap-3 md:gap-4 mt-2 md:mt-3 pt-2 md:pt-3 border-t border-muted">
              <div>
                <p className="text-xs md:text-sm font-black">{s.totalKm.toFixed(1)}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground font-bold">km</p>
              </div>
              <div>
                <p className="text-xs md:text-sm font-black">{s.totalHours.toFixed(1)}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground font-bold">hrs</p>
              </div>
            </div>
            {/* Accent bar in activity color */}
            <div
              className="h-1.5 md:h-2 w-10 md:w-12 mt-2 md:mt-3"
              style={{backgroundColor: config.colors[3]}}
            />
          </div>
        );
      })}
    </div>
  );
};

export default ActivitySummaryCards;
