"use client";

import { useRouter } from "next/navigation";
import { formatPace, formatDuration } from "@/lib/mockData";
import { useActivities } from "@/hooks/useStrava";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import { Loader2 } from "lucide-react";

const RecentRuns = () => {
  const router = useRouter();
  const { isAuthenticated } = useStravaAuth();
  const { data: activities, isLoading } = useActivities();

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className="border-3 border-foreground bg-background shadow-neo flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const recentActivities = activities?.slice(0, 10) ?? [];

  if (recentActivities.length === 0) {
    return (
      <div className="border-3 border-foreground p-8 bg-background shadow-neo text-center">
        <p className="font-black text-lg">No activities found</p>
        <p className="text-sm font-bold text-muted-foreground mt-2">
          Record an activity on Strava to see it here
        </p>
      </div>
    );
  }

  return (
    <div className="border-3 border-foreground bg-background shadow-neo overflow-hidden">
      <div className="p-5 border-b-3 border-foreground">
        <h3 className="font-black text-lg uppercase tracking-wider">
          Recent Activities
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-3 border-foreground bg-muted">
              <th className="text-left p-3 font-black text-xs uppercase">
                Date
              </th>
              <th className="text-left p-3 font-black text-xs uppercase">
                Name
              </th>
              <th className="text-right p-3 font-black text-xs uppercase">
                Distance
              </th>
              <th className="text-right p-3 font-black text-xs uppercase hidden sm:table-cell">
                Duration
              </th>
              <th className="text-right p-3 font-black text-xs uppercase">
                Pace
              </th>
              <th className="text-right p-3 font-black text-xs uppercase hidden sm:table-cell">
                HR
              </th>
            </tr>
          </thead>
          <tbody>
            {recentActivities.map((activity) => (
              <tr
                key={activity.id}
                onClick={() => router.push(`/activity/${activity.id}`)}
                className="border-b-3 border-foreground cursor-pointer hover:bg-accent/20 transition-colors"
              >
                <td className="p-3 font-bold text-sm">
                  {new Date(activity.date).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                  })}
                </td>
                <td className="p-3 font-bold text-sm">{activity.name}</td>
                <td className="p-3 font-black text-sm text-right">
                  {activity.distance.toFixed(1)} km
                </td>
                <td className="p-3 font-bold text-sm text-right hidden sm:table-cell">
                  {formatDuration(activity.duration)}
                </td>
                <td className="p-3 font-bold text-sm text-right">
                  {activity.avgPace > 0 ? `${formatPace(activity.avgPace)}/km` : "—"}
                </td>
                <td className="p-3 font-bold text-sm text-right hidden sm:table-cell">
                  {activity.avgHr > 0 ? `${activity.avgHr} bpm` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecentRuns;
