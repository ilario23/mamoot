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
} from "recharts";
import { formatPace, formatDuration } from "@/lib/mockData";
import { computeSegmentProgression } from "@/lib/segments";
import type { SegmentSummary } from "@/lib/segments";

interface SegmentProgressionChartProps {
  segment: SegmentSummary;
}

const SegmentProgressionChart = ({
  segment,
}: SegmentProgressionChartProps) => {
  const data = useMemo(
    () => computeSegmentProgression(segment.efforts),
    [segment.efforts],
  );

  if (data.length < 2) {
    return (
      <div className="border-3 border-border p-5 bg-background shadow-neo">
        <h3 className="font-black text-lg mb-2 uppercase tracking-wider">
          Progression
        </h3>
        <p className="text-sm font-bold text-muted-foreground">
          Need at least 2 efforts to show a progression chart.
        </p>
      </div>
    );
  }

  const chartData = data.map((point) => ({
    ...point,
    dateLabel: new Date(point.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="border-3 border-border p-3 md:p-5 bg-background shadow-neo overflow-hidden">
      <h3 className="font-black text-base md:text-lg mb-3 md:mb-4 uppercase tracking-wider">
        Progression
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ left: -10, right: 5 }}>
          <CartesianGrid
            strokeDasharray="0"
            stroke="#000"
            strokeWidth={1}
            strokeOpacity={0.15}
          />
          <XAxis
            dataKey="dateLabel"
            tick={{ fontWeight: 700, fontSize: 10 }}
            stroke="#000"
            strokeWidth={2}
          />
          <YAxis
            reversed
            tick={{ fontWeight: 700, fontSize: 10 }}
            stroke="#000"
            strokeWidth={2}
            tickFormatter={(val: number) => formatPace(val)}
            width={45}
          />
          <Tooltip
            contentStyle={{
              border: "3px solid #000",
              borderRadius: 0,
              fontWeight: 700,
              backgroundColor: "#fff",
            }}
            formatter={(value: number, name: string) => {
              if (name === "pace") {
                return [formatPace(value), "Pace"];
              }
              return [value, name];
            }}
            labelFormatter={(_label: string, payload) => {
              if (payload && payload.length > 0) {
                const point = payload[0].payload;
                return `${point.activityName} — ${formatDuration(point.time)}`;
              }
              return _label;
            }}
          />
          <Line
            type="monotone"
            dataKey="pace"
            stroke="hsl(312 100% 67%)"
            strokeWidth={3}
            dot={{
              r: 5,
              fill: "hsl(312 100% 67%)",
              stroke: "#000",
              strokeWidth: 2,
            }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SegmentProgressionChart;
