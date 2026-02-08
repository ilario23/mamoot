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
import { getZoneForHr, ZONE_COLORS, ZONE_NAMES } from "@/lib/mockData";
import { useSettings } from "@/contexts/SettingsContext";
import { useActivities } from "@/hooks/useStrava";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import { Loader2 } from "lucide-react";

const VolumeChart = () => {
  const { settings } = useSettings();
  const { isAuthenticated } = useStravaAuth();
  const { data: activities, isLoading } = useActivities();

  const chartData = useMemo(() => {
    if (!activities || activities.length === 0) return [];

    const weeks: Record<string, Record<string, number>> = {};
    const now = new Date();

    activities.forEach((run) => {
      const runDate = new Date(run.date);
      const diffDays = Math.floor(
        (now.getTime() - runDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const weekNum = Math.floor(diffDays / 7);

      if (weekNum >= 4) return;

      const weekLabel = `W${4 - weekNum}`;
      if (!weeks[weekLabel])
        weeks[weekLabel] = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, z6: 0 };

      const zone = getZoneForHr(run.avgHr, settings.zones);
      weeks[weekLabel][`z${zone}`] += run.distance;
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
  }, [activities, settings.zones]);

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className="border-3 border-border p-5 bg-background shadow-neo flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (chartData.length === 0) return null;

  return (
    <div className="border-3 border-border p-5 bg-background shadow-neo">
      <h3 className="font-black text-lg mb-4 uppercase tracking-wider">
        4-Week Volume by Zone
      </h3>
      <ResponsiveContainer width="100%" height={300}>
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
