import {getZoneForHr, type UserSettings} from '@/lib/activityModel';
import type {StravaDetailedActivity, StravaSummaryActivity} from '@/lib/strava';
import {PACE_ZONE_KEYS, type PaceZoneKey, mergeWithDefaultPaceZones} from '@/lib/paceZones';

const AUTO_METHOD_VERSION = 'pace-zones-v1';

type PaceSample = {
  secPerKm: number;
  weight: number;
  ageDays: number;
};

type ZoneBuckets = Record<PaceZoneKey, PaceSample[]>;

export interface PaceZoneAutoGenerationResult {
  paceZones: NonNullable<UserSettings['paceZones']>;
  diagnostics: {
    methodVersion: string;
    usedRuns: number;
    splitSamples: number;
    summarySamples: number;
  };
}

const createBuckets = (): ZoneBuckets => ({
  z1: [],
  z2: [],
  z3: [],
  z4: [],
  z5: [],
  z6: [],
});

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toZoneKey = (zone: number): PaceZoneKey | null => {
  if (zone < 1 || zone > 6) return null;
  return `z${zone}` as PaceZoneKey;
};

const calcAgeDays = (isoDateTime: string, nowMs: number): number => {
  const sampleMs = new Date(isoDateTime).getTime();
  if (!Number.isFinite(sampleMs)) return 999;
  return Math.max(0, (nowMs - sampleMs) / (24 * 60 * 60 * 1000));
};

const weightedQuantile = (
  samples: PaceSample[],
  percentile: number,
): number | null => {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a.secPerKm - b.secPerKm);
  const total = sorted.reduce((sum, sample) => sum + sample.weight, 0);
  if (total <= 0) return null;
  const target = total * percentile;
  let cumulative = 0;
  for (const sample of sorted) {
    cumulative += sample.weight;
    if (cumulative >= target) return sample.secPerKm;
  }
  return sorted[sorted.length - 1]?.secPerKm ?? null;
};

const calcEffectiveSampleSize = (samples: PaceSample[]): number => {
  const sumW = samples.reduce((sum, sample) => sum + sample.weight, 0);
  const sumW2 = samples.reduce((sum, sample) => sum + sample.weight ** 2, 0);
  if (sumW <= 0 || sumW2 <= 0) return 0;
  return (sumW ** 2) / sumW2;
};

const toPaceSec = (averageSpeedMps: number): number | null => {
  if (!Number.isFinite(averageSpeedMps) || averageSpeedMps <= 0.75) return null;
  return 1000 / averageSpeedMps;
};

const deriveFromSplit = (
  split: StravaDetailedActivity['splits_metric'][number],
  ageDays: number,
): PaceSample | null => {
  const movingTime = split.moving_time ?? 0;
  if (movingTime < 45) return null;
  const secPerKm = toPaceSec(split.average_speed);
  if (secPerKm == null) return null;
  if (secPerKm < 150 || secPerKm > 720) return null;
  const gradientPct =
    split.distance > 0 ? (split.elevation_difference / split.distance) * 100 : 0;
  if (Math.abs(gradientPct) > 8) return null;
  const recencyWeight = Math.exp(-ageDays / 42);
  const qualityWeight = clamp(movingTime / 120, 0.45, 1);
  return {
    secPerKm,
    ageDays,
    weight: recencyWeight * qualityWeight,
  };
};

const deriveFromSummary = (
  activity: StravaSummaryActivity,
  ageDays: number,
): PaceSample | null => {
  const secPerKm = toPaceSec(activity.average_speed);
  if (secPerKm == null) return null;
  if (secPerKm < 150 || secPerKm > 720) return null;
  if (activity.moving_time < 15 * 60) return null;
  const movingRatio =
    activity.elapsed_time > 0 ? activity.moving_time / activity.elapsed_time : 1;
  const recencyWeight = Math.exp(-ageDays / 56);
  const qualityWeight = clamp(movingRatio, 0.35, 1);
  return {
    secPerKm,
    ageDays,
    weight: recencyWeight * qualityWeight * 0.7,
  };
};

const smoothCenters = (centers: Array<number | null>): Array<number | null> => {
  const next = [...centers];
  for (let i = 1; i < next.length; i += 1) {
    const prev = next[i - 1];
    const current = next[i];
    if (prev == null || current == null) continue;
    const maxCurrent = prev - 3; // higher zones should be faster
    if (current > maxCurrent) {
      next[i] = maxCurrent;
    }
  }
  return next;
};

const inferMissingCenter = (
  centers: Array<number | null>,
  index: number,
): number | null => {
  const prevIndex = (() => {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (centers[i] != null) return i;
    }
    return -1;
  })();
  const nextIndex = (() => {
    for (let i = index + 1; i < centers.length; i += 1) {
      if (centers[i] != null) return i;
    }
    return -1;
  })();
  if (prevIndex >= 0 && nextIndex >= 0) {
    const prev = centers[prevIndex] as number;
    const next = centers[nextIndex] as number;
    const t = (index - prevIndex) / (nextIndex - prevIndex);
    return prev + (next - prev) * t;
  }
  if (prevIndex >= 0) {
    const prev = centers[prevIndex] as number;
    const prevPrev = prevIndex - 1 >= 0 ? centers[prevIndex - 1] : null;
    const step =
      prevPrev != null
        ? Math.max(6, Math.abs((prevPrev as number) - prev))
        : 14;
    return prev - step * (index - prevIndex);
  }
  if (nextIndex >= 0) {
    const next = centers[nextIndex] as number;
    const nextNext =
      nextIndex + 1 < centers.length ? centers[nextIndex + 1] : null;
    const step =
      nextNext != null
        ? Math.max(6, Math.abs((next as number) - (nextNext as number)))
        : 16;
    return next + step * (nextIndex - index);
  }
  return null;
};

export const autoGeneratePaceZones = ({
  zones,
  runs,
  runDetailsById,
  nowMs = Date.now(),
}: {
  zones: UserSettings['zones'];
  runs: StravaSummaryActivity[];
  runDetailsById: Map<number, StravaDetailedActivity>;
  nowMs?: number;
}): PaceZoneAutoGenerationResult => {
  const buckets = createBuckets();
  let usedRuns = 0;
  let splitSamples = 0;
  let summarySamples = 0;

  for (const run of runs) {
    const ageDays = calcAgeDays(run.start_date_local, nowMs);
    if (ageDays > 140) continue;
    usedRuns += 1;
    const detail = runDetailsById.get(run.id);
    const detailSplits = detail?.splits_metric ?? [];
    let hadSplitSample = false;
    for (const split of detailSplits) {
      if (!split.average_heartrate || split.average_heartrate <= 0) continue;
      const sample = deriveFromSplit(split, ageDays);
      if (!sample) continue;
      const zoneId = getZoneForHr(split.average_heartrate, zones);
      const zoneKey = toZoneKey(zoneId);
      if (!zoneKey) continue;
      buckets[zoneKey].push(sample);
      splitSamples += 1;
      hadSplitSample = true;
    }

    // Fallback to summary-level evidence when split-level data is absent.
    if (!hadSplitSample && run.average_heartrate && run.average_heartrate > 0) {
      const sample = deriveFromSummary(run, ageDays);
      if (!sample) continue;
      const zoneId = getZoneForHr(run.average_heartrate, zones);
      const zoneKey = toZoneKey(zoneId);
      if (!zoneKey) continue;
      buckets[zoneKey].push(sample);
      summarySamples += 1;
    }
  }

  const paceZones = mergeWithDefaultPaceZones(null);
  const zoneCenters: Array<number | null> = [];

  for (const zoneKey of PACE_ZONE_KEYS) {
    const samples = buckets[zoneKey];
    const q25 = weightedQuantile(samples, 0.25);
    const q50 = weightedQuantile(samples, 0.5);
    const q75 = weightedQuantile(samples, 0.75);
    zoneCenters.push(q50);

    const ess = calcEffectiveSampleSize(samples);
    const meanAge =
      samples.length > 0
        ? samples.reduce((sum, sample) => sum + sample.ageDays * sample.weight, 0) /
          samples.reduce((sum, sample) => sum + sample.weight, 0)
        : 999;
    const iqr = q25 != null && q75 != null ? q75 - q25 : 999;
    const essScore = clamp(ess / 16, 0, 1);
    const consistencyScore = clamp(1 - iqr / 140, 0.2, 1);
    const recencyScore = clamp(1 - meanAge / 140, 0.2, 1);
    const confidence = Number((essScore * consistencyScore * recencyScore).toFixed(2));

    if (q25 == null || q75 == null || ess < 3 || confidence < 0.35) {
      paceZones[zoneKey] = {
        ...paceZones[zoneKey],
        source: 'none',
        confidence,
        sampleSize: Math.round(ess),
        methodVersion: AUTO_METHOD_VERSION,
        autoGeneratedAt: nowMs,
        updatedAt: nowMs,
        lowerSecPerKm: null,
        upperSecPerKm: null,
      };
      continue;
    }

    paceZones[zoneKey] = {
      ...paceZones[zoneKey],
      source: 'auto',
      confidence,
      sampleSize: Math.round(ess),
      methodVersion: AUTO_METHOD_VERSION,
      autoGeneratedAt: nowMs,
      updatedAt: nowMs,
      lowerSecPerKm: Number(q25.toFixed(1)),
      upperSecPerKm: Number(q75.toFixed(1)),
    };
  }

  const smoothedCenters = smoothCenters(zoneCenters);
  for (let i = 0; i < PACE_ZONE_KEYS.length; i += 1) {
    const zoneKey = PACE_ZONE_KEYS[i];
    const zone = paceZones[zoneKey];
    if (zone.lowerSecPerKm != null && zone.upperSecPerKm != null) continue;
    let inferred = inferMissingCenter(smoothedCenters, i);
    if (inferred == null) continue;
    const prev = i > 0 ? smoothedCenters[i - 1] : null;
    const next = i + 1 < smoothedCenters.length ? smoothedCenters[i + 1] : null;
    if (prev != null && inferred > prev - 3) inferred = prev - 3;
    if (next != null && inferred < next + 3) inferred = next + 3;
    inferred = clamp(inferred, 150, 780);
    const halfWidth = i >= 4 ? 8 : 12;
    zone.lowerSecPerKm = Number((inferred - halfWidth).toFixed(1));
    zone.upperSecPerKm = Number((inferred + halfWidth).toFixed(1));
    zone.source = 'auto';
    zone.sampleSize = Math.max(0, zone.sampleSize ?? 0);
    zone.confidence = Number(Math.max(zone.confidence ?? 0, 0.25).toFixed(2));
    zone.methodVersion = AUTO_METHOD_VERSION;
    zone.autoGeneratedAt = nowMs;
    zone.updatedAt = nowMs;
    smoothedCenters[i] = inferred;
  }

  for (let i = 0; i < PACE_ZONE_KEYS.length; i += 1) {
    const zoneKey = PACE_ZONE_KEYS[i];
    const center = smoothedCenters[i];
    const zone = paceZones[zoneKey];
    if (center == null || zone.lowerSecPerKm == null || zone.upperSecPerKm == null) continue;
    const halfWidth = Math.max(8, (zone.upperSecPerKm - zone.lowerSecPerKm) / 2);
    zone.lowerSecPerKm = Number((center - halfWidth).toFixed(1));
    zone.upperSecPerKm = Number((center + halfWidth).toFixed(1));
  }

  // Normalize a contiguous six-zone boundary chain with strict ordering.
  // (B1..B6 semantics with open edges: Z1 > B1, Z2 [B2,B1], Z3 [B3,B2],
  //  Z4 [B4,B3], Z5 [B5,B4], Z6 < B6 and B6 is tied to B5 for adjacency.)
  const MIN_STEP = 8;
  let b1 =
    paceZones.z1.upperSecPerKm ??
    paceZones.z2.upperSecPerKm ??
    paceZones.z2.lowerSecPerKm ??
    360;
  let b2 =
    paceZones.z2.lowerSecPerKm ??
    paceZones.z3.upperSecPerKm ??
    (b1 - 30);
  let b3 =
    paceZones.z3.lowerSecPerKm ??
    paceZones.z4.upperSecPerKm ??
    (b2 - 25);
  let b4 =
    paceZones.z4.lowerSecPerKm ??
    paceZones.z5.upperSecPerKm ??
    (b3 - 22);
  let b5 =
    paceZones.z5.lowerSecPerKm ??
    paceZones.z6.lowerSecPerKm ??
    (b4 - 18);
  let b6 =
    paceZones.z6.lowerSecPerKm ??
    b5;

  if (b2 >= b1) b2 = b1 - MIN_STEP;
  if (b3 >= b2) b3 = b2 - MIN_STEP;
  if (b4 >= b3) b4 = b3 - MIN_STEP;
  if (b5 >= b4) b5 = b4 - MIN_STEP;
  // Keep Z5/Z6 adjacent with no gap.
  b6 = b5;

  b1 = Number(clamp(b1, 190, 780).toFixed(1));
  b2 = Number(clamp(b2, 170, b1 - MIN_STEP).toFixed(1));
  b3 = Number(clamp(b3, 155, b2 - MIN_STEP).toFixed(1));
  b4 = Number(clamp(b4, 145, b3 - MIN_STEP).toFixed(1));
  b5 = Number(clamp(b5, 130, b4 - MIN_STEP).toFixed(1));
  b6 = Number(clamp(b6, 130, b5).toFixed(1));

  paceZones.z1.upperSecPerKm = b1;
  paceZones.z2.upperSecPerKm = b1;
  paceZones.z2.lowerSecPerKm = b2;
  paceZones.z3.upperSecPerKm = b2;
  paceZones.z3.lowerSecPerKm = b3;
  paceZones.z4.upperSecPerKm = b3;
  paceZones.z4.lowerSecPerKm = b4;
  paceZones.z5.upperSecPerKm = b4;
  paceZones.z5.lowerSecPerKm = b5;
  paceZones.z6.lowerSecPerKm = b6;

  // Keep six-zone model but align edge zones with open-ended pace bounds:
  // Z1 (recovery) should be open on the slower side; Z6 (anaerobic) open on faster side.
  paceZones.z1.lowerSecPerKm = null;
  paceZones.z6.upperSecPerKm = null;

  return {
    paceZones,
    diagnostics: {
      methodVersion: AUTO_METHOD_VERSION,
      usedRuns,
      splitSamples,
      summarySamples,
    },
  };
};
