"use client";

import { useRouter } from "next/navigation";
import {
  formatPace,
  formatDuration,
  type ActivityType,
} from "@/lib/mockData";
import { useActivities } from "@/hooks/useStrava";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import {
  Loader2,
  Footprints,
  Bike,
  Mountain,
  Waves,
  type LucideIcon,
} from "lucide-react";
import RoutePreview from "@/components/dashboard/RoutePreview";

const ACTIVITY_ICON: Record<ActivityType, LucideIcon> = {
  Run: Footprints,
  Ride: Bike,
  Hike: Mountain,
  Swim: Waves,
};

const ACCENT_BG: Record<ActivityType, string> = {
  Run: "bg-[var(--activity-run-3)]",
  Ride: "bg-[var(--activity-ride-3)]",
  Hike: "bg-[var(--activity-hike-3)]",
  Swim: "bg-[var(--activity-swim-3)]",
};

const ACCENT_COLOR: Record<ActivityType, string> = {
  Run: "var(--activity-run-3)",
  Ride: "var(--activity-ride-3)",
  Hike: "var(--activity-hike-3)",
  Swim: "var(--activity-swim-3)",
};

const RecentRuns = () => {
  const router = useRouter();
  const { isAuthenticated } = useStravaAuth();
  const { data: activities, isLoading } = useActivities();

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className="border-3 border-border bg-background shadow-neo flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const recentActivities = activities?.slice(0, 10) ?? [];

  if (recentActivities.length === 0) {
    return (
      <div className="border-3 border-border p-8 bg-background shadow-neo text-center">
        <p className="font-black text-lg">No activities found</p>
        <p className="text-sm font-bold text-muted-foreground mt-2">
          Record an activity on Strava to see it here
        </p>
      </div>
    );
  }

  const handleNavigate = (id: string) => {
    router.push(`/activity/${id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleNavigate(id);
    }
  };

  return (
    <div>
      <div className="border-3 border-border bg-background shadow-neo p-5 mb-3">
        <h3 className="font-black text-lg uppercase tracking-wider">
          Recent Activities
        </h3>
      </div>

      <div className="space-y-3">
        {recentActivities.map((activity) => {
          const Icon = ACTIVITY_ICON[activity.type] ?? Footprints;
          const accentClass = ACCENT_BG[activity.type] ?? "bg-primary";
          const dateStr = new Date(activity.date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
          });

          return (
            <div
              key={activity.id}
              role="link"
              tabIndex={0}
              aria-label={`${activity.name} — ${activity.distance.toFixed(1)} km on ${dateStr}`}
              onClick={() => handleNavigate(activity.id)}
              onKeyDown={(e) => handleKeyDown(e, activity.id)}
              className="border-3 border-border bg-background shadow-neo cursor-pointer hover:shadow-neo-lg hover:translate-x-[-2px] hover:translate-y-[-2px] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all flex overflow-hidden"
            >
              {/* Left accent bar */}
              <div className={`w-2 shrink-0 ${accentClass}`} />

              {/* Card content */}
              <div className="flex-1 p-4 min-w-0">
                {/* Top row: name, date, icon */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Icon
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="font-black text-sm truncate">
                      {activity.name}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                    {dateStr}
                  </span>
                </div>

                {/* Stats row */}
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2">
                  <span className="text-sm font-black">
                    {activity.distance.toFixed(1)} km
                  </span>
                  <span className="text-muted-foreground text-xs select-none" aria-hidden="true">
                    /
                  </span>
                  <span className="text-sm font-bold text-muted-foreground">
                    {formatDuration(activity.duration)}
                  </span>
                  <span className="text-muted-foreground text-xs select-none" aria-hidden="true">
                    /
                  </span>
                  <span className="text-sm font-bold text-muted-foreground">
                    {activity.avgPace > 0
                      ? `${formatPace(activity.avgPace)}/km`
                      : "—"}
                  </span>
                  {activity.avgHr > 0 && (
                    <>
                      <span className="text-muted-foreground text-xs select-none" aria-hidden="true">
                        /
                      </span>
                      <span className="text-sm font-bold text-muted-foreground">
                        {activity.avgHr} bpm
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Route polyline preview */}
              {activity.polyline && (
                <div className="shrink-0 border-l-3 border-border bg-muted/40 flex items-center justify-center px-2">
                  <RoutePreview
                    polyline={activity.polyline}
                    color={ACCENT_COLOR[activity.type] ?? "hsl(312, 100%, 67%)"}
                    width={72}
                    height={56}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RecentRuns;
