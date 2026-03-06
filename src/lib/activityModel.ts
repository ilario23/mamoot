// ============================================================
// Mamoot — Types, Utilities & Constants
// Activity data is fetched from Strava API (see src/lib/strava.ts)
// ============================================================

// ----- Types -----

export type ActivityType = 'Run' | 'Ride' | 'Hike' | 'Swim';

export interface ActivitySummary {
  id: string;
  name: string;
  date: string;
  type: ActivityType;
  distance: number; // km
  duration: number; // seconds
  avgPace: number; // min/km (decimal)
  avgHr: number;
  maxHr: number;
  elevationGain: number;
  calories: number;
  hasDetailedData: boolean;
  polyline?: string; // encoded Google polyline for the route
}

/** @deprecated Use ActivitySummary instead */
export type RunSummary = ActivitySummary;

export interface StreamPoint {
  time: number; // seconds from start
  distance: number; // meters
  velocity: number; // m/s
  heartrate: number; // bpm
  altitude: number; // meters
}

export interface Split {
  km: number;
  pace: number; // min/km
  avgHr: number;
  elevationGain: number;
  elevationLoss: number;
}

export interface Injury {
  name: string;
  notes?: string;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  tier: string;
  inputCostPer1MUsd?: number;
  outputCostPer1MUsd?: number;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'gpt-4.1-nano',
    label: 'GPT-4.1 Nano',
    provider: 'OpenAI',
    tier: 'Cheapest',
    inputCostPer1MUsd: 0.1,
    outputCostPer1MUsd: 0.4,
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'OpenAI',
    tier: 'Budget',
    inputCostPer1MUsd: 0.15,
    outputCostPer1MUsd: 0.6,
  },
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 Mini',
    provider: 'OpenAI',
    tier: 'Balanced',
    inputCostPer1MUsd: 0.4,
    outputCostPer1MUsd: 1.6,
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    tier: 'Smart',
    inputCostPer1MUsd: 2.5,
    outputCostPer1MUsd: 10,
  },
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    provider: 'OpenAI',
    tier: 'Smartest',
    inputCostPer1MUsd: 2,
    outputCostPer1MUsd: 8,
  },
  {
    id: 'gpt-5-nano',
    label: 'GPT-5 Nano',
    provider: 'OpenAI',
    tier: 'Budget',
    inputCostPer1MUsd: 0.05,
    outputCostPer1MUsd: 0.4,
  },
  {
    id: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    provider: 'OpenAI',
    tier: 'Balanced',
    inputCostPer1MUsd: 0.25,
    outputCostPer1MUsd: 2,
  },
  {
    id: 'gpt-5.2',
    label: 'GPT-5.2',
    provider: 'OpenAI',
    tier: 'Smartest',
    inputCostPer1MUsd: 1.75,
    outputCostPer1MUsd: 14,
  },
  {
    id: 'gpt-5.3',
    label: 'GPT-5.3',
    provider: 'OpenAI',
    tier: 'Smartest',
    inputCostPer1MUsd: 1.75,
    outputCostPer1MUsd: 14,
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    provider: 'OpenAI',
    tier: 'Smartest',
    inputCostPer1MUsd: 2.5,
    outputCostPer1MUsd: 15,
  },
  {
    id: 'claude-haiku-3-5',
    label: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    tier: 'Budget',
  },
  {
    id: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    tier: 'Smart',
  },
];

export const DEFAULT_MODEL = 'gpt-4o-mini';

export interface UserSettings {
  maxHr: number;
  restingHr: number;
  zones: {
    z1: [number, number];
    z2: [number, number];
    z3: [number, number];
    z4: [number, number];
    z5: [number, number];
    z6: [number, number];
  };
  /** Free-text training goal (e.g., "Sub-50 10K in May", "First marathon in October") */
  goal?: string;
  /** Allergies the nutritionist should avoid (e.g., ["gluten", "dairy", "nuts"]) */
  allergies?: string[];
  /** Free-text dietary preferences (e.g., "vegetarian, no red meat, prefer whole foods") */
  foodPreferences?: string;
  /** Current injuries for coach and physio context */
  injuries?: Injury[];
  /** Selected AI model for all chat personas */
  aiModel?: string;
  /** Training focus: 20 = run-centric, 80 = gym-centric, 50 = balanced */
  trainingBalance?: number;
  /** Strategy selection mode for plan generation. */
  strategySelectionMode?: import('./trainingStrategy').StrategySelectionMode;
  /** Default strategy preset when manual mode is selected. */
  strategyPreset?: import('./trainingStrategy').TrainingStrategyPreset;
  /** Default optimization priority when generating plans. */
  optimizationPriority?: import('./trainingStrategy').OptimizationPriority;
}

// ----- Defaults -----

export const defaultSettings: UserSettings = {
  maxHr: 190,
  restingHr: 55,
  zones: {
    z1: [90, 114],
    z2: [115, 133],
    z3: [134, 152],
    z4: [153, 167],
    z5: [168, 181],
    z6: [182, 190],
  },
  goal: '',
  allergies: [],
  foodPreferences: '',
  injuries: [],
  aiModel: DEFAULT_MODEL,
  trainingBalance: 50,
  strategySelectionMode: 'auto',
  strategyPreset: 'polarized_80_20',
  optimizationPriority: 'race_performance',
};

// ----- Utility functions -----

export function formatPace(paceMinPerKm: number): string {
  const mins = Math.floor(paceMinPerKm);
  const secs = Math.round((paceMinPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (hrs > 0)
    return `${hrs}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${mins}:${s.toString().padStart(2, '0')}`;
}

export function getZoneForHr(hr: number, zones: UserSettings['zones']): number {
  if (hr <= zones.z1[1]) return 1;
  if (hr <= zones.z2[1]) return 2;
  if (hr <= zones.z3[1]) return 3;
  if (hr <= zones.z4[1]) return 4;
  if (hr <= zones.z5[1]) return 5;
  return 6;
}

export const ZONE_COLORS: Record<number, string> = {
  1: 'hsl(84 78% 55%)',
  2: 'hsl(217 91% 60%)',
  3: 'hsl(48 96% 53%)',
  4: 'hsl(312 100% 67%)',
  5: 'hsl(0 84% 60%)',
  6: 'hsl(270 70% 55%)',
};

export const ZONE_NAMES: Record<number, string> = {
  1: 'Recovery',
  2: 'Aerobic Endurance',
  3: 'Aerobic Power',
  4: 'Threshold',
  5: 'Anaerobic Endurance',
  6: 'Anaerobic Power',
};

// ----- Activity type configuration -----

export const ACTIVITY_TYPE_CONFIG: Record<
  ActivityType,
  {
    label: string;
    icon: string; // lucide icon name
    colors: [string, string, string, string]; // 4 intensity levels (CSS var references)
  }
> = {
  Run: {
    label: 'Run',
    icon: 'Footprints',
    colors: [
      'var(--activity-run-1)',
      'var(--activity-run-2)',
      'var(--activity-run-3)',
      'var(--activity-run-4)',
    ],
  },
  Ride: {
    label: 'Ride',
    icon: 'Bike',
    colors: [
      'var(--activity-ride-1)',
      'var(--activity-ride-2)',
      'var(--activity-ride-3)',
      'var(--activity-ride-4)',
    ],
  },
  Hike: {
    label: 'Hike',
    icon: 'Mountain',
    colors: [
      'var(--activity-hike-1)',
      'var(--activity-hike-2)',
      'var(--activity-hike-3)',
      'var(--activity-hike-4)',
    ],
  },
  Swim: {
    label: 'Swim',
    icon: 'Waves',
    colors: [
      'var(--activity-swim-1)',
      'var(--activity-swim-2)',
      'var(--activity-swim-3)',
      'var(--activity-swim-4)',
    ],
  },
};

// ----- Splits computer -----

export function computeSplits(stream: StreamPoint[]): Split[] {
  const splits: Split[] = [];
  let currentKm = 1;
  let kmStartIdx = 0;

  for (let i = 1; i < stream.length; i++) {
    if (stream[i].distance >= currentKm * 1000) {
      const startPoint = stream[kmStartIdx];
      const endPoint = stream[i];
      const timeDiff = endPoint.time - startPoint.time;
      const pace = timeDiff / 60;

      let totalHr = 0;
      let elevGain = 0;
      let elevLoss = 0;

      for (let j = kmStartIdx; j <= i; j++) {
        totalHr += stream[j].heartrate;
        if (j > kmStartIdx) {
          const diff = stream[j].altitude - stream[j - 1].altitude;
          if (diff > 0) elevGain += diff;
          else elevLoss += Math.abs(diff);
        }
      }

      splits.push({
        km: currentKm,
        pace: Number(pace.toFixed(2)),
        avgHr: Math.round(totalHr / (i - kmStartIdx + 1)),
        elevationGain: Math.round(elevGain),
        elevationLoss: Math.round(elevLoss),
      });

      currentKm++;
      kmStartIdx = i;
    }
  }

  return splits;
}
