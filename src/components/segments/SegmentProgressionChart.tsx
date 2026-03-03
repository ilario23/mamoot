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
import { TrendingUp } from "lucide-react";
import { formatPace, formatDuration } from "@/lib/activityModel";
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
        <div className="flex items-center gap-2.5 mb-2">
          <div className="flex items-center justify-center w-7 h-7 bg-primary text-primary-foreground border-3 border-border shadow-neo-sm">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <h3 className="font-black text-lg uppercase tracking-wider">
            Progression
          </h3>
        </div>
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
    <div className="border-3 border-border bg-background shadow-neo overflow-hidden">
      <div className="p-3 md:p-5 pb-0 md:pb-0 flex items-center gap-2.5 mb-3 md:mb-4">
        <div className="flex items-center justify-center w-7 h-7 bg-primary text-primary-foreground border-3 border-border shadow-neo-sm">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
        <h3 className="font-black text-base md:text-lg uppercase tracking-wider">
          Progression
        </h3>
      </div>
      <div className="px-3 md:px-5 pb-3 md:pb-5">
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
    </div>
  );
};

export default SegmentProgressionChart;
