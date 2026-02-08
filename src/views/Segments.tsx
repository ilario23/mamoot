"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2, ArrowLeft } from "lucide-react";
import { formatDuration } from "@/lib/mockData";
import { useActivities, useStarredSegments, useSegmentDetail } from "@/hooks/useStrava";

const ActivityMap = dynamic(
  () => import("@/components/activity/ActivityMap"),
  {
    ssr: false,
    loading: () => (
      <div className="border-3 border-border bg-muted shadow-neo flex items-center justify-center min-h-[300px] md:min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
  const syncState = useSyncActivityDetails(activities, isAuthenticated);

  const [period, setPeriod] = useState<TimePeriod>("all");
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
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
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
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
          Segments
        </h1>
        <div className="border-3 border-border p-8 bg-background shadow-neo flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // --- No activities ---
  if (!activities || activities.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
          Segments
        </h1>
        <div className="border-3 border-border p-8 bg-background shadow-neo text-center">
          <p className="font-black text-lg">No activities found</p>
          <p className="text-sm font-bold text-muted-foreground mt-2">
            Record some activities on Strava to see your segments here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page title */}
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
        Segments
      </h1>

      {/* Sync progress */}
      <SyncProgress state={syncState} />

      {/* Period filter */}
      <div className="flex items-center justify-end">
        <TimePeriodSelector value={period} onChange={handlePeriodChange} />
      </div>

      {/* Starred Segments Section */}
      {starredSegmentSummaries.length > 0 && !selectedSegment && (
        <div className="space-y-3">
          <h2 className="font-black text-xl uppercase tracking-wider">
            Starred Segments
          </h2>
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
            className="flex items-center gap-2 font-black text-sm hover:text-primary transition-colors"
            aria-label="Back to segment list"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to all segments
          </button>

          {/* Segment header */}
          <div>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight">
              {selectedSegment.name}
            </h2>
            <div className="flex flex-wrap items-center gap-4 mt-2">
              {selectedSegment.city && (
                <span className="text-sm font-bold text-muted-foreground">
                  {selectedSegment.city}
                  {selectedSegment.state
                    ? `, ${selectedSegment.state}`
                    : ""}
                </span>
              )}
              <span className="text-sm font-bold text-muted-foreground">
                {(selectedSegment.distance / 1000).toFixed(2)} km
              </span>
              <span className="text-sm font-bold text-muted-foreground">
                {selectedSegment.averageGrade.toFixed(1)}% avg grade
              </span>
              <span className="text-sm font-bold text-muted-foreground">
                {selectedSegment.effortCount} effort
                {selectedSegment.effortCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="border-3 border-border p-4 bg-background shadow-neo-sm">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Best Time
              </p>
              <p className="text-xl md:text-2xl font-black mt-1">
                {formatDuration(selectedSegment.bestEffort.elapsed_time)}
              </p>
            </div>
            <div className="border-3 border-border p-4 bg-background shadow-neo-sm">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Last Time
              </p>
              <p className="text-xl md:text-2xl font-black mt-1">
                {formatDuration(selectedSegment.lastEffort.elapsed_time)}
              </p>
            </div>
            <div className="border-3 border-border p-4 bg-background shadow-neo-sm">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Elevation
              </p>
              <p className="text-xl md:text-2xl font-black mt-1">
                {Math.round(
                  selectedSegment.elevationHigh -
                    selectedSegment.elevationLow,
                )}
                m
              </p>
            </div>
            <div className="border-3 border-border p-4 bg-background shadow-neo-sm">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Max Grade
              </p>
              <p className="text-xl md:text-2xl font-black mt-1">
                {selectedSegment.maximumGrade.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Segment map */}
          {segmentDetailLoading ? (
            <div className="border-3 border-border bg-muted shadow-neo flex items-center justify-center min-h-[300px] md:min-h-[400px]">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
            <div className="text-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-3" />
              <p className="font-bold text-muted-foreground text-sm">
                Syncing activity details to discover segments...
              </p>
            </div>
          </div>
        ) : (
          <div className="border-3 border-border p-8 bg-background shadow-neo text-center">
            <p className="font-black text-lg">No segments found</p>
            <p className="text-sm font-bold text-muted-foreground mt-2">
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
