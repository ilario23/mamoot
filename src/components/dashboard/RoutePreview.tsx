"use client";

import { useMemo } from "react";
import { decodePolyline } from "@/lib/polyline";

interface RoutePreviewProps {
  /** Encoded Google polyline string */
  polyline: string;
  /** Stroke color (CSS value) */
  color?: string;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** CSS class for the wrapper */
  className?: string;
}

const PADDING = 4; // px padding inside the SVG

const RoutePreview = ({
  polyline,
  color = "currentColor",
  width = 64,
  height = 64,
  className,
}: RoutePreviewProps) => {
  const pathData = useMemo(() => {
    const points = decodePolyline(polyline);
    if (points.length < 2) return null;

    // Find bounding box (lat = y, lng = x)
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    for (const [lat, lng] of points) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }

    const latRange = maxLat - minLat || 0.001;
    const lngRange = maxLng - minLng || 0.001;

    // Available drawing area
    const drawW = width - PADDING * 2;
    const drawH = height - PADDING * 2;

    // Scale uniformly to fit while preserving aspect ratio
    const scale = Math.min(drawW / lngRange, drawH / latRange);
    const scaledW = lngRange * scale;
    const scaledH = latRange * scale;
    const offsetX = PADDING + (drawW - scaledW) / 2;
    const offsetY = PADDING + (drawH - scaledH) / 2;

    // Normalize points to SVG coordinates
    // Note: lat increases upward but SVG y increases downward, so invert
    const svgPoints = points.map(([lat, lng]) => {
      const x = offsetX + (lng - minLng) * scale;
      const y = offsetY + (maxLat - lat) * scale;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return `M${svgPoints.join("L")}`;
  }, [polyline, width, height]);

  if (!pathData) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d={pathData}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.8}
      />
    </svg>
  );
};

export default RoutePreview;
