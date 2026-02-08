"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { formatDuration, formatPace } from "@/lib/mockData";
import type { SegmentSummary } from "@/lib/segments";

interface SegmentEffortHistoryProps {
  segment: SegmentSummary;
}

const PrBadge = ({ rank }: { rank: number }) => {
  const colors: Record<number, string> = {
    1: "bg-yellow-400 text-black",
    2: "bg-gray-300 text-black",
    3: "bg-orange-400 text-black",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-black uppercase ${colors[rank] ?? "bg-muted"}`}
      aria-label={`PR rank ${rank}`}
    >
      <Trophy className="h-3 w-3" />
      {rank === 1 ? "PR" : `#${rank}`}
    </span>
  );
};

const SegmentEffortHistory = ({ segment }: SegmentEffortHistoryProps) => {
  const distKm = segment.distance / 1000;

  // Show efforts in reverse chronological order (most recent first)
  const efforts = [...segment.efforts].reverse();

  return (
    <div className="border-3 border-border bg-background shadow-neo overflow-hidden">
      <div className="p-4 border-b-3 border-border">
        <h3 className="font-black text-lg uppercase tracking-wider">
          Effort History
        </h3>
        <p className="text-xs font-bold text-muted-foreground mt-1">
          {segment.effortCount} effort{segment.effortCount !== 1 ? "s" : ""} on{" "}
          {segment.name}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-3 border-border bg-muted">
              <th className="text-left p-3 font-black text-xs uppercase">
                Date
              </th>
              <th className="text-left p-3 font-black text-xs uppercase">
                Activity
              </th>
              <th className="text-right p-3 font-black text-xs uppercase">
                Time
              </th>
              <th className="text-right p-3 font-black text-xs uppercase">
                Pace
              </th>
              <th className="text-right p-3 font-black text-xs uppercase">
                Avg HR
              </th>
              <th className="text-right p-3 font-black text-xs uppercase">
                PR
              </th>
            </tr>
          </thead>
          <tbody>
            {efforts.map((effort) => {
              const pace =
                distKm > 0 && effort.elapsed_time > 0
                  ? effort.elapsed_time / 60 / distKm
                  : 0;

              const dateStr = new Date(
                effort.activityDate,
              ).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              return (
                <tr
                  key={effort.id}
                  className="border-b-3 border-border last:border-b-0"
                >
                  <td className="p-3 font-bold text-sm whitespace-nowrap">
                    {dateStr}
                  </td>
                  <td className="p-3 font-bold text-sm max-w-[200px] truncate">
                    <Link
                      href={`/activity/${effort.activityId}`}
                      className="hover:text-primary transition-colors underline-offset-2 hover:underline"
                      aria-label={`View activity ${effort.activityName}`}
                    >
                      {effort.activityName}
                    </Link>
                  </td>
                  <td className="p-3 font-black text-sm text-right whitespace-nowrap">
                    {formatDuration(effort.elapsed_time)}
                  </td>
                  <td className="p-3 font-bold text-sm text-right whitespace-nowrap">
                    {pace > 0 ? `${formatPace(pace)}/km` : "—"}
                  </td>
                  <td className="p-3 font-bold text-sm text-right whitespace-nowrap">
                    {effort.average_heartrate
                      ? `${Math.round(effort.average_heartrate)} bpm`
                      : "—"}
                  </td>
                  <td className="p-3 text-right">
                    {effort.pr_rank && effort.pr_rank <= 3 ? (
                      <PrBadge rank={effort.pr_rank} />
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SegmentEffortHistory;
