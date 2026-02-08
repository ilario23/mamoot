"use client";

import type { ActivityType } from "@/lib/mockData";
import { ACTIVITY_TYPE_CONFIG } from "@/lib/mockData";
import { Footprints, Bike, Mountain, Waves } from "lucide-react";

const ICON_MAP: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  Run: Footprints,
  Ride: Bike,
  Hike: Mountain,
  Swim: Waves,
};

const ACTIVE_BG: Record<ActivityType, string> = {
  Run: "bg-[var(--activity-run-3)] text-white",
  Ride: "bg-[var(--activity-ride-3)] text-white",
  Hike: "bg-[var(--activity-hike-3)] text-white",
  Swim: "bg-[var(--activity-swim-3)] text-white",
};

interface ActivityTypeFilterProps {
  availableTypes: ActivityType[];
  value: ActivityType;
  onChange: (type: ActivityType) => void;
}

const ActivityTypeFilter = ({
  availableTypes,
  value,
  onChange,
}: ActivityTypeFilterProps) => {
  if (availableTypes.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Activity type">
      {availableTypes.map((type) => {
        const isActive = value === type;
        const Icon = ICON_MAP[type];
        const config = ACTIVITY_TYPE_CONFIG[type];

        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(type)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-3 border-foreground transition-all ${
              isActive
                ? `${ACTIVE_BG[type]} shadow-neo-sm`
                : "bg-background hover:bg-muted"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {config.label}
          </button>
        );
      })}
    </div>
  );
};

export default ActivityTypeFilter;
