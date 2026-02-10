"use client";

import type { ActivityType } from "@/lib/mockData";
import { ACTIVITY_TYPE_CONFIG } from "@/lib/mockData";
import { Footprints, Bike, Mountain, Waves } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const isMobile = useIsMobile();

  if (availableTypes.length === 0) return null;

  const handleDropdownChange = (val: string) => {
    onChange(val as ActivityType);
  };

  // Mobile: dropdown
  if (isMobile) {
    return (
      <Select value={value} onValueChange={handleDropdownChange}>
        <SelectTrigger
          className="w-[120px] border-3 border-border font-black shadow-neo-sm text-xs"
          aria-label="Activity type"
        >
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent className="border-3 border-border shadow-neo-sm">
          {availableTypes.map((type) => {
            const config = ACTIVITY_TYPE_CONFIG[type];
            return (
              <SelectItem key={type} value={type} className="font-bold">
                {config.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  }

  // Desktop: buttons
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
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-3 border-border transition-all ${
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
