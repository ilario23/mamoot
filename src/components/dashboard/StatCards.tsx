"use client";

import { formatDuration } from "@/lib/mockData";
import { useActivities, useAthleteStats } from "@/hooks/useStrava";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import { Loader2 } from "lucide-react";

const StatCards = () => {
  const { isAuthenticated } = useStravaAuth();
  const { data: activities, isLoading } = useActivities();
  const { data: stats } = useAthleteStats();

  if (!isAuthenticated) {
    return (
      <div className="border-3 border-foreground p-8 bg-background shadow-neo text-center">
        <p className="font-black text-lg">Connect Strava to see your stats</p>
        <p className="text-sm font-bold text-muted-foreground mt-2">
          Go to Settings to link your Strava account
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border-3 border-foreground p-5 bg-background shadow-neo flex items-center justify-center min-h-[120px]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ))}
      </div>
    );
  }

  const allActivities = activities ?? [];

  // Current week (Mon–Sun)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const weekActivities = allActivities.filter((r) => new Date(r.date) >= monday);
  const weekDistance = weekActivities.reduce((sum, r) => sum + r.distance, 0);
  const weekDuration = weekActivities.reduce((sum, r) => sum + r.duration, 0);

  // Average weekly distance (previous 4 weeks)
  const fourWeeksAgo = new Date(monday);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const prevActivities = allActivities.filter(
    (r) => new Date(r.date) >= fourWeeksAgo && new Date(r.date) < monday
  );
  const prevWeeksAvg =
    prevActivities.reduce((sum, r) => sum + r.distance, 0) / 4;
  const loadRatio =
    prevWeeksAvg > 0 ? ((weekDistance / prevWeeksAvg) * 100).toFixed(0) : "—";

  // Use stats for totals if available
  const totalActivities = stats
    ? stats.all_run_totals.count + stats.all_ride_totals.count + stats.all_swim_totals.count
    : allActivities.length;

  const cards = [
    {
      label: "Weekly Volume",
      value: `${weekDistance.toFixed(1)} km`,
      sub: formatDuration(weekDuration),
      accentClass: "bg-secondary",
    },
    {
      label: "Acute Load",
      value: `${loadRatio}%`,
      sub: `${weekDistance.toFixed(1)} vs ${prevWeeksAvg.toFixed(1)} km/wk`,
      accentClass: "bg-accent",
    },
    {
      label: "Total Activities",
      value: `${totalActivities}`,
      sub: "all time",
      accentClass: "bg-primary",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((card, i) => (
        <div
          key={i}
          className="border-3 border-foreground p-5 bg-background shadow-neo"
        >
          <p className="text-xs font-black uppercase tracking-wider mb-2">
            {card.label}
          </p>
          <p className="text-4xl font-black leading-tight">{card.value}</p>
          <p className="text-sm font-bold text-muted-foreground mt-1">
            {card.sub}
          </p>
          <div className={`h-2 w-16 mt-3 ${card.accentClass}`} />
        </div>
      ))}
    </div>
  );
};

export default StatCards;
