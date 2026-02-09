"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ActivityCalendar from "@/components/calendar/ActivityCalendar";
import ActivitySummaryCards from "@/components/calendar/ActivitySummaryCards";
import { useActivities } from "@/hooks/useStrava";
import { useStravaAuth } from "@/contexts/StravaAuthContext";
import { Loader2 } from "lucide-react";

const Calendar = () => {
  const { isAuthenticated } = useStravaAuth();
  const { data: activities, isLoading } = useActivities();

  // Derive available years from data
  const availableYears = useMemo(() => {
    if (!activities || activities.length === 0) return [new Date().getFullYear()];
    const yearSet = new Set<number>();
    activities.forEach((a) => {
      yearSet.add(new Date(a.date).getFullYear());
    });
    return Array.from(yearSet).sort((a, b) => b - a); // descending
  }, [activities]);

  const [selectedYear, setSelectedYear] = useState<number>(
    availableYears[0] ?? new Date().getFullYear()
  );

  // Filter activities for selected year
  const yearActivities = useMemo(
    () =>
      (activities ?? []).filter(
        (a) => new Date(a.date).getFullYear() === selectedYear
      ),
    [activities, selectedYear]
  );

  const handleYearChange = (value: string) => {
    setSelectedYear(Number(value));
  };

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
          Activity Calendar
        </h1>
        <div className="border-3 border-border p-8 bg-background shadow-neo text-center">
          <p className="font-black text-lg">Connect Strava to see your calendar</p>
          <p className="text-sm font-bold text-muted-foreground mt-2">
            Go to Settings to link your Strava account
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
          Activity Calendar
        </h1>
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with year selector */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
          Activity Calendar
        </h1>
        <Select
          value={String(selectedYear)}
          onValueChange={handleYearChange}
        >
          <SelectTrigger
            className="w-[120px] border-3 border-border font-black shadow-neo-sm"
            aria-label="Select year"
          >
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent className="border-3 border-border shadow-neo-sm">
            {availableYears.map((year) => (
              <SelectItem
                key={year}
                value={String(year)}
                className="font-bold"
              >
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <ActivitySummaryCards activities={yearActivities} />

      {/* Calendar heatmap */}
      <ActivityCalendar activities={yearActivities} year={selectedYear} />
    </div>
  );
};

export default Calendar;
