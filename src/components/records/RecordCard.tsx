"use client";

import { formatDuration, formatPace } from "@/lib/mockData";
import type { DistanceRecord, DistanceBucket } from "@/lib/records";
import type { ActivityType } from "@/lib/mockData";
import { Trophy, Gauge, Ruler, Calendar } from "lucide-react";

const ACCENT_CLASS: Record<ActivityType, string> = {
  Run: "bg-[var(--activity-run-3)]",
  Ride: "bg-[var(--activity-ride-3)]",
  Hike: "bg-[var(--activity-hike-3)]",
  Swim: "bg-[var(--activity-swim-3)]",
};

interface RecordCardProps {
  record: DistanceRecord | null;
  bucket: DistanceBucket;
  activityType: ActivityType;
}

const RecordCard = ({ record, bucket, activityType }: RecordCardProps) => {
  if (!record) {
    return (
      <div className="border-3 border-border bg-background p-5 shadow-neo opacity-50">
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-2">
          {bucket.label}
        </p>
        <p className="text-2xl font-black text-muted-foreground">--:--</p>
        <p className="text-sm font-bold text-muted-foreground mt-1">
          No record yet
        </p>
        <div className="h-2 w-16 mt-3 bg-muted" />
      </div>
    );
  }

  const { effort } = record;
  const distanceKm = effort.distance / 1000;
  const pace = effort.elapsed_time / 60 / distanceKm;
  const recordDate = new Date(effort.activityDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const isPR = effort.pr_rank === 1;

  return (
    <div className="border-3 border-border bg-background p-5 shadow-neo hover:shadow-neo-lg transition-shadow">
      {/* Distance label + PR badge */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-black uppercase tracking-wider">
          {bucket.label}
        </p>
        <div className="flex items-center gap-1.5">
          {isPR && (
            <span className="text-[10px] font-black uppercase bg-accent text-foreground px-1.5 py-0.5 border-2 border-border">
              PR
            </span>
          )}
          <Trophy className="h-4 w-4 text-accent" aria-hidden="true" />
        </div>
      </div>

      {/* Best time — hero value */}
      <p className="text-4xl font-black leading-tight">
        {formatDuration(effort.elapsed_time)}
      </p>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
        <div className="flex items-center gap-1.5">
          <Gauge className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="text-sm font-bold">
            {formatPace(pace)}/km
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Ruler className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="text-sm font-bold">
            {distanceKm.toFixed(2)} km
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="text-sm font-bold">{recordDate}</span>
        </div>
      </div>

      {/* Activity name */}
      <p className="text-xs font-bold text-muted-foreground mt-3 truncate">
        {effort.activityName}
      </p>

      {/* Accent bar */}
      <div className={`h-2 w-16 mt-3 ${ACCENT_CLASS[activityType]}`} />
    </div>
  );
};

export default RecordCard;
