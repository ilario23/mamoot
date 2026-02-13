"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ZONE_COLORS, ZONE_NAMES } from "@/lib/mockData";
import { useActivities, usePerActivityZoneBreakdowns } from "@/hooks/useStrava";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import { Loader2 } from "lucide-react";

const WEEKS_WINDOW = 4;

const VolumeChart = () => {
  const { isAuthenticated } = useStravaAuth();
  const { data: activities, isLoading: activitiesLoading } = useActivities();
  const {
    data: breakdownMap,
    isLoading: breakdownsLoading,
    progress,
  } = usePerActivityZoneBreakdowns(WEEKS_WINDOW);

  const isLoading = activitiesLoading || breakdownsLoading;

  const chartData = useMemo(() => {
    if (!activities || activities.length === 0 || !breakdownMap) return [];

    const weeks: Record<string, Record<string, number>> = {};
    const now = new Date();

    activities.forEach((run) => {
      const runDate = new Date(run.date);
      const diffDays = Math.floor(
        (now.getTime() - runDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const weekNum = Math.floor(diffDays / 7);

      if (weekNum >= WEEKS_WINDOW) return;

      const weekLabel = `W${WEEKS_WINDOW - weekNum}`;
      if (!weeks[weekLabel])
        weeks[weekLabel] = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, z6: 0 };

      const breakdown = breakdownMap.get(run.id);
      if (breakdown) {
        // Use stream-based per-zone distance
        for (let z = 1; z <= 6; z++) {
          weeks[weekLabel][`z${z}`] += breakdown.zones[z]?.distance ?? 0;
        }
      } else {
        // No stream data available — skip this activity
      }
    });

    return ["W1", "W2", "W3", "W4"].map((week) => ({
      week,
      z1: Number((weeks[week]?.z1 || 0).toFixed(1)),
      z2: Number((weeks[week]?.z2 || 0).toFixed(1)),
      z3: Number((weeks[week]?.z3 || 0).toFixed(1)),
      z4: Number((weeks[week]?.z4 || 0).toFixed(1)),
      z5: Number((weeks[week]?.z5 || 0).toFixed(1)),
      z6: Number((weeks[week]?.z6 || 0).toFixed(1)),
    }));
  }, [activities, breakdownMap]);

  if (!isAuthenticated) return null;

  if (isLoading) {
    const showProgress = progress.total > 0;
    return (
      <div className="border-3 border-border p-3 md:p-5 bg-background shadow-neo flex flex-col items-center justify-center min-h-[220px] md:min-h-[300px] gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        {showProgress ? (
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
        ) : (
          <p className="text-sm font-bold text-muted-foreground">
            Loading volume data…
          </p>
        )}
      </div>
    );
  }

  if (chartData.length === 0) return null;

  return (
    <div className="border-3 border-border p-3 md:p-5 bg-background shadow-neo">
      <h3 className="font-black text-base md:text-lg mb-3 md:mb-4 uppercase tracking-wider">
        4-Week Volume by Zone
      </h3>
      <ResponsiveContainer width="100%" height={240}>

        <BarChart data={chartData}>
          <CartesianGrid
            strokeDasharray="0"
            stroke="#000"
            strokeWidth={1}
            strokeOpacity={0.15}
          />
          <XAxis
            dataKey="week"
            tick={{ fontWeight: 700, fontSize: 14 }}
            stroke="#000"
            strokeWidth={2}
          />
          <YAxis
            tick={{ fontWeight: 700, fontSize: 12 }}
            stroke="#000"
            strokeWidth={2}
            label={{
              value: "km",
              angle: -90,
              position: "insideLeft",
              style: { fontWeight: 700 },
            }}
          />
          <Tooltip
            contentStyle={{
              border: "3px solid #000",
              borderRadius: 0,
              fontWeight: 700,
              backgroundColor: "#fff",
            }}
          />
          <Legend
            formatter={(value: string) => {
              const num = Number(value.replace("z", ""));
              return ZONE_NAMES[num] || value;
            }}
          />
          {[1, 2, 3, 4, 5, 6].map((z) => (
            <Bar
              key={z}
              dataKey={`z${z}`}
              stackId="a"
              fill={ZONE_COLORS[z]}
              stroke="#000"
              strokeWidth={2}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default VolumeChart;
