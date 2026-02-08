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
  ReferenceArea,
  AreaChart,
  Area,
} from "recharts";
import { StreamPoint, ZONE_COLORS } from "@/lib/mockData";
import { useSettings } from "@/contexts/SettingsContext";

interface Props {
  stream: StreamPoint[];
}

const ActivityCharts = ({ stream }: Props) => {
  const { settings } = useSettings();

  const chartData = useMemo(() => {
    return stream
      .filter((_, i) => i % 3 === 0) // Sample every 3rd point for perf
      .map((p) => ({
        distance: Number((p.distance / 1000).toFixed(2)),
        pace:
          p.velocity > 0
            ? Number((1000 / p.velocity / 60).toFixed(2))
            : null,
        heartrate: p.heartrate,
        altitude: p.altitude,
      }));
  }, [stream]);

  const paceDomain = useMemo(() => {
    const paceValues = chartData
      .map((d) => d.pace)
      .filter((p): p is number => p !== null && p > 0);
    if (paceValues.length === 0) return [0, 10];
    const min = Math.min(...paceValues);
    const max = Math.max(...paceValues);
    const padding = (max - min) * 0.15 || 0.5;
    return [
      Math.max(0, Math.floor((min - padding) * 2) / 2),
      Math.ceil((max + padding) * 2) / 2,
    ];
  }, [chartData]);

  const formatPace = (value: number): string => {
    const minutes = Math.floor(value);
    const seconds = Math.round((value - minutes) * 60);
    return `${minutes}'${seconds.toString().padStart(2, "0")}"`;
  };

  const commonTooltipStyle = {
    border: "3px solid #000",
    borderRadius: 0,
    fontWeight: 700,
    backgroundColor: "#fff",
  };

  return (
    <div className="space-y-4">
      <h3 className="font-black text-lg uppercase tracking-wider">
        Activity Charts
      </h3>

      {/* Pace */}
      <div className="border-3 border-border p-4 bg-background shadow-neo-sm">
        <p className="font-black text-xs uppercase mb-3">Pace (min/km)</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid stroke="#000" strokeOpacity={0.1} />
            <XAxis
              dataKey="distance"
              stroke="#000"
              strokeWidth={2}
              tick={{ fontWeight: 700, fontSize: 11 }}
            />
            <YAxis
              reversed
              stroke="#000"
              strokeWidth={2}
              tick={{ fontWeight: 700, fontSize: 11 }}
              domain={paceDomain}
              allowDataOverflow
              tickFormatter={formatPace}
            />
            <Tooltip
              contentStyle={commonTooltipStyle}
              formatter={(value: number) => [formatPace(value), "Pace"]}
            />
            <Line
              type="monotone"
              dataKey="pace"
              stroke={ZONE_COLORS[2]}
              strokeWidth={3}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Heart Rate with zone bands */}
      <div className="border-3 border-border p-4 bg-background shadow-neo-sm">
        <p className="font-black text-xs uppercase mb-3">Heart Rate (bpm)</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid stroke="#000" strokeOpacity={0.1} />
            <XAxis
              dataKey="distance"
              stroke="#000"
              strokeWidth={2}
              tick={{ fontWeight: 700, fontSize: 11 }}
            />
            <YAxis
              stroke="#000"
              strokeWidth={2}
              tick={{ fontWeight: 700, fontSize: 11 }}
              domain={[80, 200]}
            />
            <Tooltip contentStyle={commonTooltipStyle} />

            {/* Zone background bands */}
            <ReferenceArea
              y1={settings.zones.z1[0]}
              y2={settings.zones.z1[1]}
              fill={ZONE_COLORS[1]}
              fillOpacity={0.15}
            />
            <ReferenceArea
              y1={settings.zones.z2[0]}
              y2={settings.zones.z2[1]}
              fill={ZONE_COLORS[2]}
              fillOpacity={0.15}
            />
            <ReferenceArea
              y1={settings.zones.z3[0]}
              y2={settings.zones.z3[1]}
              fill={ZONE_COLORS[3]}
              fillOpacity={0.15}
            />
            <ReferenceArea
              y1={settings.zones.z4[0]}
              y2={settings.zones.z4[1]}
              fill={ZONE_COLORS[4]}
              fillOpacity={0.15}
            />
            <ReferenceArea
              y1={settings.zones.z5[0]}
              y2={settings.zones.z5[1]}
              fill={ZONE_COLORS[5]}
              fillOpacity={0.15}
            />
            <ReferenceArea
              y1={settings.zones.z6[0]}
              y2={settings.zones.z6[1]}
              fill={ZONE_COLORS[6]}
              fillOpacity={0.15}
            />

            <Line
              type="monotone"
              dataKey="heartrate"
              stroke={ZONE_COLORS[5]}
              strokeWidth={3}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Elevation */}
      <div className="border-3 border-border p-4 bg-background shadow-neo-sm">
        <p className="font-black text-xs uppercase mb-3">Elevation (m)</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <CartesianGrid stroke="#000" strokeOpacity={0.1} />
            <XAxis
              dataKey="distance"
              stroke="#000"
              strokeWidth={2}
              tick={{ fontWeight: 700, fontSize: 11 }}
            />
            <YAxis
              stroke="#000"
              strokeWidth={2}
              tick={{ fontWeight: 700, fontSize: 11 }}
              domain={["auto", "auto"]}
            />
            <Tooltip contentStyle={commonTooltipStyle} />
            <Area
              type="monotone"
              dataKey="altitude"
              stroke={ZONE_COLORS[3]}
              strokeWidth={3}
              fill={ZONE_COLORS[3]}
              fillOpacity={0.3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ActivityCharts;
