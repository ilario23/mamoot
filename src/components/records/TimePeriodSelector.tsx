"use client";

import { TIME_PERIOD_OPTIONS } from "@/lib/records";
import type { TimePeriod } from "@/lib/records";

interface TimePeriodSelectorProps {
  value: TimePeriod;
  onChange: (period: TimePeriod) => void;
}

const TimePeriodSelector = ({ value, onChange }: TimePeriodSelectorProps) => {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Time period">
      {TIME_PERIOD_OPTIONS.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={`px-4 py-2 text-sm font-bold border-3 border-border transition-all ${
              isActive
                ? "bg-primary text-primary-foreground shadow-neo-sm"
                : "bg-background hover:bg-muted"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default TimePeriodSelector;
