"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import { NeoLoader } from "@/components/ui/neo-loader";
import {
  formatPace,
  formatDuration,
  computeSplits,
  MODEL_OPTIONS,
} from "@/lib/activityModel";
import { useActivities, useActivityDetail, useActivityStreams } from "@/hooks/useStrava";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import { useActivityAIReview } from "@/hooks/useActivityAIReview";
import ActivityCharts from "@/components/activity/ActivityCharts";
import SplitsTable from "@/components/activity/SplitsTable";
import SegmentEffortsTable from "@/components/activity/SegmentEffortsTable";

const ActivityMap = dynamic(
  () => import("@/components/activity/ActivityMap"),
  {
    ssr: false,
    loading: () => (
      <div className="border-3 border-border bg-muted shadow-neo flex items-center justify-center min-h-[250px] md:min-h-[400px]">
        <NeoLoader label="Loading map" size="sm" colorClass="bg-secondary" />
      </div>
    ),
  }
);

const ActivityDetail = () => {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { isAuthenticated } = useStravaAuth();
  const [availableProviders, setAvailableProviders] = useState<string[]>(["OpenAI"]);

  const activityReviewModelOptions = useMemo(
    () =>
      MODEL_OPTIONS.filter(
        (model) =>
          ["gpt-5-nano", "gpt-4.1-nano", "gpt-4o-mini", "claude-haiku-3-5"].includes(
            model.id
          ) && availableProviders.includes(model.provider)
      ).sort((a, b) => (a.inputCostPer1MUsd ?? Number.POSITIVE_INFINITY) - (b.inputCostPer1MUsd ?? Number.POSITIVE_INFINITY)),
    [availableProviders]
  );

  const [selectedReviewModel, setSelectedReviewModel] = useState<string>("gpt-5-nano");
  const activeReviewModel = useMemo(() => {
    const hasCurrentModel = activityReviewModelOptions.some(
      (model) => model.id === selectedReviewModel
    );
    if (hasCurrentModel) return selectedReviewModel;
    return activityReviewModelOptions[0]?.id ?? "";
  }, [activityReviewModelOptions, selectedReviewModel]);
  const { data: activities, isLoading: activitiesLoading } = useActivities();
  const { data: detail } = useActivityDetail(id);
  const { data: stream, isLoading: streamLoading } = useActivityStreams(id);
  const {
    reportText,
    usage,
    savedAt,
    error: reviewError,
    isLoading: reviewLoading,
    hasSavedReview,
    generate: generateReview,
  } = useActivityAIReview({
    activityId: id,
    model: activeReviewModel,
  });

  useEffect(() => {
    fetch("/api/ai/providers")
      .then((res) => res.json())
      .then((data: { providers: string[] }) => {
        setAvailableProviders(data.providers);
      })
      .catch(() => setAvailableProviders(["OpenAI"]));
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="border-3 border-border p-8 shadow-neo text-center">
          <h2 className="font-black text-2xl mb-4">Not Connected</h2>
          <p className="font-bold text-muted-foreground mb-4">
            Connect your Strava account to view activity details.
          </p>
          <button
            onClick={() => router.push("/settings")}
            className="px-6 py-3 bg-foreground text-background font-black border-3 border-border hover:bg-primary transition-colors"
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  if (activitiesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <NeoLoader label="Loading activity" />
      </div>
    );
  }

  const activity = activities?.find((r) => r.id === id);

  if (!activity) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="border-3 border-border p-8 shadow-neo text-center">
          <h2 className="font-black text-2xl mb-4">Activity Not Found</h2>
          <p className="font-bold text-muted-foreground mb-4">
            This activity doesn&apos;t exist or hasn&apos;t been synced yet.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-foreground text-background font-black border-3 border-border hover:bg-primary transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const splits = stream && stream.length > 0 ? computeSplits(stream) : [];

  const stats = [
    { label: "Distance", value: `${activity.distance.toFixed(1)} km` },
    { label: "Duration", value: formatDuration(activity.duration) },
    {
      label: "Avg Pace",
      value: activity.avgPace > 0 ? `${formatPace(activity.avgPace)}/km` : "—",
    },
    {
      label: "Avg HR",
      value: activity.avgHr > 0 ? `${activity.avgHr} bpm` : "—",
    },
    { label: "Elevation", value: `${activity.elevationGain}m` },
    {
      label: "Calories",
      value: (() => {
        const cal = detail?.calories ?? activity.calories;
        return cal > 0 ? `${Math.round(cal)} kcal` : "—";
      })(),
    },
  ];

  const selectedModelMeta = activityReviewModelOptions.find(
    (model) => model.id === activeReviewModel
  );

  const estimatedCostUsd =
    selectedModelMeta &&
    typeof selectedModelMeta.inputCostPer1MUsd === "number" &&
    typeof selectedModelMeta.outputCostPer1MUsd === "number" &&
    usage
      ? (usage.inputTokens / 1_000_000) * selectedModelMeta.inputCostPer1MUsd +
        (usage.outputTokens / 1_000_000) * selectedModelMeta.outputCostPer1MUsd
      : null;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Back */}
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-2 font-black text-sm hover:text-primary transition-colors"
        aria-label="Back to Dashboard"
        tabIndex={0}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Dashboard
      </button>

      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
          {activity.name}
        </h1>
        <p className="text-sm md:text-base font-bold text-muted-foreground mt-1 pl-3 md:pl-0">
          {new Date(activity.date).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
        {stats.map((stat, i) => (
          <div
            key={i}
            className="border-3 border-border p-3 md:p-4 bg-background shadow-neo-sm"
          >
            <p className="text-[10px] md:text-xs font-black uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
            <p className="text-lg md:text-2xl font-black mt-0.5 md:mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Map */}
      {detail?.map?.summary_polyline ? (
        <ActivityMap polyline={detail.map.summary_polyline} />
      ) : (
        <div className="border-3 border-border p-8 bg-muted shadow-neo flex items-center justify-center min-h-[200px]">
          <p className="font-black text-muted-foreground uppercase">
            No route data available
          </p>
        </div>
      )}

      {/* Charts */}
      {streamLoading ? (
        <div className="border-3 border-border p-8 bg-background shadow-neo flex items-center justify-center min-h-[200px]">
          <NeoLoader label="Loading charts" size="sm" colorClass="bg-accent" />
        </div>
      ) : stream && stream.length > 0 ? (
        <ActivityCharts stream={stream} />
      ) : (
        <div className="border-3 border-border p-8 bg-muted shadow-neo flex items-center justify-center min-h-[200px]">
          <p className="font-black text-muted-foreground uppercase">
            No detailed stream data available for this activity
          </p>
        </div>
      )}

      {/* Splits */}
      {splits.length > 0 && <SplitsTable splits={splits} />}

      {/* Segment Efforts */}
      {detail?.segment_efforts && detail.segment_efforts.length > 0 && (
        <SegmentEffortsTable efforts={detail.segment_efforts} />
      )}

      {/* AI Review */}
      <section className="border-3 border-border bg-background shadow-neo p-4 md:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h2 className="font-black text-lg md:text-xl uppercase tracking-wide">AI Review</h2>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-1">
              Stored per activity. Global AI settings stay unchanged.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={activeReviewModel}
              onChange={(event) => setSelectedReviewModel(event.target.value)}
              aria-label="Select AI review model"
              className="px-3 py-2 border-3 border-border bg-background font-black text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {activityReviewModelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => void generateReview()}
              disabled={reviewLoading || !activeReviewModel}
              className="px-4 py-2 border-3 border-border bg-foreground text-background font-black text-xs md:text-sm hover:bg-primary transition-colors disabled:opacity-50"
              aria-label={hasSavedReview ? "Regenerate AI review" : "Generate AI review"}
              tabIndex={0}
            >
              {reviewLoading ? "Generating..." : hasSavedReview ? "Regenerate" : "Generate AI Review"}
            </button>
          </div>
        </div>

        {savedAt && (
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            Saved {new Date(savedAt).toLocaleString("en-GB")}
          </p>
        )}

        {usage && (
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            Tokens: in {usage.inputTokens} / out {usage.outputTokens} / total {usage.totalTokens}
            {estimatedCostUsd !== null ? ` • est. cost $${estimatedCostUsd.toFixed(4)}` : ""}
          </p>
        )}

        {reviewError ? (
          <div className="border-3 border-border bg-destructive/10 p-3">
            <p className="font-black text-sm text-destructive">{reviewError}</p>
          </div>
        ) : null}

        {reportText ? (
          <div className="border-3 border-border bg-muted/20 p-4">
            <pre className="whitespace-pre-wrap text-sm font-bold leading-relaxed">{reportText}</pre>
          </div>
        ) : (
          <div className="border-3 border-border bg-muted/20 p-4">
            <p className="font-black text-sm text-muted-foreground uppercase">
              No saved review for this model yet. Click Generate AI Review.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

export default ActivityDetail;
