"use client";

import { useState } from "react";
import { Search, ChevronRight, Mountain, Star, MapPin } from "lucide-react";
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
    <div className="border-3 border-border bg-background shadow-neo overflow-hidden w-full">
      {/* Header + search */}
      <div className="p-3 md:p-4 border-b-3 border-border bg-neo-stripe space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 bg-page text-page-foreground border-3 border-border shadow-neo-sm">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <h3 className="font-black text-lg uppercase tracking-wider">
            All Segments
          </h3>
        </div>
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
                className={`w-full text-left p-3 md:p-4 border-b-3 border-border last:border-b-0 transition-all ${
                  isSelected
                    ? "bg-page/8 border-l-[5px] border-l-page"
                    : "bg-background hover:bg-muted/60 hover:border-l-[5px] hover:border-l-page/40"
                }`}
              >
                <div className="grid grid-cols-[1fr_auto] gap-2 md:gap-3 items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {segment.starred && (
                        <Star
                          className="h-3 w-3 text-accent fill-accent shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <p className="font-black text-sm truncate">
                        {segment.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 mt-1 flex-wrap">
                      <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">
                        {distKm >= 1
                          ? `${distKm.toFixed(2)} km`
                          : `${Math.round(segment.distance)}m`}
                      </span>
                      <span className="flex items-center gap-0.5 text-xs font-bold text-muted-foreground whitespace-nowrap">
                        <Mountain className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {segment.averageGrade.toFixed(1)}%
                      </span>
                      <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">
                        {segment.effortCount} effort
                        {segment.effortCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <div className="text-right">
                      <p className={`font-black text-sm whitespace-nowrap ${isSelected ? 'text-page' : ''}`}>
                        {formatDuration(segment.bestEffort.elapsed_time)}
                      </p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">
                        Best
                      </p>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 transition-colors hidden sm:block ${
                        isSelected ? "text-page" : "text-muted-foreground"
                      }`}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default SegmentList;
