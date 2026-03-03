"use client";

import { Star, Ruler, TrendingUp, Mountain, Clock, Hash } from "lucide-react";
import { formatDuration, formatPace } from "@/lib/activityModel";
import type { SegmentSummary } from "@/lib/segments";

interface StarredSegmentCardProps {
  segment: SegmentSummary;
  onSelect: (segmentId: number) => void;
}

const StarredSegmentCard = ({ segment, onSelect }: StarredSegmentCardProps) => {
  const distKm = segment.distance / 1000;
  const bestPace =
    distKm > 0 && segment.bestEffort.elapsed_time > 0
      ? segment.bestEffort.elapsed_time / 60 / distKm
      : 0;

  // Trend: compare last effort vs best effort
  const lastTime = segment.lastEffort.elapsed_time;
  const bestTime = segment.bestEffort.elapsed_time;
  const isLastBest = lastTime === bestTime;
  const trendPct =
    bestTime > 0 ? ((lastTime - bestTime) / bestTime) * 100 : 0;

  const handleClick = () => {
    onSelect(segment.segmentId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(segment.segmentId);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`View segment ${segment.name}`}
      className="border-3 border-border border-l-[6px] border-l-page bg-background shadow-neo hover:shadow-neo-lg hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all active:shadow-neo-sm active:translate-x-[1px] active:translate-y-[1px] cursor-pointer overflow-hidden"
    >
      {/* Header — tinted accent strip */}
      <div className="bg-page/5 border-b-3 border-border px-3 md:px-5 py-2.5 md:py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-black text-sm uppercase tracking-wider truncate">
              {segment.name}
            </p>
            {segment.city && (
              <p className="text-xs font-bold text-muted-foreground mt-0.5 truncate">
                {segment.city}
                {segment.state ? `, ${segment.state}` : ""}
              </p>
            )}
          </div>
          <Star
            className="h-4 w-4 text-accent fill-accent shrink-0"
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="p-3 md:p-5">
        {/* Best time — hero value */}
        <p className="text-2xl md:text-3xl font-black leading-tight">
          {formatDuration(segment.bestEffort.elapsed_time)}
        </p>
        <span className="text-[10px] font-black uppercase tracking-widest text-primary">Best Time</span>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-x-3 md:gap-x-4 gap-y-1.5 md:gap-y-2 mt-3 md:mt-4">
          <div className="flex items-center gap-1.5 min-w-0">
            <Ruler
              className="h-3 w-3 md:h-3.5 md:w-3.5 text-secondary shrink-0"
              aria-hidden="true"
            />
            <span className="text-xs md:text-sm font-bold truncate">
              {distKm >= 1 ? `${distKm.toFixed(2)} km` : `${Math.round(segment.distance)}m`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <Mountain
              className="h-3 w-3 md:h-3.5 md:w-3.5 text-accent-foreground shrink-0"
              aria-hidden="true"
            />
            <span className="text-xs md:text-sm font-bold">
              {segment.averageGrade.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <Clock
              className="h-3 w-3 md:h-3.5 md:w-3.5 text-primary shrink-0"
              aria-hidden="true"
            />
            <span className="text-xs md:text-sm font-bold truncate">
              {bestPace > 0 ? `${formatPace(bestPace)}/km` : "—"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <Hash
              className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground shrink-0"
              aria-hidden="true"
            />
            <span className="text-xs md:text-sm font-bold truncate">
              {segment.effortCount} effort{segment.effortCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Trend indicator — pill badge */}
        <div className="mt-3">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border ${
              isLastBest
                ? "bg-zone-1/15 text-zone-1"
                : trendPct < 5
                  ? "bg-accent/15 text-accent-foreground"
                  : "bg-destructive/15 text-destructive"
            }`}
          >
            <TrendingUp className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            {isLastBest
              ? "PR!"
              : `+${trendPct.toFixed(1)}%`}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StarredSegmentCard;
