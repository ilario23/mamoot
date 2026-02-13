'use client';

import {useState, useCallback, useMemo} from 'react';
import {Loader2, Bike, Footprints} from 'lucide-react';
import {useQueryClient} from '@tanstack/react-query';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useAthleteGear} from '@/hooks/useStrava';
import {toggleRetiredGear} from '@/lib/retiredGear';
import GearCard from '@/components/gear/GearCard';

const Gear = () => {
  const {isAuthenticated} = useStravaAuth();
  const {data: gearData, isLoading} = useAthleteGear();
  const queryClient = useQueryClient();

  // Derive retired IDs from the DB-backed gear data
  const retiredIds = useMemo(
    () => new Set(gearData?.retiredGearIds ?? []),
    [gearData?.retiredGearIds],
  );

  const handleToggleRetire = useCallback(
    async (gearId: string) => {
      await toggleRetiredGear(gearId);
      // Invalidate gear query so retiredIds reflect the change
      queryClient.invalidateQueries({queryKey: ['strava', 'gear']});
    },
    [queryClient],
  );

  // Sort: active gear first, retired gear last
  const sortedBikes = useMemo(() => {
    if (!gearData?.bikes) return [];
    return [...gearData.bikes].sort((a, b) => {
      const aRetired = retiredIds.has(a.id) ? 1 : 0;
      const bRetired = retiredIds.has(b.id) ? 1 : 0;
      if (aRetired !== bRetired) return aRetired - bRetired;
      // Primary first within each group
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return b.distance - a.distance;
    });
  }, [gearData?.bikes, retiredIds]);

  const sortedShoes = useMemo(() => {
    if (!gearData?.shoes) return [];
    return [...gearData.shoes].sort((a, b) => {
      const aRetired = retiredIds.has(a.id) ? 1 : 0;
      const bRetired = retiredIds.has(b.id) ? 1 : 0;
      if (aRetired !== bRetired) return aRetired - bRetired;
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return b.distance - a.distance;
    });
  }, [gearData?.shoes, retiredIds]);

  // --- Not authenticated ---
  if (!isAuthenticated) {
    return (
      <div className='space-y-6'>
        <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
          Gear
        </h1>
        <div className='border-3 border-border p-8 bg-background shadow-neo text-center'>
          <p className='font-black text-lg'>Connect Strava to see your gear</p>
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
          Gear
        </h1>
        <div className='border-3 border-border p-12 bg-background shadow-neo flex items-center justify-center'>
          <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
        </div>
      </div>
    );
  }

  const hasBikes = sortedBikes.length > 0;
  const hasShoes = sortedShoes.length > 0;
  const hasNoGear = !hasBikes && !hasShoes;

  return (
    <div className='space-y-8'>
      {/* Page title */}
      <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
        Gear
      </h1>

      {hasNoGear && (
        <div className='border-3 border-border p-8 bg-background shadow-neo text-center'>
          <p className='font-black text-lg'>No gear found</p>
          <p className='text-sm font-bold text-muted-foreground mt-2'>
            Add bikes or shoes to your Strava profile to see them here
          </p>
        </div>
      )}

      {/* Bikes section */}
      {hasBikes && (
        <section className='space-y-4'>
          <div className='flex items-center gap-3'>
            <div className='flex items-center justify-center w-8 h-8 bg-nav-gear text-nav-gear-foreground border-3 border-border shadow-neo-sm'>
              <Bike className='h-4 w-4' />
            </div>
            <h2 className='text-xl font-black uppercase tracking-tight'>
              Bikes
            </h2>
            <span className='text-sm font-bold text-muted-foreground'>
              ({sortedBikes.length})
            </span>
          </div>
          <div className='grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4'>
            {sortedBikes.map((bike) => (
              <GearCard
                key={bike.id}
                gear={bike}
                type='bike'
                retired={retiredIds.has(bike.id)}
                onToggleRetire={handleToggleRetire}
              />
            ))}
          </div>
        </section>
      )}

      {/* Shoes section */}
      {hasShoes && (
        <section className='space-y-4'>
          <div className='flex items-center gap-3'>
            <div className='flex items-center justify-center w-8 h-8 bg-nav-gear text-nav-gear-foreground border-3 border-border shadow-neo-sm'>
              <Footprints className='h-4 w-4' />
            </div>
            <h2 className='text-xl font-black uppercase tracking-tight'>
              Shoes
            </h2>
            <span className='text-sm font-bold text-muted-foreground'>
              ({sortedShoes.length})
            </span>
          </div>
          <div className='grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4'>
            {sortedShoes.map((shoe) => (
              <GearCard
                key={shoe.id}
                gear={shoe}
                type='shoe'
                retired={retiredIds.has(shoe.id)}
                onToggleRetire={handleToggleRetire}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Gear;
