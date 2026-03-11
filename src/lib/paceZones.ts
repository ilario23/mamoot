import type {PaceZoneRange, UserSettings} from '@/lib/activityModel';
import {createDefaultPaceZones} from '@/lib/activityModel';

export const PACE_ZONE_KEYS = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6'] as const;

export type PaceZoneKey = (typeof PACE_ZONE_KEYS)[number];

type PaceZonesInput = Partial<{
  [K in PaceZoneKey]: Partial<PaceZoneRange> | null | undefined;
}>;

export const mergeWithDefaultPaceZones = (
  paceZones: PaceZonesInput | null | undefined,
): NonNullable<UserSettings['paceZones']> => {
  const defaults = createDefaultPaceZones();
  if (!paceZones) return defaults;
  return {
    z1: {...defaults.z1, ...(paceZones.z1 ?? {})},
    z2: {...defaults.z2, ...(paceZones.z2 ?? {})},
    z3: {...defaults.z3, ...(paceZones.z3 ?? {})},
    z4: {...defaults.z4, ...(paceZones.z4 ?? {})},
    z5: {...defaults.z5, ...(paceZones.z5 ?? {})},
    z6: {...defaults.z6, ...(paceZones.z6 ?? {})},
  };
};

export const isPaceRangeConfigured = (range: PaceZoneRange | null | undefined): boolean =>
  Boolean(
    range &&
      Number.isFinite(range.lowerSecPerKm) &&
      Number.isFinite(range.upperSecPerKm),
  );

export const formatPaceSeconds = (secPerKm: number): string => {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '-';
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/km`;
};

export const formatPaceRange = (
  lowerSecPerKm: number | null | undefined,
  upperSecPerKm: number | null | undefined,
): string | null => {
  const hasLower = Number.isFinite(lowerSecPerKm ?? NaN);
  const hasUpper = Number.isFinite(upperSecPerKm ?? NaN);
  if (hasLower && hasUpper) {
    return `${formatPaceSeconds(lowerSecPerKm as number)} - ${formatPaceSeconds(
      upperSecPerKm as number,
    )}`;
  }
  // Open-ended recovery/anaerobic edges:
  // - only upper => slower than this bound (e.g. >5:44/km)
  // - only lower => faster than this bound (e.g. <3:41/km)
  if (!hasLower && hasUpper) return `> ${formatPaceSeconds(upperSecPerKm as number)}`;
  if (hasLower && !hasUpper) return `< ${formatPaceSeconds(lowerSecPerKm as number)}`;
  return null;
};

export const parsePaceToSeconds = (raw: string): number | null => {
  const value = raw.trim().toLowerCase().replace('/km', '');
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const mins = Number(match[1]);
  const secs = Number(match[2]);
  if (!Number.isFinite(mins) || !Number.isFinite(secs) || secs >= 60) return null;
  return mins * 60 + secs;
};
