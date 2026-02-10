"use client";

import { useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  formatDuration,
  ZONE_COLORS,
} from "@/lib/mockData";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import { useZoneBreakdowns } from "@/hooks/useStrava";
import { Loader2 } from "lucide-react";

type MetricMode = "time" | "distance";

interface ZoneData {
  name: string;
  value: number;
  zone: number;
  pct: number;
}

const PERIOD_OPTIONS = [
  { label: "2 weeks", value: 2 },
  { label: "4 weeks", value: 4 },
  { label: "8 weeks", value: 8 },
  { label: "12 weeks", value: 12 },
] as const;

const ZONE_KEYS = [1, 2, 3, 4, 5, 6] as const;

const PaceZoneDistribution = () => {
  const { isAuthenticated } = useStravaAuth();
  const isMobile = useIsMobile();
  const [metric, setMetric] = useState<MetricMode>("time");
  const [weeks, setWeeks] = useState(4);

  const { data: zoneTotals, isLoading, progress } = useZoneBreakdowns(weeks);

  const { allZoneData, pieData, maxValue } = useMemo(() => {
    const empty = { allZoneData: [] as ZoneData[], pieData: [] as ZoneData[], maxValue: 0 };
    if (!zoneTotals) return empty;

    const total = metric === "time" ? zoneTotals.totalTime : zoneTotals.totalDistance;
    if (total === 0) return empty;

    const all = ZONE_KEYS.map((z) => {
      const zoneData = zoneTotals.zones[z];
      const value = metric === "time" ? zoneData.time : zoneData.distance;
      return {
        name: `Zone ${z}`,
        value: Number(value.toFixed(metric === "distance" ? 1 : 0)),
        zone: z,
        pct: Number(((value / total) * 100).toFixed(1)),
      };
    });

    const pie = all.filter((d) => d.value > 0);
    const max = Math.max(...all.map((d) => d.value));

    return { allZoneData: all, pieData: pie, maxValue: max };
  }, [zoneTotals, metric]);

  if (!isAuthenticated) return null;

  if (isLoading) {
    const showProgress = progress.total > 0;
    return (
      <div className="border-3 border-border p-5 bg-background shadow-neo flex flex-col items-center justify-center min-h-[300px] gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        {showProgress && (
          <div className="text-center">
            <p className="text-sm font-bold text-muted-foreground">
              Analyzing activities: {progress.done} / {progress.total}
            </p>
            <div className="w-48 h-1.5 bg-muted mt-2 overflow-hidden rounded-full">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
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

  const hasData = allZoneData.length > 0;

  return (
    <div className="border-3 border-border p-3 md:p-5 bg-background shadow-neo">
      {/* Header + controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h3 className="font-black text-lg uppercase tracking-wider">
          Pace Zone Distribution
          <span className="text-muted-foreground text-sm font-bold ml-2 normal-case">
            ({weeks} Weeks)
          </span>
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

      {/* Chart + bars layout or empty state */}
      {!hasData ? (
        <div className="flex items-center justify-center min-h-[260px]">
          <div className="text-center">
            <p className="font-black text-lg">No data</p>
            <p className="text-sm font-bold text-muted-foreground mt-1">
              No activities with heart rate found in the last {weeks} weeks
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Donut chart */}
          <div className="w-full md:w-[280px] flex-shrink-0">
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={isMobile ? 75 : 100}
                  innerRadius={isMobile ? 40 : 55}
                  strokeWidth={3}
                  stroke="var(--border)"
                  paddingAngle={1}
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={`cell-${entry.zone}`}
                      fill={ZONE_COLORS[entry.zone]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    border: "3px solid var(--border)",
                    borderRadius: 0,
                    fontWeight: 700,
                    backgroundColor: "var(--background)",
                    color: "var(--foreground)",
                  }}
                  formatter={(value: number, name: string) => [
                    formatValue(value),
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Zone bars */}
          <div className="flex-1 w-full space-y-3">
            {allZoneData.map((zone) => {
              const barWidth = maxValue > 0 ? (zone.value / maxValue) * 100 : 0;
              return (
                <div
                  key={zone.zone}
                  className="flex items-center gap-3"
                  role="listitem"
                  aria-label={`${zone.name}: ${zone.pct}%, ${formatValue(zone.value)}`}
                >
                  {/* Percentage */}
                  <span className="w-[52px] text-right text-sm font-black tabular-nums flex-shrink-0">
                    {zone.pct}%
                  </span>

                  {/* Zone label */}
                  <span className="w-[60px] text-sm font-bold flex-shrink-0">
                    {zone.name}
                  </span>

                  {/* Bar */}
                  <div className="flex-1 h-6 bg-muted/50 rounded-sm overflow-hidden relative border border-border/30">
                    <div
                      className="h-full rounded-sm transition-all duration-500 ease-out"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: ZONE_COLORS[zone.zone],
                        minWidth: zone.value > 0 ? "4px" : "0px",
                      }}
                    />
                  </div>

                  {/* Value */}
                  <span className="w-[70px] text-right text-sm font-bold tabular-nums flex-shrink-0 text-muted-foreground">
                    {formatValue(zone.value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PaceZoneDistribution;
