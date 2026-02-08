"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatPace } from "@/lib/mockData";
import type { ActivityType } from "@/lib/mockData";
import type { ProgressionPoint } from "@/lib/records";
import { BUCKETS_BY_TYPE } from "@/lib/records";

// Distinct colors for each line (distance bucket)
const LINE_COLORS = [
  "hsl(312 100% 67%)", // primary — magenta
  "hsl(217 91% 60%)",  // secondary — blue
  "hsl(48 96% 53%)",   // accent — yellow
  "hsl(142 70% 45%)",  // green
  "hsl(0 84% 60%)",    // red
];

interface PaceProgressionChartProps {
  progressions: Record<string, ProgressionPoint[]>;
  activityType: ActivityType;
}

const PaceProgressionChart = ({
  progressions,
  activityType,
}: PaceProgressionChartProps) => {
  const bucketKeys = Object.keys(progressions);
  const buckets = BUCKETS_BY_TYPE[activityType];

  // Merge all progression points into a unified dataset keyed by date
  const chartData = useMemo(() => {
    if (bucketKeys.length === 0) return [];

    // Collect all unique dates
    const dateSet = new Set<string>();
    for (const key of bucketKeys) {
      for (const point of progressions[key]) {
        dateSet.add(point.date);
      }
    }

    const sortedDates = Array.from(dateSet).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    return sortedDates.map((date) => {
      const entry: Record<string, string | number> = {
        date,
        dateLabel: new Date(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      };
      for (const key of bucketKeys) {
        const point = progressions[key].find((p) => p.date === date);
        if (point) {
          entry[key] = Number(point.pace.toFixed(2));
        }
      }
      return entry;
    });
  }, [progressions, bucketKeys]);

  if (bucketKeys.length === 0) return null;

  return (
    <div className="border-3 border-foreground p-5 bg-background shadow-neo">
      <h3 className="font-black text-lg mb-4 uppercase tracking-wider">
        Pace Progression
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid
            strokeDasharray="0"
            stroke="#000"
            strokeWidth={1}
            strokeOpacity={0.15}
          />
          <XAxis
            dataKey="dateLabel"
            tick={{ fontWeight: 700, fontSize: 12 }}
            stroke="#000"
            strokeWidth={2}
          />
          <YAxis
            reversed
            tick={{ fontWeight: 700, fontSize: 12 }}
            stroke="#000"
            strokeWidth={2}
            tickFormatter={(val: number) => formatPace(val)}
            label={{
              value: "min/km",
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
            formatter={(value: number, name: string) => {
              const bucket = buckets.find((b) => b.key === name);
              return [formatPace(value), bucket?.label ?? name];
            }}
            labelFormatter={(label: string) => label}
          />
          <Legend
            formatter={(value: string) => {
              const bucket = buckets.find((b) => b.key === value);
              return bucket?.label ?? value;
            }}
          />
          {bucketKeys.map((key, idx) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={LINE_COLORS[idx % LINE_COLORS.length]}
              strokeWidth={3}
              dot={{
                r: 5,
                fill: LINE_COLORS[idx % LINE_COLORS.length],
                stroke: "#000",
                strokeWidth: 2,
              }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PaceProgressionChart;
