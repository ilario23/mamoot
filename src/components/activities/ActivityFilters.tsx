'use client';

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
import {Footprints, Bike, Mountain, Waves, Search} from 'lucide-react';

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
  const handleYearChange = (value: string) => {
    onYearChange(value === 'all' ? null : Number(value));
  };

  const handleSortChange = (value: string) => {
    onSortChange(value as SortOption);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
  };

  return (
    <div className='space-y-4'>
      {/* Top row: Year selector, Sort, Search */}
      <div className='flex items-center gap-3 flex-wrap'>
        {/* Year selector */}
        <Select
          value={selectedYear === null ? 'all' : String(selectedYear)}
          onValueChange={handleYearChange}
        >
          <SelectTrigger
            className='w-[130px] border-3 border-border font-black shadow-neo-sm'
            aria-label='Select year'
          >
            <SelectValue placeholder='Year' />
          </SelectTrigger>
          <SelectContent className='border-3 border-border shadow-neo-sm'>
            <SelectItem value='all' className='font-bold'>
              All Years
            </SelectItem>
            {availableYears.map((year) => (
              <SelectItem key={year} value={String(year)} className='font-bold'>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort selector */}
        <Select value={sortBy} onValueChange={handleSortChange}>
          <SelectTrigger
            className='w-[130px] border-3 border-border font-black shadow-neo-sm'
            aria-label='Sort by'
          >
            <SelectValue placeholder='Sort by' />
          </SelectTrigger>
          <SelectContent className='border-3 border-border shadow-neo-sm'>
            {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
              <SelectItem key={key} value={key} className='font-bold'>
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search input */}
        <div className='relative flex-1 min-w-[180px]'>
          <Search
            className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none'
            aria-hidden='true'
          />
          <Input
            type='text'
            placeholder='Search activities...'
            value={searchQuery}
            onChange={handleSearchChange}
            className='pl-9 border-3 border-border font-bold shadow-neo-sm'
            aria-label='Search activities by name'
          />
        </div>
      </div>

      {/* Activity type filter row */}
      {availableTypes.length > 0 && (
        <div
          className='flex flex-wrap gap-2'
          role='radiogroup'
          aria-label='Activity type filter'
        >
          {/* All types button */}
          <button
            type='button'
            role='radio'
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
                type='button'
                role='radio'
                aria-checked={isActive}
                onClick={() => onTypeChange(type)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-3 border-border transition-all ${
                  isActive
                    ? `${ACTIVE_BG[type]} shadow-neo-sm`
                    : 'bg-background hover:bg-muted'
                }`}
              >
                <Icon className='h-4 w-4' aria-hidden='true' />
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
