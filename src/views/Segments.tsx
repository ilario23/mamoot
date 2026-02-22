"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Star, Ruler, Mountain, Hash, TrendingUp, MapPin } from "lucide-react";
import { NeoLoader } from "@/components/ui/neo-loader";
import { formatDuration } from "@/lib/mockData";
import { useActivities, useStarredSegments, useSegmentDetail } from "@/hooks/useStrava";

const ActivityMap = dynamic(
  () => import("@/components/activity/ActivityMap"),
  {
    ssr: false,
    loading: () => (
      <div className="border-3 border-border bg-muted shadow-neo flex items-center justify-center min-h-[300px] md:min-h-[400px]">
        <NeoLoader label="Loading map" size="sm" colorClass="bg-secondary" />
      </div>
    ),
  },
);
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import { useSyncActivityDetails } from "@/hooks/useSyncActivityDetails";
import { groupEffortsBySegment } from "@/lib/segments";
import type { SegmentSummary } from "@/lib/segments";
import type { TimePeriod } from "@/lib/records";
import TimePeriodSelector from "@/components/records/TimePeriodSelector";
import SyncProgress from "@/components/records/SyncProgress";
import StarredSegmentCard from "@/components/segments/StarredSegmentCard";
import SegmentList from "@/components/segments/SegmentList";
import SegmentProgressionChart from "@/components/segments/SegmentProgressionChart";
import SegmentEffortHistory from "@/components/segments/SegmentEffortHistory";

const Segments = () => {
  const { isAuthenticated } = useStravaAuth();
  const { data: activities, isLoading } = useActivities();
  const { data: starredSegments } = useStarredSegments();
  const searchParams = useSearchParams();

  // Background sync for segment efforts
  const syncState = useSyncActivityDetails(activities, isAuthenticated, {
    initialBatchSize: 30,
  });

  const [period, setPeriod] = useState<TimePeriod>("4w");
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(
    null,
  );

  // Fetch segment detail (polyline for map) when a segment is selected
  const { data: segmentDetail, isLoading: segmentDetailLoading } =
    useSegmentDetail(selectedSegmentId);

  // Pick up deep-link ?id=... from URL (e.g. coming from activity detail)
  useEffect(() => {
    const idParam = searchParams.get("id");
    if (idParam) {
      setSelectedSegmentId(Number(idParam));
    }
  }, [searchParams]);

  // Compute grouped segments from synced efforts
  const allSegments = useMemo(
    () => groupEffortsBySegment(syncState.segmentEfforts, period),
    [syncState.segmentEfforts, period],
  );

  // Starred segment IDs (from Strava API)
  const starredIds = useMemo(() => {
    if (!starredSegments) return new Set<number>();
    return new Set(starredSegments.map((s) => s.id));
  }, [starredSegments]);

  // Segments that are starred — merge data from efforts and API
  const starredSegmentSummaries = useMemo(() => {
    if (starredIds.size === 0) return [];
    return allSegments.filter((s) => starredIds.has(s.segmentId) || s.starred);
  }, [allSegments, starredIds]);

  // Find the currently selected segment
  const selectedSegment: SegmentSummary | null = useMemo(() => {
    if (selectedSegmentId === null) return null;
    return allSegments.find((s) => s.segmentId === selectedSegmentId) ?? null;
  }, [allSegments, selectedSegmentId]);

  const handleSelectSegment = (segmentId: number) => {
    setSelectedSegmentId(segmentId);
  };

  const handleClearSelection = () => {
    setSelectedSegmentId(null);
  };

  const handlePeriodChange = (p: TimePeriod) => {
    setPeriod(p);
  };

  // --- Not authenticated ---
  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
          Segments
        </h1>
        <div className="border-3 border-border p-8 bg-background shadow-neo text-center">
          <p className="font-black text-lg">
            Connect Strava to see your segments
          </p>
          <p className="text-sm font-bold text-muted-foreground mt-2">
            Go to Settings to link your Strava account
          </p>
        </div>
      </div>
    );
  }

  // --- Loading ---
  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
          Segments
        </h1>
        <div className="border-3 border-border p-8 bg-background shadow-neo flex items-center justify-center min-h-[300px]">
          <NeoLoader label="Loading segments" />
        </div>
      </div>
    );
  }

  // --- No activities ---
  if (!activities || activities.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
          Segments
        </h1>
        <div className="border-3 border-border p-8 bg-background shadow-neo text-center space-y-3">
          <div className="w-12 h-12 mx-auto bg-page/10 border-3 border-border shadow-neo-sm flex items-center justify-center">
            <MapPin className="h-6 w-6 text-page" />
          </div>
          <p className="font-black text-lg">No activities found</p>
          <p className="text-sm font-bold text-muted-foreground">
            Record some activities on Strava to see your segments here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 overflow-hidden">
      {/* Page title */}
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
        Segments
      </h1>

      {/* Sync progress — hidden once we have cached data to show */}
      <SyncProgress state={syncState} hasData={syncState.segmentEfforts.length > 0} />

      {/* Period filter */}
      <div className="flex items-center justify-end">
        <TimePeriodSelector value={period} onChange={handlePeriodChange} />
      </div>

      {/* Starred Segments Section */}
      {starredSegmentSummaries.length > 0 && !selectedSegment && (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 bg-accent text-accent-foreground border-3 border-border shadow-neo-sm">
              <Star className="h-4 w-4 fill-current" aria-hidden="true" />
            </div>
            <h2 className="font-black text-xl uppercase tracking-wider">
              Starred Segments
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {starredSegmentSummaries.map((seg) => (
              <StarredSegmentCard
                key={seg.segmentId}
                segment={seg}
                onSelect={handleSelectSegment}
              />
            ))}
          </div>
        </div>
      )}

      {/* Segment Detail (when selected) */}
      {selectedSegment ? (
        <div className="space-y-6">
          {/* Back to list */}
          <button
            onClick={handleClearSelection}
            className="inline-flex items-center gap-2 px-3 py-1.5 font-black text-xs uppercase tracking-wider border-3 border-border bg-background shadow-neo-sm hover:shadow-neo hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
            aria-label="Back to segment list"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All segments
          </button>

          {/* Segment header card */}
          <div className="border-3 border-border bg-background shadow-neo border-l-[6px] border-l-page p-4 md:p-5 min-w-0">
            <h2 className="text-xl md:text-3xl font-black uppercase tracking-tight break-words">
              {selectedSegment.name}
            </h2>
            {selectedSegment.city && (
              <p className="text-xs md:text-sm font-bold text-muted-foreground mt-1">
                {selectedSegment.city}
                {selectedSegment.state ? `, ${selectedSegment.state}` : ""}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-secondary/10 text-secondary border-2 border-border">
                <Ruler className="h-2.5 w-2.5" />
                {(selectedSegment.distance / 1000).toFixed(2)} km
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-accent/15 text-accent-foreground border-2 border-border">
                <Mountain className="h-2.5 w-2.5" />
                {selectedSegment.averageGrade.toFixed(1)}% avg
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border-2 border-border">
                <TrendingUp className="h-2.5 w-2.5" />
                {selectedSegment.maximumGrade.toFixed(1)}% max
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-muted border-2 border-border">
                <Hash className="h-2.5 w-2.5" />
                {selectedSegment.effortCount} effort{selectedSegment.effortCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <div className="border-3 border-border border-l-[6px] border-l-primary p-3 md:p-4 bg-background shadow-neo-sm">
              <p className="text-[10px] md:text-xs font-black uppercase tracking-wider text-primary">
                Best Time
              </p>
              <p className="text-lg md:text-2xl font-black mt-0.5 md:mt-1">
                {formatDuration(selectedSegment.bestEffort.elapsed_time)}
              </p>
            </div>
            <div className="border-3 border-border border-l-[6px] border-l-secondary p-3 md:p-4 bg-background shadow-neo-sm">
              <p className="text-[10px] md:text-xs font-black uppercase tracking-wider text-secondary">
                Last Time
              </p>
              <p className="text-lg md:text-2xl font-black mt-0.5 md:mt-1">
                {formatDuration(selectedSegment.lastEffort.elapsed_time)}
              </p>
            </div>
            <div className="border-3 border-border border-l-[6px] border-l-accent p-3 md:p-4 bg-background shadow-neo-sm">
              <p className="text-[10px] md:text-xs font-black uppercase tracking-wider text-accent-foreground">
                Elevation
              </p>
              <p className="text-lg md:text-2xl font-black mt-0.5 md:mt-1">
                {Math.round(
                  selectedSegment.elevationHigh -
                    selectedSegment.elevationLow,
                )}
                m
              </p>
            </div>
            <div className="border-3 border-border border-l-[6px] border-l-destructive p-3 md:p-4 bg-background shadow-neo-sm">
              <p className="text-[10px] md:text-xs font-black uppercase tracking-wider text-destructive">
                Max Grade
              </p>
              <p className="text-lg md:text-2xl font-black mt-0.5 md:mt-1">
                {selectedSegment.maximumGrade.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Segment map */}
          {segmentDetailLoading ? (
            <div className="border-3 border-border bg-muted shadow-neo flex items-center justify-center min-h-[250px] md:min-h-[400px]">
              <NeoLoader label="Loading map" size="sm" colorClass="bg-secondary" />
            </div>
          ) : segmentDetail?.map?.polyline ? (
            <ActivityMap polyline={segmentDetail.map.polyline} />
          ) : (
            <div className="border-3 border-border p-8 bg-muted shadow-neo flex items-center justify-center min-h-[200px]">
              <p className="font-black text-muted-foreground uppercase">
                No route data available
              </p>
            </div>
          )}

          {/* Progression chart */}
          <SegmentProgressionChart segment={selectedSegment} />

          {/* Effort history table */}
          <SegmentEffortHistory segment={selectedSegment} />
        </div>
      ) : (
        /* Segment list (when nothing is selected) */
        allSegments.length > 0 ? (
          <SegmentList
            segments={allSegments}
            selectedSegmentId={selectedSegmentId}
            onSelect={handleSelectSegment}
          />
        ) : syncState.isSyncing ? (
          <div className="border-3 border-border p-8 bg-background shadow-neo flex items-center justify-center min-h-[200px]">
            <NeoLoader label="Syncing segments" size="sm" colorClass="bg-accent" />
          </div>
        ) : (
          <div className="border-3 border-border p-8 bg-background shadow-neo text-center space-y-3">
            <div className="w-12 h-12 mx-auto bg-page/10 border-3 border-border shadow-neo-sm flex items-center justify-center">
              <MapPin className="h-6 w-6 text-page" />
            </div>
            <p className="font-black text-lg">No segments found</p>
            <p className="text-sm font-bold text-muted-foreground">
              Segments are discovered from your activity details. Make sure your
              activities have been fully synced.
            </p>
          </div>
        )
      )}
    </div>
  );
};

export default Segments;
