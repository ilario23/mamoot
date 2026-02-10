"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  startOfYear,
  endOfYear,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  getDay,
} from "date-fns";
import { Footprints, Bike, Mountain, Waves } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type ActivitySummary,
  type ActivityType,
  ACTIVITY_TYPE_CONFIG,
  formatDuration,
} from "@/lib/mockData";

// ----- Icon map -----

const ICON_MAP: Record<ActivityType, React.ElementType> = {
  Run: Footprints,
  Ride: Bike,
  Hike: Mountain,
  Swim: Waves,
};

// ----- Helpers -----

const getIntensityLevel = (
  activity: ActivitySummary,
  activitiesOfSameType: ActivitySummary[]
): number => {
  if (activitiesOfSameType.length <= 1) return 4;

  const distances = activitiesOfSameType.map((a) => a.distance);
  const min = Math.min(...distances);
  const max = Math.max(...distances);

  if (max === min) return 4;

  const range = max - min;
  const normalized = (activity.distance - min) / range;

  if (normalized <= 0.25) return 1;
  if (normalized <= 0.5) return 2;
  if (normalized <= 0.75) return 3;
  return 4;
};

const getActivityColor = (
  type: ActivityType,
  level: number
): string => {
  const colors = ACTIVITY_TYPE_CONFIG[type].colors;
  return colors[Math.max(0, Math.min(3, level - 1))];
};

// ----- Types -----

interface ActivityCalendarProps {
  activities: ActivitySummary[];
  year: number;
}

interface DayData {
  date: Date;
  activities: Array<ActivitySummary & { level: number }>;
}

// ----- Component -----

const ActivityCalendar = ({ activities, year }: ActivityCalendarProps) => {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [openPopoverDate, setOpenPopoverDate] = useState<string | null>(null);

  // Build intensity maps per type
  const activitiesByType = useMemo(() => {
    const map: Record<ActivityType, ActivitySummary[]> = {
      Run: [],
      Ride: [],
      Hike: [],
      Swim: [],
    };
    activities.forEach((a) => map[a.type].push(a));
    return map;
  }, [activities]);

  // Build activity lookup by date string
  const activityMap = useMemo(() => {
    const map: Record<string, Array<ActivitySummary & { level: number }>> = {};
    activities.forEach((activity) => {
      const dateKey = activity.date;
      if (!map[dateKey]) map[dateKey] = [];
      const level = getIntensityLevel(activity, activitiesByType[activity.type]);
      map[dateKey].push({ ...activity, level });
    });
    return map;
  }, [activities, activitiesByType]);

  // Build day grid (horizontal: full year)
  const { weeks, monthLabels } = useMemo(() => {
    const yearStart = startOfYear(new Date(year, 0, 1));
    const yearEnd = endOfYear(new Date(year, 0, 1));

    // Grid starts on the Monday of the week containing Jan 1
    const gridStart = startOfWeek(yearStart, { weekStartsOn: 1 });
    // Grid ends on the Sunday of the week containing Dec 31
    const gridEnd = endOfWeek(yearEnd, { weekStartsOn: 1 });

    const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

    // Group days into weeks (columns)
    const weeksArr: DayData[][] = [];
    let currentWeek: DayData[] = [];

    allDays.forEach((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      const dayOfWeek = getDay(day); // 0=Sun

      // Monday = start of new week
      if (dayOfWeek === 1 && currentWeek.length > 0) {
        weeksArr.push(currentWeek);
        currentWeek = [];
      }

      currentWeek.push({
        date: day,
        activities: activityMap[dateKey] || [],
      });
    });

    if (currentWeek.length > 0) {
      weeksArr.push(currentWeek);
    }

    // Month labels: find the first week that starts in each month
    const labels: { label: string; weekIndex: number }[] = [];
    let lastMonth = -1;

    weeksArr.forEach((week, weekIdx) => {
      // Use the Monday of this week (first day)
      const monday = week.find((d) => getDay(d.date) === 1) || week[0];
      const month = monday.date.getMonth();
      if (month !== lastMonth) {
        labels.push({
          label: format(monday.date, "MMM"),
          weekIndex: weekIdx,
        });
        lastMonth = month;
      }
    });

    return { weeks: weeksArr, monthLabels: labels };
  }, [activityMap, year]);

  // Build continuous vertical grid for mobile — same weeks data as desktop,
  // but rendered top-to-bottom with month labels inserted between rows
  const mobileWeeks = useMemo(() => {
    if (!isMobile) return { weekRows: [] as { week: DayData[]; weekIdx: number; monthLabel?: string }[] };

    const weekRows: { week: DayData[]; weekIdx: number; monthLabel?: string }[] = [];
    let lastMonth = -1;

    weeks.forEach((week, weekIdx) => {
      // Determine which month this week belongs to (use Monday or first day)
      const monday = week.find((d) => getDay(d.date) === 1) || week[0];
      const month = monday.date.getMonth();
      const monthLabel = month !== lastMonth ? format(monday.date, "MMM") : undefined;
      if (month !== lastMonth) lastMonth = month;

      weekRows.push({ week, weekIdx, monthLabel });
    });

    return { weekRows };
  }, [isMobile, weeks]);

  const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
  const CELL_SIZE = isMobile ? 18 : 14;
  const CELL_GAP = isMobile ? 2 : 3;

  const handleDayClick = (dayData: DayData) => {
    if (dayData.activities.length === 0) return;

    if (dayData.activities.length === 1) {
      router.push(`/activity/${dayData.activities[0].id}`);
      return;
    }

    // Multiple activities — open popover
    setOpenPopoverDate(format(dayData.date, "yyyy-MM-dd"));
  };

  const handleActivitySelect = (id: string) => {
    setOpenPopoverDate(null);
    router.push(`/activity/${id}`);
  };

  /** Render a single day cell with tooltips/popovers */
  const renderDayCell = (dayData: DayData, isInYear: boolean) => {
    const jsDay = getDay(dayData.date);
    const row = jsDay === 0 ? 6 : jsDay - 1;
    const dateKey = format(dayData.date, "yyyy-MM-dd");
    const isPopoverOpen = openPopoverDate === dateKey;
    const hasActivities = dayData.activities.length > 0;

    const cellContent = (
      <DayCell dayData={dayData} isInYear={isInYear} size={CELL_SIZE} />
    );

    if (!isInYear) {
      return (
        <div key={dateKey} style={{ width: CELL_SIZE, height: CELL_SIZE, gridRow: row + 1 }}>
          {cellContent}
        </div>
      );
    }

    if (hasActivities && dayData.activities.length > 1) {
      return (
        <Popover key={dateKey} open={isPopoverOpen} onOpenChange={(open) => { if (!open) setOpenPopoverDate(null); }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  onClick={() => handleDayClick(dayData)}
                  className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label={`${format(dayData.date, "MMM d")} - ${dayData.activities.length} activities`}
                  tabIndex={0}
                  style={{ width: CELL_SIZE, height: CELL_SIZE, gridRow: row + 1 }}
                >
                  {cellContent}
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="border-3 border-border bg-popover shadow-neo-sm p-3 max-w-xs">
              <TooltipBody dayData={dayData} />
            </TooltipContent>
          </Tooltip>
          <PopoverContent side="top" className="border-3 border-border shadow-neo-sm p-0 w-auto min-w-[200px]">
            <div className="p-3 border-b-3 border-border">
              <p className="text-xs font-black uppercase tracking-wider">
                {format(dayData.date, "MMM d, yyyy")}
              </p>
            </div>
            <div className="p-1">
              {dayData.activities.map((a) => {
                const Icon = ICON_MAP[a.type];
                return (
                  <button
                    key={a.id}
                    onClick={() => handleActivitySelect(a.id)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm font-bold hover:bg-muted transition-colors"
                    aria-label={`View ${a.name}`}
                    tabIndex={0}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{a.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">
                      {a.distance.toFixed(1)} km
                    </span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      );
    }

    if (hasActivities) {
      return (
        <Tooltip key={dateKey}>
          <TooltipTrigger asChild>
            <button
              onClick={() => handleDayClick(dayData)}
              className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={`${format(dayData.date, "MMM d")} - ${dayData.activities[0].name}`}
              tabIndex={0}
              style={{ width: CELL_SIZE, height: CELL_SIZE, gridRow: row + 1 }}
            >
              {cellContent}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="border-3 border-border bg-popover shadow-neo-sm p-3 max-w-xs">
            <TooltipBody dayData={dayData} />
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <div key={dateKey} style={{ width: CELL_SIZE, height: CELL_SIZE, gridRow: row + 1 }}>
        {cellContent}
      </div>
    );
  };

  /** Legend shared between mobile and desktop */
  const legend = (
    <div className="flex flex-wrap gap-3 md:gap-4 mt-4 md:mt-5 pt-3 md:pt-4 border-t border-muted">
      <span className="text-xs font-bold text-muted-foreground mr-1">Less</span>
      {(Object.keys(ACTIVITY_TYPE_CONFIG) as ActivityType[]).map((type) => {
        const config = ACTIVITY_TYPE_CONFIG[type];
        const Icon = ICON_MAP[type];
        return (
          <div key={type} className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5" />
            <span className="text-xs font-bold">{config.label}</span>
            <div className="flex gap-0.5">
              {config.colors.map((color, i) => (
                <div
                  key={i}
                  className="border border-border/20"
                  style={{ width: 10, height: 10, backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        );
      })}
      <span className="text-xs font-bold text-muted-foreground">More</span>
    </div>
  );

  const MOBILE_DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div className="border-3 border-border bg-background shadow-neo">
      <div className="p-3 md:p-5 border-b-3 border-border">
        <h3 className="font-black text-base md:text-lg uppercase tracking-wider">
          Contribution Calendar
        </h3>
      </div>

      {/* Mobile: continuous vertical layout */}
      {isMobile ? (
        <div className="p-3 flex flex-col items-center">
          <div>
            {/* Sticky day-of-week header */}
            <div className="flex gap-0 mb-1">
              <div style={{ width: 32 }} className="shrink-0" />
              <div className="flex" style={{ gap: CELL_GAP }}>
                {MOBILE_DAY_LABELS.map((label, i) => (
                  <div
                    key={i}
                    className="text-[9px] font-bold text-muted-foreground text-center"
                    style={{ width: CELL_SIZE }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Week rows with inline month labels */}
            {mobileWeeks.weekRows.map(({ week, weekIdx, monthLabel }) => (
              <div key={weekIdx} className="flex items-center" style={{ marginTop: CELL_GAP }}>
                {/* Month label column */}
                <div
                  style={{ width: 32 }}
                  className="shrink-0 text-[9px] font-black uppercase tracking-wider text-muted-foreground"
                >
                  {monthLabel ?? ""}
                </div>
                <div className="flex" style={{ gap: CELL_GAP }}>
                  {weekIdx === 0 && (() => {
                    const firstDayJs = getDay(week[0].date);
                    const firstDayIdx = firstDayJs === 0 ? 6 : firstDayJs - 1;
                    return Array.from({ length: firstDayIdx }).map((_, i) => (
                      <div key={`pad-${i}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />
                    ));
                  })()}
                  {week.map((dayData) => {
                    const isInYear = dayData.date.getFullYear() === year;
                    return renderDayCell(dayData, isInYear);
                  })}
                  {weekIdx === weeks.length - 1 && (() => {
                    const lastDayJs = getDay(week[week.length - 1].date);
                    const lastDayIdx = lastDayJs === 0 ? 6 : lastDayJs - 1;
                    const padCount = 6 - lastDayIdx;
                    return Array.from({ length: padCount }).map((_, i) => (
                      <div key={`pad-end-${i}`} style={{ width: CELL_SIZE, height: CELL_SIZE }} />
                    ));
                  })()}
                </div>
              </div>
            ))}
          </div>

          {legend}
        </div>
      ) : (
        /* Desktop: original horizontal layout */
        <div className="p-5 overflow-x-auto touch-pan-x scrollbar-hide">
          {/* Month labels */}
          <div className="flex" style={{ paddingLeft: 36 }}>
            {monthLabels.map((ml) => (
              <div
                key={`${ml.label}-${ml.weekIndex}`}
                className="text-xs font-bold text-muted-foreground"
                style={{
                  position: "relative",
                  left: ml.weekIndex * (CELL_SIZE + CELL_GAP),
                  width: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {ml.label}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex gap-0 mt-2">
            {/* Day labels column */}
            <div className="flex flex-col shrink-0" style={{ width: 36, gap: CELL_GAP }}>
              {DAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="text-xs font-bold text-muted-foreground flex items-center"
                  style={{ height: CELL_SIZE }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Week columns */}
            <div className="flex" style={{ gap: CELL_GAP }}>
              {weeks.map((week, wIdx) => (
                <div key={wIdx} className="flex flex-col" style={{ gap: CELL_GAP }}>
                  {week.map((dayData) => {
                    const isInYear = dayData.date.getFullYear() === year;
                    return renderDayCell(dayData, isInYear);
                  })}
                </div>
              ))}
            </div>
          </div>

          {legend}
        </div>
      )}
    </div>
  );
};

// ----- DayCell sub-component -----

const DayCell = ({
  dayData,
  isInYear,
  size,
}: {
  dayData: DayData;
  isInYear: boolean;
  size: number;
}) => {
  if (!isInYear) {
    return (
      <div
        style={{ width: size, height: size }}
        className="opacity-0"
      />
    );
  }

  if (dayData.activities.length === 0) {
    return (
      <div
        style={{
          width: size,
          height: size,
          backgroundColor: "var(--activity-empty)",
        }}
        className="border border-border/10"
      />
    );
  }

  if (dayData.activities.length === 1) {
    const a = dayData.activities[0];
    const color = getActivityColor(a.type, a.level);
    return (
      <div
        style={{
          width: size,
          height: size,
          backgroundColor: color,
        }}
        className="border border-border/20"
      />
    );
  }

  // Multiple activities — horizontal stripes
  const stripeHeight = size / dayData.activities.length;
  return (
    <div
      style={{ width: size, height: size, overflow: "hidden" }}
      className="border border-border/20 flex flex-col"
    >
      {dayData.activities.map((a) => {
        const color = getActivityColor(a.type, a.level);
        return (
          <div
            key={a.id}
            style={{
              height: stripeHeight,
              backgroundColor: color,
            }}
          />
        );
      })}
    </div>
  );
};

// ----- TooltipBody sub-component -----

const TooltipBody = ({ dayData }: { dayData: DayData }) => (
  <div className="space-y-1.5">
    <p className="text-xs font-black uppercase tracking-wider">
      {format(dayData.date, "EEEE, MMM d")}
    </p>
    {dayData.activities.map((a) => {
      const Icon = ICON_MAP[a.type];
      return (
        <div key={a.id} className="flex items-center gap-2 text-xs">
          <div
            className="w-2.5 h-2.5 shrink-0 border border-border/20"
            style={{
              backgroundColor: getActivityColor(a.type, a.level),
            }}
          />
          <Icon className="h-3 w-3 shrink-0" />
          <span className="font-bold truncate">{a.name}</span>
          <span className="text-muted-foreground ml-auto shrink-0">
            {a.distance.toFixed(1)} km &middot; {formatDuration(a.duration)}
          </span>
        </div>
      );
    })}
  </div>
);

export default ActivityCalendar;
