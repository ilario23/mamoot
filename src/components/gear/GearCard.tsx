'use client';

import {Star, ArchiveRestore, Archive} from 'lucide-react';
import GearDoodle from './GearDoodle';
import type {StravaSummaryGear} from '@/lib/strava';

type GearCardProps = {
  gear: StravaSummaryGear;
  type: 'bike' | 'shoe';
  retired: boolean;
  onToggleRetire: (gearId: string) => void;
};

/** Format distance in meters to a readable km string */
const formatDistance = (meters: number): string => {
  const km = meters / 1000;
  if (km >= 1000) {
    return `${(km / 1000).toFixed(1)}k km`;
  }
  return `${Math.round(km).toLocaleString()} km`;
};

const GearCard = ({gear, type, retired, onToggleRetire}: GearCardProps) => {
  const handleToggleRetire = () => {
    onToggleRetire(gear.id);
  };

  return (
    <div className="relative group">
      {/* Card container */}
      <div
        className={`border-3 border-border bg-background shadow-neo transition-all ${
          retired ? '' : 'hover:shadow-neo-lg hover:translate-x-[-2px] hover:translate-y-[-2px]'
        }`}
      >
        {/* Doodle illustration area — compact on mobile */}
        <div
          className={`relative border-b-3 border-border bg-muted/30 p-2 md:p-4 flex items-center justify-center overflow-hidden ${
            retired ? 'blur-[1.5px] opacity-50 grayscale' : ''
          }`}
        >
          <GearDoodle
            variant={type}
            retired={retired}
            className="w-full h-16 md:h-28"
          />
        </div>

        {/* Card content — compact on mobile */}
        <div className={`p-3 md:p-4 space-y-2 md:space-y-3 ${retired ? 'opacity-50' : ''}`}>
          {/* Name + primary badge + distance — inline on mobile */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-black text-xs md:text-sm leading-tight truncate" title={gear.name}>
                {gear.name}
              </h3>
              <p className="text-lg md:text-2xl font-black tabular-nums mt-0.5">
                {formatDistance(gear.distance)}
              </p>
            </div>
            {gear.primary && !retired && (
              <span
                className="shrink-0 inline-flex items-center gap-0.5 md:gap-1 bg-nav-gear text-nav-gear-foreground text-[9px] md:text-[10px] font-black px-1 md:px-1.5 py-0.5 uppercase tracking-wider border-2 border-border shadow-neo-sm"
                aria-label="Primary gear"
              >
                <Star className="h-2.5 w-2.5 md:h-3 md:w-3" />
                Main
              </span>
            )}
          </div>

          {/* Retire / restore button */}
          <button
            type="button"
            onClick={handleToggleRetire}
            className={`w-full flex items-center justify-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 text-[10px] md:text-xs font-bold border-3 border-border transition-all ${
              retired
                ? 'bg-nav-gear text-nav-gear-foreground hover:shadow-neo-sm'
                : 'bg-muted text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:shadow-neo-sm'
            } active:shadow-none active:translate-x-[1px] active:translate-y-[1px]`}
            aria-label={retired ? `Restore ${gear.name}` : `Retire ${gear.name}`}
            tabIndex={0}
          >
            {retired ? (
              <>
                <ArchiveRestore className="h-3 w-3 md:h-3.5 md:w-3.5" />
                Restore
              </>
            ) : (
              <>
                <Archive className="h-3 w-3 md:h-3.5 md:w-3.5" />
                Retire
              </>
            )}
          </button>
        </div>
      </div>

      {/* Retired stamp overlay */}
      {retired && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="rotate-[-12deg] border-[3px] md:border-[4px] border-destructive/60 px-4 md:px-6 py-1 md:py-2">
            <span className="text-destructive/60 font-black text-lg md:text-2xl tracking-widest uppercase select-none">
              Retired
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default GearCard;
