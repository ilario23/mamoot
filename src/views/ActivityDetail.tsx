"use client";

import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  formatPace,
  formatDuration,
  computeSplits,
} from "@/lib/mockData";
import { useActivities, useActivityDetail, useActivityStreams } from "@/hooks/useStrava";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import ActivityCharts from "@/components/activity/ActivityCharts";
import SplitsTable from "@/components/activity/SplitsTable";

const ActivityMap = dynamic(
  () => import("@/components/activity/ActivityMap"),
  {
    ssr: false,
    loading: () => (
      <div className="border-3 border-border bg-muted shadow-neo flex items-center justify-center min-h-[300px] md:min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

const ActivityDetail = () => {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { isAuthenticated } = useStravaAuth();
  const { data: activities, isLoading: activitiesLoading } = useActivities();
  const { data: detail } = useActivityDetail(id);
  const { data: stream, isLoading: streamLoading } = useActivityStreams(id);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="border-3 border-border p-8 shadow-neo text-center">
          <h2 className="font-black text-2xl mb-4">Not Connected</h2>
          <p className="font-bold text-muted-foreground mb-4">
            Connect your Strava account to view activity details.
          </p>
          <button
            onClick={() => router.push("/settings")}
            className="px-6 py-3 bg-foreground text-background font-black border-3 border-border hover:bg-primary transition-colors"
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  if (activitiesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activity = activities?.find((r) => r.id === id);

  if (!activity) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="border-3 border-border p-8 shadow-neo text-center">
          <h2 className="font-black text-2xl mb-4">Activity Not Found</h2>
          <p className="font-bold text-muted-foreground mb-4">
            This activity doesn&apos;t exist or hasn&apos;t been synced yet.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-foreground text-background font-black border-3 border-border hover:bg-primary transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const splits = stream && stream.length > 0 ? computeSplits(stream) : [];

  const stats = [
    { label: "Distance", value: `${activity.distance.toFixed(1)} km` },
    { label: "Duration", value: formatDuration(activity.duration) },
    {
      label: "Avg Pace",
      value: activity.avgPace > 0 ? `${formatPace(activity.avgPace)}/km` : "—",
    },
    {
      label: "Avg HR",
      value: activity.avgHr > 0 ? `${activity.avgHr} bpm` : "—",
    },
    { label: "Elevation", value: `${activity.elevationGain}m` },
    {
      label: "Calories",
      value: (() => {
        const cal = detail?.calories ?? activity.calories;
        return cal > 0 ? `${Math.round(cal)} kcal` : "—";
      })(),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-2 font-black text-sm hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </button>

      {/* Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
          {activity.name}
        </h1>
        <p className="font-bold text-muted-foreground mt-1">
          {new Date(activity.date).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat, i) => (
          <div
            key={i}
            className="border-3 border-border p-4 bg-background shadow-neo-sm"
          >
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
            <p className="text-xl md:text-2xl font-black mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Map */}
      {detail?.map?.summary_polyline ? (
        <ActivityMap polyline={detail.map.summary_polyline} />
      ) : (
        <div className="border-3 border-border p-8 bg-muted shadow-neo flex items-center justify-center min-h-[200px]">
          <p className="font-black text-muted-foreground uppercase">
            No route data available
          </p>
        </div>
      )}

      {/* Charts */}
      {streamLoading ? (
        <div className="border-3 border-border p-8 bg-background shadow-neo flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : stream && stream.length > 0 ? (
        <ActivityCharts stream={stream} />
      ) : (
        <div className="border-3 border-border p-8 bg-muted shadow-neo flex items-center justify-center min-h-[200px]">
          <p className="font-black text-muted-foreground uppercase">
            No detailed stream data available for this activity
          </p>
        </div>
      )}

      {/* Splits */}
      {splits.length > 0 && <SplitsTable splits={splits} />}
    </div>
  );
};

export default ActivityDetail;
