"use client";

import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  getZoneForHr,
  formatDuration,
  ZONE_COLORS,
  ZONE_NAMES,
} from "@/lib/mockData";
import { useSettings } from "@/contexts/SettingsContext";
import { useActivities } from "@/hooks/useStrava";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import { Loader2 } from "lucide-react";

type MetricMode = "time" | "distance";

const PERIOD_OPTIONS = [
  { label: "2 weeks", value: 2 },
  { label: "4 weeks", value: 4 },
  { label: "8 weeks", value: 8 },
  { label: "12 weeks", value: 12 },
] as const;

const ZONE_KEYS = [1, 2, 3, 4, 5, 6] as const;

const PaceZoneDistribution = () => {
  const { settings } = useSettings();
  const { isAuthenticated } = useStravaAuth();
  const { data: activities, isLoading } = useActivities();
  const [metric, setMetric] = useState<MetricMode>("time");
  const [weeks, setWeeks] = useState(4);

  const chartData = useMemo(() => {
    if (!activities || activities.length === 0) return [];

    const now = new Date();
    const cutoff = new Date(
      now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000
    );

    const totals: Record<number, number> = {};
    ZONE_KEYS.forEach((z) => {
      totals[z] = 0;
    });

    activities.forEach((activity) => {
      const actDate = new Date(activity.date);
      if (actDate < cutoff) return;
      if (activity.avgHr <= 0) return;

      const zone = getZoneForHr(activity.avgHr, settings.zones);
      if (metric === "time") {
        totals[zone] += activity.duration;
      } else {
        totals[zone] += activity.distance;
      }
    });

    const total = ZONE_KEYS.reduce((sum, z) => sum + totals[z], 0);
    if (total === 0) return [];

    return ZONE_KEYS.map((z) => ({
      name: `Z${z} ${ZONE_NAMES[z]}`,
      value: Number(totals[z].toFixed(metric === "distance" ? 1 : 0)),
      zone: z,
      pct: Number(((totals[z] / total) * 100).toFixed(1)),
    })).filter((d) => d.value > 0);
  }, [activities, settings.zones, metric, weeks]);

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className="border-3 border-border p-5 bg-background shadow-neo flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleMetricChange = (mode: MetricMode) => {
    setMetric(mode);
  };

  const handleWeeksChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setWeeks(Number(e.target.value));
  };

  const formatValue = (value: number): string => {
    if (metric === "time") return formatDuration(value);
    return `${value.toFixed(1)} km`;
  };

  return (
    <div className="border-3 border-border p-5 bg-background shadow-neo">
      {/* Header + controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h3 className="font-black text-lg uppercase tracking-wider">
          Pace Zone Distribution
        </h3>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Time / Distance toggle */}
          <div className="flex border-3 border-border overflow-hidden">
            <button
              onClick={() => handleMetricChange("time")}
              className={`px-3 py-1.5 font-black text-xs uppercase tracking-wider transition-colors ${
                metric === "time"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
              aria-label="Show time distribution"
              aria-pressed={metric === "time"}
              tabIndex={0}
            >
              Time
            </button>
            <button
              onClick={() => handleMetricChange("distance")}
              className={`px-3 py-1.5 font-black text-xs uppercase tracking-wider border-l-3 border-border transition-colors ${
                metric === "distance"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
              aria-label="Show distance distribution"
              aria-pressed={metric === "distance"}
              tabIndex={0}
            >
              Distance
            </button>
          </div>

          {/* Period selector */}
          <select
            value={weeks}
            onChange={handleWeeksChange}
            className="px-3 py-1.5 border-3 border-border font-bold text-xs uppercase tracking-wider bg-background focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
            aria-label="Select time period"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart or empty state */}
      {chartData.length === 0 ? (
        <div className="flex items-center justify-center min-h-[260px]">
          <div className="text-center">
            <p className="font-black text-lg">No data</p>
            <p className="text-sm font-bold text-muted-foreground mt-1">
              No activities with heart rate found in the last {weeks} weeks
            </p>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={110}
              innerRadius={50}
              strokeWidth={3}
              stroke="#000"
              label={({ name, pct }) => `${name.split(" ")[0]} ${pct}%`}
              labelLine={{ stroke: "#000", strokeWidth: 2 }}
            >
              {chartData.map((entry) => (
                <Cell
                  key={`cell-${entry.zone}`}
                  fill={ZONE_COLORS[entry.zone]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                border: "3px solid #000",
                borderRadius: 0,
                fontWeight: 700,
                backgroundColor: "#fff",
              }}
              formatter={(value: number, name: string) => [
                formatValue(value),
                name,
              ]}
            />
            <Legend
              formatter={(value: string) => (
                <span className="font-bold text-xs">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default PaceZoneDistribution;
