"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, ChevronRight, Mountain, Star, MapPin } from "lucide-react";
import { formatDuration } from "@/lib/activityModel";
import { filterSegmentsByQuery } from "@/lib/segments";
import type { SegmentSummary } from "@/lib/segments";

const ESTIMATED_ITEM_HEIGHT = 76;
const SEARCH_DEBOUNCE_MS = 300;

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
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputValue), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const filtered = useMemo(
    () => filterSegmentsByQuery(segments, debouncedQuery),
    [segments, debouncedQuery],
  );

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 8,
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
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
            value={inputValue}
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

      {/* Virtualized list */}
      <div ref={scrollContainerRef} className="max-h-[600px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center">
            <p className="font-bold text-muted-foreground text-sm">
              No segments found
            </p>
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const segment = filtered[virtualRow.index];
              const isSelected = segment.segmentId === selectedSegmentId;
              const distKm = segment.distance / 1000;

              return (
                <button
                  key={segment.segmentId}
                  data-index={virtualRow.index}
                  ref={(node) => virtualizer.measureElement(node)}
                  onClick={() => onSelect(segment.segmentId)}
                  aria-label={`Select segment ${segment.name}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={`w-full text-left p-3 md:p-4 border-b-3 border-border transition-all ${
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
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SegmentList;
