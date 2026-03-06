'use client';

import {useRef} from 'react';
import {useRouter} from 'next/navigation';
import {useVirtualizer} from '@tanstack/react-virtual';
import {
  formatPace,
  formatDuration,
  type ActivityType,
  type ActivitySummary,
} from '@/lib/activityModel';
import {Footprints, Bike, Mountain, Waves, type LucideIcon} from 'lucide-react';
import RoutePreview from '@/components/dashboard/RoutePreview';

const ACTIVITY_ICON: Record<ActivityType, LucideIcon> = {
  Run: Footprints,
  Ride: Bike,
  Hike: Mountain,
  Swim: Waves,
};

const ACCENT_BG: Record<ActivityType, string> = {
  Run: 'bg-[var(--activity-run-3)]',
  Ride: 'bg-[var(--activity-ride-3)]',
  Hike: 'bg-[var(--activity-hike-3)]',
  Swim: 'bg-[var(--activity-swim-3)]',
};

const ACCENT_COLOR: Record<ActivityType, string> = {
  Run: 'var(--activity-run-3)',
  Ride: 'var(--activity-ride-3)',
  Hike: 'var(--activity-hike-3)',
  Swim: 'var(--activity-swim-3)',
};

const ITEM_GAP = 12; // Matches space-y-3 (0.75rem = 12px)
const ESTIMATED_ITEM_HEIGHT = 80;

interface ActivityListProps {
  activities: ActivitySummary[];
}

const ActivityList = ({activities}: ActivityListProps) => {
  const router = useRouter();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // TanStack Virtual intentionally provides non-memoizable callbacks.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: activities.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 5,
    gap: ITEM_GAP,
  });

  const handleNavigate = (id: string) => {
    router.push(`/activity/${id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNavigate(id);
    }
  };

  if (activities.length === 0) {
    return (
      <div className='border-3 border-border p-8 bg-background shadow-neo text-center'>
        <p className='font-black text-lg'>No activities match your filters</p>
        <p className='text-sm font-bold text-muted-foreground mt-2'>
          Try adjusting the year, type, or search query
        </p>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className='h-full overflow-auto'>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const activity = activities[virtualRow.index];
          const Icon = ACTIVITY_ICON[activity.type] ?? Footprints;
          const accentClass = ACCENT_BG[activity.type] ?? 'bg-primary';
          const dateStr = new Date(activity.date).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });

          return (
            <div
              key={activity.id}
              data-index={virtualRow.index}
              ref={(node) => virtualizer.measureElement(node)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                role='link'
                tabIndex={0}
                aria-label={`${activity.name} — ${activity.distance.toFixed(1)} km on ${dateStr}`}
                onClick={() => handleNavigate(activity.id)}
                onKeyDown={(e) => handleKeyDown(e, activity.id)}
                className='border-3 border-border bg-background shadow-neo cursor-pointer hover:shadow-neo-lg hover:translate-x-[-2px] hover:translate-y-[-2px] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all flex overflow-hidden'
              >
                {/* Left accent bar */}
                <div className={`w-2 shrink-0 ${accentClass}`} />

                {/* Card content */}
                <div className="flex-1 p-3 md:p-4 min-w-0">
                  {/* Top row: name, date, icon */}
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex items-center gap-1.5 md:gap-2 flex-1 min-w-0">
                      <Icon
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <p className="font-black text-xs md:text-sm truncate">{activity.name}</p>
                    </div>
                    <span className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                      {dateStr}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center flex-wrap gap-x-2 md:gap-x-3 gap-y-1 mt-1.5 md:mt-2">
                    <span className="text-xs md:text-sm font-black">
                      {activity.distance.toFixed(1)} km
                    </span>
                    <span
                      className="text-muted-foreground text-[10px] md:text-xs select-none"
                      aria-hidden="true"
                    >
                      /
                    </span>
                    <span className="text-xs md:text-sm font-bold text-muted-foreground">
                      {formatDuration(activity.duration)}
                    </span>
                    <span
                      className="text-muted-foreground text-[10px] md:text-xs select-none"
                      aria-hidden="true"
                    >
                      /
                    </span>
                    <span className="text-xs md:text-sm font-bold text-muted-foreground">
                      {activity.avgPace > 0
                        ? `${formatPace(activity.avgPace)}/km`
                        : '—'}
                    </span>
                    {activity.avgHr > 0 && (
                      <>
                        <span
                          className="text-muted-foreground text-[10px] md:text-xs select-none hidden sm:inline"
                          aria-hidden="true"
                        >
                          /
                        </span>
                        <span className="text-xs md:text-sm font-bold text-muted-foreground hidden sm:inline">
                          {activity.avgHr} bpm
                        </span>
                      </>
                    )}
                    {activity.elevationGain > 0 && (
                      <>
                        <span
                          className="text-muted-foreground text-[10px] md:text-xs select-none hidden sm:inline"
                          aria-hidden="true"
                        >
                          /
                        </span>
                        <span className="text-xs md:text-sm font-bold text-muted-foreground hidden sm:inline">
                          {Math.round(activity.elevationGain)} m elev
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Route polyline preview — hidden on mobile */}
                {activity.polyline && (
                  <div className="shrink-0 border-l-3 border-border bg-muted/40 hidden sm:flex items-center justify-center px-2">
                    <RoutePreview
                      polyline={activity.polyline}
                      color={ACCENT_COLOR[activity.type] ?? 'hsl(312, 100%, 67%)'}
                      width={72}
                      height={56}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ActivityList;
