"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import type { LatLngTuple, LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { decodePolyline } from "@/lib/polyline";

// ---------------------------------------------------------------------------
// Inner component that auto-fits map bounds to the route
// ---------------------------------------------------------------------------
interface FitBoundsProps {
  positions: LatLngTuple[];
}

const FitBounds = ({ positions }: FitBoundsProps) => {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) return;
    const bounds: LatLngBoundsExpression = positions.map(
      (p) => [p[0], p[1]] as LatLngTuple
    );
    map.fitBounds(bounds, { padding: [32, 32] });
  }, [map, positions]);

  return null;
};

// ---------------------------------------------------------------------------
// Route color — primary magenta from the design system
// ---------------------------------------------------------------------------
const ROUTE_COLOR = "hsl(312, 100%, 67%)";

// ---------------------------------------------------------------------------
// ActivityMap — main exported component
// ---------------------------------------------------------------------------
interface ActivityMapProps {
  polyline: string;
}

const ActivityMap = ({ polyline }: ActivityMapProps) => {
  const positions = decodePolyline(polyline);

  if (positions.length === 0) {
    return (
      <div className="border-3 border-border p-8 bg-muted shadow-neo flex items-center justify-center min-h-[300px] md:min-h-[400px]">
        <p className="font-black text-muted-foreground uppercase">
          No route data available
        </p>
      </div>
    );
  }

  const startPoint = positions[0];
  const endPoint = positions[positions.length - 1];

  return (
    <div className="border-3 border-border shadow-neo overflow-hidden min-h-[300px] md:min-h-[400px]">
      <MapContainer
        center={startPoint}
        zoom={13}
        scrollWheelZoom={false}
        className="h-[300px] md:h-[400px] w-full z-0"
        attributionControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Polyline
          positions={positions}
          pathOptions={{
            color: ROUTE_COLOR,
            weight: 4,
            opacity: 0.9,
            lineCap: "round",
            lineJoin: "round",
          }}
        />

        {/* Start marker */}
        <CircleMarker
          center={startPoint}
          radius={7}
          pathOptions={{
            color: "hsl(0, 0%, 0%)",
            weight: 3,
            fillColor: "hsl(84, 78%, 55%)",
            fillOpacity: 1,
          }}
        />

        {/* End marker */}
        <CircleMarker
          center={endPoint}
          radius={7}
          pathOptions={{
            color: "hsl(0, 0%, 0%)",
            weight: 3,
            fillColor: "hsl(0, 84%, 60%)",
            fillOpacity: 1,
          }}
        />

        <FitBounds positions={positions} />
      </MapContainer>
    </div>
  );
};

export default ActivityMap;
