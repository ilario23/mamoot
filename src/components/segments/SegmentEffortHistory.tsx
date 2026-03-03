"use client";

import Link from "next/link";
import { Trophy, Clock } from "lucide-react";
import { formatDuration, formatPace } from "@/lib/activityModel";
import type { SegmentSummary } from "@/lib/segments";

interface SegmentEffortHistoryProps {
  segment: SegmentSummary;
}

const PrBadge = ({ rank }: { rank: number }) => {
  const colors: Record<number, string> = {
    1: "bg-accent text-accent-foreground border-accent",
    2: "bg-secondary/20 text-secondary border-secondary/50",
    3: "bg-primary/15 text-primary border-primary/40",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-black uppercase border-2 ${colors[rank] ?? "bg-muted border-border"}`}
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
      <div className="p-4 border-b-3 border-border bg-neo-stripe">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 bg-secondary text-secondary-foreground border-3 border-border shadow-neo-sm">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-black text-lg uppercase tracking-wider">
              Effort History
            </h3>
            <p className="text-xs font-bold text-muted-foreground">
              {segment.effortCount} effort{segment.effortCount !== 1 ? "s" : ""} on{" "}
              {segment.name}
            </p>
          </div>
        </div>
      </div>
      <div className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b-3 border-border bg-muted">
              <th className="text-left p-2 md:p-3 font-black text-[10px] md:text-xs uppercase">
                Date
              </th>
              <th className="text-left p-2 md:p-3 font-black text-[10px] md:text-xs uppercase hidden md:table-cell">
                Activity
              </th>
              <th className="text-right p-2 md:p-3 font-black text-[10px] md:text-xs uppercase">
                Time
              </th>
              <th className="text-right p-2 md:p-3 font-black text-[10px] md:text-xs uppercase hidden sm:table-cell">
                Pace
              </th>
              <th className="text-right p-2 md:p-3 font-black text-[10px] md:text-xs uppercase hidden md:table-cell">
                Avg HR
              </th>
              <th className="text-right p-2 md:p-3 font-black text-[10px] md:text-xs uppercase">
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
                year: "2-digit",
              });

              const isPr = effort.pr_rank === 1;

              return (
                <tr
                  key={effort.id}
                  className={`border-b-3 border-border last:border-b-0 ${isPr ? 'bg-accent/5 border-l-[4px] border-l-accent' : ''}`}
                >
                  <td className="p-2 md:p-3 font-bold text-xs md:text-sm whitespace-nowrap">
                    {dateStr}
                  </td>
                  <td className="p-2 md:p-3 font-bold text-sm max-w-[200px] truncate hidden md:table-cell">
                    <Link
                      href={`/activity/${effort.activityId}`}
                      className="hover:text-primary transition-colors underline-offset-2 hover:underline"
                      aria-label={`View activity ${effort.activityName}`}
                    >
                      {effort.activityName}
                    </Link>
                  </td>
                  <td className="p-2 md:p-3 font-black text-xs md:text-sm text-right whitespace-nowrap">
                    {formatDuration(effort.elapsed_time)}
                  </td>
                  <td className="p-2 md:p-3 font-bold text-sm text-right whitespace-nowrap hidden sm:table-cell">
                    {pace > 0 ? `${formatPace(pace)}/km` : "—"}
                  </td>
                  <td className="p-2 md:p-3 font-bold text-sm text-right whitespace-nowrap hidden md:table-cell">
                    {effort.average_heartrate
                      ? `${Math.round(effort.average_heartrate)} bpm`
                      : "—"}
                  </td>
                  <td className="p-2 md:p-3 text-right">
                    {effort.pr_rank && effort.pr_rank <= 3 ? (
                      <PrBadge rank={effort.pr_rank} />
                    ) : (
                      <span className="text-xs md:text-sm text-muted-foreground">—</span>
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
