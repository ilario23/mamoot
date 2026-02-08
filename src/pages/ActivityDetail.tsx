import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  runs,
  detailedStreams,
  formatPace,
  formatDuration,
  computeSplits,
} from "@/lib/mockData";
import ActivityCharts from "@/components/activity/ActivityCharts";
import SplitsTable from "@/components/activity/SplitsTable";

const ActivityDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const run = runs.find((r) => r.id === id);

  if (!run) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="border-3 border-foreground p-8 shadow-neo text-center">
          <h2 className="font-black text-2xl mb-4">Run Not Found</h2>
          <p className="font-bold text-muted-foreground mb-4">
            This activity doesn't exist.
          </p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-3 bg-foreground text-background font-black border-3 border-foreground hover:bg-primary transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const stream = detailedStreams[run.id];
  const splits = stream ? computeSplits(stream) : [];

  const stats = [
    { label: "Distance", value: `${run.distance.toFixed(1)} km` },
    { label: "Duration", value: formatDuration(run.duration) },
    { label: "Avg Pace", value: `${formatPace(run.avgPace)}/km` },
    { label: "Avg HR", value: `${run.avgHr} bpm` },
    { label: "Elevation", value: `${run.elevationGain}m ↑` },
    { label: "Calories", value: `${run.calories} kcal` },
  ];

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 font-black text-sm hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </button>

      {/* Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
          {run.name}
        </h1>
        <p className="font-bold text-muted-foreground mt-1">
          {new Date(run.date).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat, i) => (
          <div
            key={i}
            className="border-3 border-foreground p-4 bg-background shadow-neo-sm"
          >
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </p>
            <p className="text-xl md:text-2xl font-black mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Map placeholder */}
      <div className="border-3 border-foreground p-8 bg-muted shadow-neo flex items-center justify-center min-h-[200px]">
        <p className="font-black text-lg text-muted-foreground uppercase tracking-wider">
          🗺️ Map Visualization
        </p>
      </div>

      {/* Charts */}
      {stream ? (
        <ActivityCharts stream={stream} />
      ) : (
        <div className="border-3 border-foreground p-8 bg-muted shadow-neo flex items-center justify-center min-h-[200px]">
          <p className="font-black text-muted-foreground uppercase">
            No detailed stream data available for this run
          </p>
        </div>
      )}

      {/* Splits */}
      {splits.length > 0 && <SplitsTable splits={splits} />}
    </div>
  );
};

export default ActivityDetail;
