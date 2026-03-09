'use client';

import {BarChart3} from 'lucide-react';
import type {UnifiedSession} from '@/lib/cacheTypes';
import {ZONE_NAMES} from '@/lib/activityModel';

interface WeeklyPlanDistributionProps {
  weekStart: string;
  sessions: UnifiedSession[];
}

const ZONE_IDS = [1, 2, 3, 4, 5, 6] as const;
type ZoneId = (typeof ZONE_IDS)[number];

const ZONE_CARD_STYLES: Record<ZoneId, string> = {
  1: 'bg-zone-1/15 text-zone-1',
  2: 'bg-zone-2/15 text-zone-2',
  3: 'bg-zone-3/15 text-zone-3',
  4: 'bg-zone-4/15 text-zone-4',
  5: 'bg-zone-5/15 text-zone-5',
  6: 'bg-zone-6/15 text-zone-6',
};

const ZONE_SEGMENT_STYLES: Record<ZoneId, string> = {
  1: 'bg-zone-1',
  2: 'bg-zone-2',
  3: 'bg-zone-3',
  4: 'bg-zone-4',
  5: 'bg-zone-5',
  6: 'bg-zone-6',
};

const parseDistanceKm = (description?: string): number | null => {
  if (!description) return null;
  const distanceMatch = description.match(/(\d+(?:\.\d+)?)\s*km/i);
  if (!distanceMatch) return null;
  const parsed = Number(distanceMatch[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseZoneFromTarget = (targetZone?: string): ZoneId | null => {
  if (!targetZone) return null;
  const zoneMatch = targetZone.match(/z\s*([1-6])/i);
  if (!zoneMatch) return null;
  const zone = Number(zoneMatch[1]) as ZoneId;
  return ZONE_IDS.includes(zone) ? zone : null;
};

const mapSessionTypeToZone = (type?: string): ZoneId => {
  const normalized = (type ?? '').toLowerCase();
  if (
    normalized.includes('easy') ||
    normalized.includes('recovery') ||
    normalized.includes('warm') ||
    normalized.includes('cool')
  ) {
    return 2;
  }
  if (normalized.includes('long')) return 3;
  if (normalized.includes('tempo')) return 4;
  if (normalized.includes('threshold')) return 5;
  if (
    normalized.includes('interval') ||
    normalized.includes('vo2') ||
    normalized.includes('repetition')
  ) {
    return 5;
  }
  if (normalized.includes('race')) return 6;
  return 3;
};

const WeeklyPlanDistribution = ({weekStart, sessions}: WeeklyPlanDistributionProps) => {
  const zoneTotals = sessions.reduce<Record<ZoneId, number>>(
    (acc, session) => {
      if (!session.run) return acc;
      const structuredZone = session.run.targetZoneId;
      const zone = (structuredZone && ZONE_IDS.includes(structuredZone)
        ? structuredZone
        : parseZoneFromTarget(session.run.targetZone)) ?? mapSessionTypeToZone(session.run.type);
      const distanceKm = session.run.plannedDistanceKm ?? parseDistanceKm(session.run.description) ?? 1;
      acc[zone] += distanceKm;
      return acc;
    },
    {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0},
  );

  const totalPlannedKm = ZONE_IDS.reduce((sum, zoneId) => sum + zoneTotals[zoneId], 0);
  const strengthSlotCount = sessions.filter((session) => !!session.strengthSlot).length;

  return (
    <section
      aria-label='Weekly planned zone distribution'
      className='border-3 border-border bg-background shadow-neo overflow-hidden'
    >
      <div className='p-4 md:p-5 border-b-3 border-border space-y-3'>
        <div className='flex items-center gap-2'>
          <BarChart3 className='h-4 w-4 text-primary' />
          <h3 className='font-black text-base md:text-lg uppercase tracking-wider'>
            Week Zone Distribution
          </h3>
        </div>
        <div className='space-y-2'>
          <div className='w-full h-7 border-2 border-border bg-muted overflow-hidden flex'>
            {ZONE_IDS.map((zoneId) => {
              const pct = totalPlannedKm > 0 ? (zoneTotals[zoneId] / totalPlannedKm) * 100 : 0;
              if (pct <= 0) return null;
              return (
                <div
                  key={`segment-${zoneId}`}
                  aria-label={`Z${zoneId} ${pct.toFixed(0)} percent`}
                  className={`${ZONE_SEGMENT_STYLES[zoneId]} h-full flex items-center justify-center`}
                  style={{width: `${pct}%`}}
                >
                  <span className='text-[10px] font-black text-background drop-shadow-sm'>
                    Z{zoneId}
                  </span>
                </div>
              );
            })}
            {totalPlannedKm <= 0 && (
              <div className='w-full h-full flex items-center justify-center text-[10px] font-bold text-muted-foreground'>
                No run zone data in this plan
              </div>
            )}
          </div>
          <p className='text-xs font-medium text-muted-foreground'>
            Week of {weekStart} · Planned run volume: {totalPlannedKm.toFixed(1)} km · Strength slots: {strengthSlotCount}
          </p>
        </div>
      </div>

      <div className='p-4 md:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3'>
        {ZONE_IDS.map((zoneId) => {
          const zoneKm = zoneTotals[zoneId];
          const pct = totalPlannedKm > 0 ? (zoneKm / totalPlannedKm) * 100 : 0;
          return (
            <article
              key={zoneId}
              aria-label={`Zone ${zoneId} distribution`}
              className={`border-3 border-border p-3 space-y-1.5 min-w-0 ${ZONE_CARD_STYLES[zoneId]}`}
            >
              <p className='text-[10px] font-black uppercase tracking-widest'>
                Zone {zoneId}
              </p>
              <p className='text-sm font-black leading-tight'>{ZONE_NAMES[zoneId]}</p>
              <div className='flex items-end justify-between gap-2'>
                <p className='text-xl font-black tabular-nums'>
                  {zoneKm.toFixed(1)}
                  <span className='text-xs font-bold ml-1'>km</span>
                </p>
                <p className='text-xs font-black tabular-nums'>
                  {pct.toFixed(0)}%
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default WeeklyPlanDistribution;
