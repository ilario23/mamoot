'use client';

import {useState} from 'react';
import type {ActivityType} from '@/lib/mockData';
import {ACTIVITY_TYPE_CONFIG} from '@/lib/mockData';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Input} from '@/components/ui/input';
import {Footprints, Bike, Mountain, Waves, Search, X} from 'lucide-react';
import {useIsMobile} from '@/hooks/use-mobile';

export type SortOption = 'date' | 'distance' | 'duration' | 'pace';

const SORT_LABELS: Record<SortOption, string> = {
  date: 'Date',
  distance: 'Distance',
  duration: 'Duration',
  pace: 'Pace',
};

const ICON_MAP: Record<
  ActivityType,
  React.ComponentType<{className?: string}>
> = {
  Run: Footprints,
  Ride: Bike,
  Hike: Mountain,
  Swim: Waves,
};

const ACTIVE_BG: Record<ActivityType, string> = {
  Run: 'bg-[var(--activity-run-3)] text-white',
  Ride: 'bg-[var(--activity-ride-3)] text-white',
  Hike: 'bg-[var(--activity-hike-3)] text-white',
  Swim: 'bg-[var(--activity-swim-3)] text-white',
};

interface ActivityFiltersProps {
  availableYears: number[];
  selectedYear: number | null;
  onYearChange: (year: number | null) => void;
  availableTypes: ActivityType[];
  selectedType: ActivityType | null;
  onTypeChange: (type: ActivityType | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

const ActivityFilters = ({
  availableYears,
  selectedYear,
  onYearChange,
  availableTypes,
  selectedType,
  onTypeChange,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
}: ActivityFiltersProps) => {
  const isMobile = useIsMobile();
  const [showSearch, setShowSearch] = useState(false);

  const handleYearChange = (value: string) => {
    onYearChange(value === 'all' ? null : Number(value));
  };

  const handleSortChange = (value: string) => {
    onSortChange(value as SortOption);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
  };

  const handleTypeDropdownChange = (value: string) => {
    onTypeChange(value === 'all' ? null : (value as ActivityType));
  };

  const handleToggleSearch = () => {
    if (showSearch) {
      onSearchChange('');
    }
    setShowSearch((prev) => !prev);
  };

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Mobile: collapsible search bar */}
      {isMobile && showSearch && (
        <div className="relative w-full">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            type="text"
            placeholder="Search activities..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9 pr-9 border-3 border-border font-bold shadow-neo-sm w-full"
            aria-label="Search activities by name"
            autoFocus
          />
          <button
            type="button"
            onClick={handleToggleSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            aria-label="Close search"
            tabIndex={0}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Controls row */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {/* Year selector */}
        <Select
          value={selectedYear === null ? 'all' : String(selectedYear)}
          onValueChange={handleYearChange}
        >
          <SelectTrigger
            className="w-[100px] sm:w-[130px] border-3 border-border font-black shadow-neo-sm text-xs sm:text-sm"
            aria-label="Select year"
          >
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent className="border-3 border-border shadow-neo-sm">
            <SelectItem value="all" className="font-bold">
              All Years
            </SelectItem>
            {availableYears.map((year) => (
              <SelectItem key={year} value={String(year)} className="font-bold">
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Activity type — dropdown on mobile, buttons on desktop */}
        {isMobile && availableTypes.length > 0 && (
          <Select
            value={selectedType ?? 'all'}
            onValueChange={handleTypeDropdownChange}
          >
            <SelectTrigger
              className="w-[100px] border-3 border-border font-black shadow-neo-sm text-xs"
              aria-label="Activity type"
            >
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="border-3 border-border shadow-neo-sm">
              <SelectItem value="all" className="font-bold">
                All Types
              </SelectItem>
              {availableTypes.map((type) => (
                <SelectItem key={type} value={type} className="font-bold">
                  {ACTIVITY_TYPE_CONFIG[type].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Sort selector */}
        <Select value={sortBy} onValueChange={handleSortChange}>
          <SelectTrigger
            className="w-[100px] sm:w-[130px] border-3 border-border font-black shadow-neo-sm text-xs sm:text-sm"
            aria-label="Sort by"
          >
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent className="border-3 border-border shadow-neo-sm">
            {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
              <SelectItem key={key} value={key} className="font-bold">
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search input — inline on desktop */}
        <div className="relative flex-1 min-w-[180px] hidden sm:block">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            type="text"
            placeholder="Search activities..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9 border-3 border-border font-bold shadow-neo-sm"
            aria-label="Search activities by name"
          />
        </div>

        {/* Mobile search icon toggle */}
        {isMobile && (
          <button
            type="button"
            onClick={handleToggleSearch}
            className={`ml-auto p-2 border-3 border-border shadow-neo-sm transition-colors ${
              showSearch
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            }`}
            aria-label={showSearch ? 'Close search' : 'Open search'}
            tabIndex={0}
          >
            <Search className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Activity type filter row — buttons on desktop only */}
      {!isMobile && availableTypes.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Activity type filter"
        >
          <button
            type="button"
            role="radio"
            aria-checked={selectedType === null}
            onClick={() => onTypeChange(null)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-3 border-border transition-all ${
              selectedType === null
                ? 'bg-primary text-primary-foreground shadow-neo-sm'
                : 'bg-background hover:bg-muted'
            }`}
          >
            All
          </button>

          {availableTypes.map((type) => {
            const isActive = selectedType === type;
            const Icon = ICON_MAP[type];
            const config = ACTIVITY_TYPE_CONFIG[type];

            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => onTypeChange(type)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-3 border-border transition-all ${
                  isActive
                    ? `${ACTIVE_BG[type]} shadow-neo-sm`
                    : 'bg-background hover:bg-muted'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {config.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ActivityFilters;
