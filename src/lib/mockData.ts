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
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'gpt-4.1-nano',
    label: 'GPT-4.1 Nano',
    provider: 'OpenAI',
    tier: 'Cheapest',
  },
  {id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', tier: 'Budget'},
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 Mini',
    provider: 'OpenAI',
    tier: 'Balanced',
  },
  {id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', tier: 'Smart'},
  {id: 'gpt-4.1', label: 'GPT-4.1', provider: 'OpenAI', tier: 'Smartest'},
  {
    id: 'gpt-5-nano',
    label: 'GPT-5 Nano',
    provider: 'OpenAI',
    tier: 'Budget',
  },
  {
    id: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    provider: 'OpenAI',
    tier: 'Balanced',
  },
  {id: 'gpt-5.2', label: 'GPT-5.2', provider: 'OpenAI', tier: 'Smartest'},
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
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
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

// ----- AI Team mock conversations (kept as they are not from Strava) -----

export const aiConversations: Record<string, AIMessage[]> = {
  coach: [
    {
      id: 'c1',
      role: 'assistant',
      content:
        'Great tempo run yesterday! Your pace consistency at 4:42/km shows real improvement. The negative split in the last 3km was textbook execution.',
      timestamp: '2026-02-08T08:00:00',
    },
    {
      id: 'c2',
      role: 'assistant',
      content:
        "This week's focus: maintain your 42km volume but add 6×200m strides after Tuesday's easy run. Your speed endurance will thank you.",
      timestamp: '2026-02-08T08:01:00',
    },
    {
      id: 'c3',
      role: 'assistant',
      content:
        'Your long run HR of 142bpm is right in the sweet spot. Keep those easy days truly easy — I see your recovery runs creeping up to Z2.',
      timestamp: '2026-02-08T08:02:00',
    },
  ],
  nutritionist: [
    {
      id: 'n1',
      role: 'assistant',
      content:
        "Post-long-run fueling is critical. Aim for 1.2g/kg carbs + 0.3g/kg protein within 30 minutes. For you, that's about 90g carbs + 22g protein.",
      timestamp: '2026-02-08T08:00:00',
    },
    {
      id: 'n2',
      role: 'assistant',
      content:
        'For morning tempo runs, try 200ml of beet juice 2 hours before. The nitrates can improve your running economy by 1-3%.',
      timestamp: '2026-02-08T08:01:00',
    },
    {
      id: 'n3',
      role: 'assistant',
      content:
        "Your training load this week suggests ~3,500 extra calories burned. Make sure you're not under-fueling — that's a recipe for injury and fatigue.",
      timestamp: '2026-02-08T08:02:00',
    },
  ],
  physio: [
    {
      id: 'p1',
      role: 'assistant',
      content:
        'I noticed cadence drops in the final kilometers of your long runs. This often signals hip flexor fatigue. Try adding hip flexor stretches and glute bridges daily.',
      timestamp: '2026-02-08T08:00:00',
    },
    {
      id: 'p2',
      role: 'assistant',
      content:
        'After those hill repeats, prioritize calf recovery: foam roll 2 minutes per side, followed by eccentric heel drops (3×15 reps).',
      timestamp: '2026-02-08T08:01:00',
    },
    {
      id: 'p3',
      role: 'assistant',
      content:
        'Your weekly elevation gain of 445m is solid. Keep monitoring any Achilles tenderness — the eccentric load from downhills accumulates over time.',
      timestamp: '2026-02-08T08:02:00',
    },
  ],
};

export const aiMockResponses: Record<string, string[]> = {
  coach: [
    "Focus on maintaining form during the last quarter of your runs. That's where the real gains are made.",
    'Consider adding a track session on Wednesdays. 5×1000m at threshold pace would complement your current program nicely.',
    "Your mileage progression looks solid. Let's hold here for 2 weeks before the next bump — consistency over ambition.",
  ],
  nutritionist: [
    'Try increasing your iron intake this week. Spinach, red meat, and lentils are your best friends for maintaining ferritin levels.',
    'Hydration check: aim for 2ml per calorie burned during training. Your body will perform significantly better.',
    'Pre-run: a banana with peanut butter 30 minutes before. Simple, effective, and easy on the stomach.',
  ],
  physio: [
    "Add 10 minutes of ankle mobility work before your tempo sessions. It'll improve your push-off mechanics noticeably.",
    'Your hamstring-to-quad strength ratio looks good based on your running metrics. Keep up the preventive work.',
    "Consider a sports massage this week. With the volume you're doing, soft tissue maintenance is non-negotiable.",
  ],
};
