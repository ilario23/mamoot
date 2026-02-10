"use client";

import { Star, Ruler, TrendingUp, Mountain, Clock, Hash } from "lucide-react";
import { formatDuration, formatPace } from "@/lib/mockData";
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
      className="border-3 border-border bg-background p-3 md:p-5 shadow-neo hover:shadow-neo-lg transition-shadow cursor-pointer overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
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
          className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0"
          aria-hidden="true"
        />
      </div>

      {/* Best time — hero value */}
      <p className="text-2xl md:text-3xl font-black leading-tight">
        {formatDuration(segment.bestEffort.elapsed_time)}
      </p>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-3 md:gap-x-4 gap-y-1.5 md:gap-y-2 mt-3 md:mt-4">
        <div className="flex items-center gap-1.5 min-w-0">
          <Ruler
            className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground shrink-0"
            aria-hidden="true"
          />
          <span className="text-xs md:text-sm font-bold truncate">
            {distKm >= 1 ? `${distKm.toFixed(2)} km` : `${Math.round(segment.distance)}m`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <Mountain
            className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground shrink-0"
            aria-hidden="true"
          />
          <span className="text-xs md:text-sm font-bold">
            {segment.averageGrade.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <Clock
            className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground shrink-0"
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

      {/* Trend indicator */}
      <div className="flex items-center gap-1.5 mt-3">
        <TrendingUp
          className={`h-3.5 w-3.5 shrink-0 ${
            isLastBest
              ? "text-green-600"
              : trendPct < 5
                ? "text-yellow-600"
                : "text-red-500"
          }`}
          aria-hidden="true"
        />
        <span className="text-xs font-bold text-muted-foreground">
          {isLastBest
            ? "Last effort is your PR"
            : `Last: ${formatDuration(lastTime)} (+${trendPct.toFixed(1)}%)`}
        </span>
      </div>
    </div>
  );
};

export default StarredSegmentCard;
