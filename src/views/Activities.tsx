'use client';

import {useMemo, useState} from 'react';
import {useActivities} from '@/hooks/useStrava';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {getAvailableActivityTypes} from '@/lib/records';
import type {ActivityType} from '@/lib/mockData';
import ActivityFilters, {
  type SortOption,
} from '@/components/activities/ActivityFilters';
import ActivityStats from '@/components/activities/ActivityStats';
import ActivityList from '@/components/activities/ActivityList';
import {Loader2} from 'lucide-react';

const Activities = () => {
  const {isAuthenticated} = useStravaAuth();
  const {data: activities, isLoading} = useActivities();

  // --- Filter state ---
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<ActivityType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date');

  // --- Derived: available years ---
  const availableYears = useMemo(() => {
    if (!activities || activities.length === 0)
      return [new Date().getFullYear()];
    const yearSet = new Set<number>();
    activities.forEach((a) => {
      yearSet.add(new Date(a.date).getFullYear());
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [activities]);

  // --- Derived: available activity types ---
  const availableTypes = useMemo(() => {
    if (!activities || activities.length === 0) return [] as ActivityType[];
    return getAvailableActivityTypes(activities);
  }, [activities]);

  // --- Derived: filtered + sorted activities ---
  const filteredActivities = useMemo(() => {
    if (!activities) return [];

    let result = [...activities];

    // Filter by year
    if (selectedYear !== null) {
      result = result.filter(
        (a) => new Date(a.date).getFullYear() === selectedYear,
      );
    }

    // Filter by type
    if (selectedType !== null) {
      result = result.filter((a) => a.type === selectedType);
    }

    // Filter by search query
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((a) => a.name.toLowerCase().includes(query));
    }

    // Sort
    switch (sortBy) {
      case 'date':
        result.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        break;
      case 'distance':
        result.sort((a, b) => b.distance - a.distance);
        break;
      case 'duration':
        result.sort((a, b) => b.duration - a.duration);
        break;
      case 'pace':
        // Lower pace = faster, sort ascending; put 0-pace at end
        result.sort((a, b) => {
          if (a.avgPace === 0 && b.avgPace === 0) return 0;
          if (a.avgPace === 0) return 1;
          if (b.avgPace === 0) return -1;
          return a.avgPace - b.avgPace;
        });
        break;
    }

    return result;
  }, [activities, selectedYear, selectedType, searchQuery, sortBy]);

  // --- Not authenticated ---
  if (!isAuthenticated) {
    return (
      <div className='space-y-6'>
        <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
          Activities
        </h1>
        <div className='border-3 border-border p-8 bg-background shadow-neo text-center'>
          <p className='font-black text-lg'>
            Connect Strava to see your activities
          </p>
          <p className='text-sm font-bold text-muted-foreground mt-2'>
            Go to Settings to link your Strava account
          </p>
        </div>
      </div>
    );
  }

  // --- Loading ---
  if (isLoading) {
    return (
      <div className='space-y-6'>
        <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
          Activities
        </h1>
        <div className='flex items-center justify-center min-h-[300px]'>
          <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-6 h-full'>
      {/* Fixed header sections */}
      <div className='shrink-0 space-y-4 md:space-y-6'>
        {/* Page title */}
        <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
          Activities
        </h1>

        {/* Filters toolbar */}
        <ActivityFilters
          availableYears={availableYears}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          availableTypes={availableTypes}
          selectedType={selectedType}
          onTypeChange={setSelectedType}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        {/* Summary stats */}
        <ActivityStats activities={filteredActivities} />

        {/* Results count */}
        <p className='text-sm font-bold text-muted-foreground'>
          {filteredActivities.length}{' '}
          {filteredActivities.length === 1 ? 'activity' : 'activities'} found
        </p>
      </div>

      {/* Virtual-scrolled activity list — fills remaining space */}
      <div className='flex-1 min-h-0'>
        <ActivityList activities={filteredActivities} />
      </div>
    </div>
  );
};

export default Activities;
