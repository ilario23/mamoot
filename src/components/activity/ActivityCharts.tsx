"use client";

import { useMemo, useState } from "react";
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
  Brush,
} from "recharts";
import { StreamPoint, ZONE_COLORS } from "@/lib/mockData";
import { useSettings } from "@/contexts/SettingsContext";

interface Props {
  stream: StreamPoint[];
}

const ActivityCharts = ({ stream }: Props) => {
  const { settings } = useSettings();

  const chartData = useMemo(() => {
    const sampleStep = Math.max(1, Math.floor(stream.length / 400));

    const sampled = stream
      .filter((_, i) => i % sampleStep === 0)
      .map((p) => ({
        distance: Number((p.distance / 1000).toFixed(2)),
        pace:
          p.velocity > 0
            ? Number((1000 / p.velocity / 60).toFixed(2))
            : null,
        heartrate: p.heartrate,
        altitude: p.altitude,
      }));

    // 5-point moving average smoothing
    const smooth = <K extends "pace" | "heartrate" | "altitude">(
      data: typeof sampled,
      key: K,
      window = 5
    ) => {
      const half = Math.floor(window / 2);
      return data.map((point, i) => {
        const slice = data.slice(Math.max(0, i - half), i + half + 1);
        const values = slice
          .map((d) => d[key])
          .filter((v): v is number => v !== null);
        if (values.length === 0) return point;
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        return { ...point, [key]: Number(avg.toFixed(2)) };
      });
    };

    let result = sampled;
    result = smooth(result, "pace");
    result = smooth(result, "heartrate");
    result = smooth(result, "altitude");
    return result;
  }, [stream]);

  const [showFullPace, setShowFullPace] = useState(false);

  const { clippedDomain, fullDomain, isCut } = useMemo(() => {
    const paceValues = chartData
      .map((d) => d.pace)
      .filter((p): p is number => p !== null && p > 0);
    if (paceValues.length === 0)
      return { clippedDomain: [0, 10], fullDomain: [0, 10], isCut: false };

    const sorted = [...paceValues].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
    const min = sorted[0]; // fastest pace (keep 100%)
    const max = sorted[sorted.length - 1]; // slowest pace

    const pad = (lo: number, hi: number) => {
      const p = (hi - lo) * 0.1 || 0.5;
      return [
        Math.max(0, Math.floor((lo - p) * 2) / 2),
        Math.ceil((hi + p) * 2) / 2,
      ];
    };

    // Fast side: use actual min (100% data), slow side: clip at P95
    const clipped = pad(min, p95);
    const full = pad(min, max);
    const isCut = clipped[1] !== full[1];

    return { clippedDomain: clipped, fullDomain: full, isCut };
  }, [chartData]);

  const paceDomain = showFullPace ? fullDomain : clippedDomain;

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
        <div className="flex items-center justify-between mb-3">
          <p className="font-black text-xs uppercase">Pace (min/km)</p>
          {isCut && (
            <button
              onClick={() => setShowFullPace((v) => !v)}
              className="text-xs font-bold uppercase border-2 border-border px-2 py-0.5 bg-background hover:bg-foreground hover:text-background transition-colors"
              aria-label={showFullPace ? "Clip pace outliers" : "Show full pace range"}
              tabIndex={0}
            >
              {showFullPace ? "Clip outliers" : "Show all"}
            </button>
          )}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} syncId="activity">
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
          <LineChart data={chartData} syncId="activity">
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
          <AreaChart data={chartData} syncId="activity" margin={{ bottom: 5 }}>
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
            <Brush
              dataKey="distance"
              height={24}
              stroke="#000"
              strokeWidth={2}
              travellerWidth={10}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ActivityCharts;
