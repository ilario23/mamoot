"use client";

import { TIME_PERIOD_OPTIONS } from "@/lib/records";
import type { TimePeriod } from "@/lib/records";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TimePeriodSelectorProps {
  value: TimePeriod;
  onChange: (period: TimePeriod) => void;
}

const TimePeriodSelector = ({ value, onChange }: TimePeriodSelectorProps) => {
  const isMobile = useIsMobile();

  const handleDropdownChange = (val: string) => {
    onChange(val as TimePeriod);
  };

  // Mobile: dropdown
  if (isMobile) {
    return (
      <Select value={value} onValueChange={handleDropdownChange}>
        <SelectTrigger
          className="w-[120px] border-3 border-border font-black shadow-neo-sm text-xs"
          aria-label="Time period"
        >
          <SelectValue placeholder="Period" />
        </SelectTrigger>
        <SelectContent className="border-3 border-border shadow-neo-sm">
          {TIME_PERIOD_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value} className="font-bold">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Desktop: buttons
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
