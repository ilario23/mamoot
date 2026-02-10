"use client";

import { useState } from "react";
import { Search, ChevronRight, Mountain, Star } from "lucide-react";
import { formatDuration } from "@/lib/mockData";
import { filterSegmentsByQuery } from "@/lib/segments";
import type { SegmentSummary } from "@/lib/segments";

interface SegmentListProps {
  segments: SegmentSummary[];
  selectedSegmentId: number | null;
  onSelect: (segmentId: number) => void;
}

const SegmentList = ({
  segments,
  selectedSegmentId,
  onSelect,
}: SegmentListProps) => {
  const [query, setQuery] = useState("");

  const filtered = filterSegmentsByQuery(segments, query);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  return (
    <div className="border-3 border-border bg-background shadow-neo overflow-hidden max-w-full">
      {/* Header + search */}
      <div className="p-4 border-b-3 border-border space-y-3">
        <h3 className="font-black text-lg uppercase tracking-wider">
          All Segments
        </h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder="Search segments..."
            aria-label="Search segments"
            className="w-full pl-10 pr-4 py-2.5 border-3 border-border bg-background font-bold text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <p className="text-xs font-bold text-muted-foreground">
          {filtered.length} segment{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* List */}
      <div className="max-h-[600px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center">
            <p className="font-bold text-muted-foreground text-sm">
              No segments found
            </p>
          </div>
        ) : (
          filtered.map((segment) => {
            const isSelected = segment.segmentId === selectedSegmentId;
            const distKm = segment.distance / 1000;

            return (
              <button
                key={segment.segmentId}
                onClick={() => onSelect(segment.segmentId)}
                aria-label={`Select segment ${segment.name}`}
                className={`w-full text-left p-4 border-b-3 border-border last:border-b-0 transition-colors flex items-center gap-3 ${
                  isSelected
                    ? "bg-primary/10"
                    : "bg-background hover:bg-muted"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {segment.starred && (
                      <Star
                        className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <p className="font-black text-sm truncate">
                      {segment.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs font-bold text-muted-foreground">
                      {distKm >= 1
                        ? `${distKm.toFixed(2)} km`
                        : `${Math.round(segment.distance)}m`}
                    </span>
                    <span className="flex items-center gap-0.5 text-xs font-bold text-muted-foreground">
                      <Mountain className="h-3 w-3" aria-hidden="true" />
                      {segment.averageGrade.toFixed(1)}%
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {segment.effortCount} effort
                      {segment.effortCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-sm">
                    {formatDuration(segment.bestEffort.elapsed_time)}
                  </p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">
                    Best
                  </p>
                </div>
                <ChevronRight
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isSelected ? "text-primary" : "text-muted-foreground"
                  }`}
                  aria-hidden="true"
                />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SegmentList;
