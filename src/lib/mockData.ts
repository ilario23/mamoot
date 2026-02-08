// ============================================================
// RunTeam AI — Mock Data Layer
// ============================================================

// ----- Types -----

export interface RunSummary {
  id: string;
  name: string;
  date: string;
  distance: number; // km
  duration: number; // seconds
  avgPace: number; // min/km (decimal)
  avgHr: number;
  maxHr: number;
  elevationGain: number;
  calories: number;
  hasDetailedData: boolean;
}

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

export interface UserSettings {
  maxHr: number;
  restingHr: number;
  zones: {
    z1: [number, number];
    z2: [number, number];
    z3: [number, number];
    z4: [number, number];
    z5: [number, number];
  };
}

export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// ----- Defaults -----

export const defaultSettings: UserSettings = {
  maxHr: 190,
  restingHr: 55,
  zones: {
    z1: [90, 128],
    z2: [129, 145],
    z3: [146, 162],
    z4: [163, 175],
    z5: [176, 190],
  },
};

// ----- Utility functions -----

export function formatPace(paceMinPerKm: number): string {
  const mins = Math.floor(paceMinPerKm);
  const secs = Math.round((paceMinPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (hrs > 0)
    return `${hrs}:${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${mins}:${s.toString().padStart(2, "0")}`;
}

export function getZoneForHr(
  hr: number,
  zones: UserSettings["zones"]
): number {
  if (hr <= zones.z1[1]) return 1;
  if (hr <= zones.z2[1]) return 2;
  if (hr <= zones.z3[1]) return 3;
  if (hr <= zones.z4[1]) return 4;
  return 5;
}

export const ZONE_COLORS: Record<number, string> = {
  1: "hsl(84 78% 55%)",
  2: "hsl(217 91% 60%)",
  3: "hsl(48 96% 53%)",
  4: "hsl(312 100% 67%)",
  5: "hsl(0 84% 60%)",
};

export const ZONE_NAMES: Record<number, string> = {
  1: "Recovery",
  2: "Endurance",
  3: "Tempo",
  4: "Threshold",
  5: "VO2 Max",
};

// ----- Stream generator -----

function generateStream(
  durationSec: number,
  avgVelocityMs: number,
  avgHr: number,
  baseAlt: number,
  profile: "flat" | "hilly" | "rolling"
): StreamPoint[] {
  const points: StreamPoint[] = [];
  let distance = 0;

  for (let t = 0; t <= durationSec; t += 10) {
    const progress = t / durationSec;
    const warmup = Math.min(1, t / 300);
    const cooldown = Math.min(1, (durationSec - t) / 180);
    const noise =
      Math.sin(t * 0.013) * 0.12 + Math.sin(t * 0.037) * 0.08;
    const velocity =
      avgVelocityMs *
      warmup *
      Math.min(1, cooldown + 0.3) *
      (1 + noise);

    distance += velocity * 10;

    const hrNoise =
      Math.sin(t * 0.019) * 6 + Math.sin(t * 0.007) * 10;
    const heartrate = Math.round(
      avgHr * warmup + (1 - warmup) * (avgHr - 20) + hrNoise
    );

    let altitude = baseAlt;
    if (profile === "hilly") {
      altitude +=
        Math.sin(progress * Math.PI * 3) * 35 +
        Math.sin(progress * Math.PI * 7) * 12;
    } else if (profile === "rolling") {
      altitude +=
        Math.sin(progress * Math.PI * 5) * 18 +
        Math.cos(progress * Math.PI * 2.5) * 8;
    }

    points.push({
      time: t,
      distance: Math.round(distance),
      velocity: Number(Math.max(0.5, velocity).toFixed(2)),
      heartrate: Math.max(80, Math.min(200, heartrate)),
      altitude: Number(altitude.toFixed(1)),
    });
  }

  return points;
}

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

// ----- 20 Recent runs -----

export const runs: RunSummary[] = [
  // Week 1 — Feb 2-8, 2026
  { id: "1", name: "Morning Tempo Run", date: "2026-02-07", distance: 10.2, duration: 2880, avgPace: 4.71, avgHr: 158, maxHr: 172, elevationGain: 65, calories: 680, hasDetailedData: true },
  { id: "2", name: "Easy Shakeout", date: "2026-02-06", distance: 5.1, duration: 1800, avgPace: 5.88, avgHr: 128, maxHr: 142, elevationGain: 20, calories: 340, hasDetailedData: false },
  { id: "3", name: "Interval Session", date: "2026-02-04", distance: 8.3, duration: 2280, avgPace: 4.58, avgHr: 168, maxHr: 186, elevationGain: 35, calories: 590, hasDetailedData: false },
  { id: "4", name: "Long Sunday Run", date: "2026-02-02", distance: 18.5, duration: 5760, avgPace: 5.19, avgHr: 142, maxHr: 165, elevationGain: 120, calories: 1220, hasDetailedData: true },
  // Week 2 — Jan 26 – Feb 1
  { id: "5", name: "Steady State Run", date: "2026-01-31", distance: 12.0, duration: 3600, avgPace: 5.0, avgHr: 148, maxHr: 162, elevationGain: 55, calories: 780, hasDetailedData: false },
  { id: "6", name: "Recovery Jog", date: "2026-01-30", distance: 4.2, duration: 1500, avgPace: 5.95, avgHr: 118, maxHr: 130, elevationGain: 15, calories: 270, hasDetailedData: false },
  { id: "7", name: "Hill Repeats", date: "2026-01-28", distance: 9.1, duration: 2700, avgPace: 4.95, avgHr: 162, maxHr: 182, elevationGain: 210, calories: 650, hasDetailedData: false },
  { id: "8", name: "Weekend Long Run", date: "2026-01-26", distance: 16.0, duration: 5040, avgPace: 5.25, avgHr: 140, maxHr: 158, elevationGain: 95, calories: 1050, hasDetailedData: false },
  // Week 3 — Jan 19-25
  { id: "9", name: "Tempo Effort", date: "2026-01-24", distance: 10.0, duration: 2820, avgPace: 4.7, avgHr: 155, maxHr: 170, elevationGain: 45, calories: 660, hasDetailedData: true },
  { id: "10", name: "Easy Aerobic", date: "2026-01-23", distance: 7.0, duration: 2520, avgPace: 6.0, avgHr: 132, maxHr: 145, elevationGain: 30, calories: 460, hasDetailedData: false },
  { id: "11", name: "Fartlek Fun", date: "2026-01-21", distance: 8.2, duration: 2400, avgPace: 4.88, avgHr: 152, maxHr: 178, elevationGain: 40, calories: 560, hasDetailedData: false },
  { id: "12", name: "Long Slow Distance", date: "2026-01-19", distance: 20.0, duration: 6480, avgPace: 5.4, avgHr: 145, maxHr: 160, elevationGain: 150, calories: 1340, hasDetailedData: false },
  // Week 4 — Jan 12-18
  { id: "13", name: "Easy Morning Run", date: "2026-01-17", distance: 6.0, duration: 2160, avgPace: 6.0, avgHr: 126, maxHr: 138, elevationGain: 25, calories: 390, hasDetailedData: false },
  { id: "14", name: "Progression Run", date: "2026-01-15", distance: 10.5, duration: 3000, avgPace: 4.76, avgHr: 150, maxHr: 172, elevationGain: 50, calories: 690, hasDetailedData: false },
  { id: "15", name: "Recovery Spin", date: "2026-01-14", distance: 4.0, duration: 1560, avgPace: 6.5, avgHr: 115, maxHr: 128, elevationGain: 10, calories: 260, hasDetailedData: false },
  { id: "16", name: "Moderate Long Run", date: "2026-01-12", distance: 14.0, duration: 4200, avgPace: 5.0, avgHr: 138, maxHr: 155, elevationGain: 85, calories: 920, hasDetailedData: false },
  // Week 5 — Jan 5-11
  { id: "17", name: "Base Builder", date: "2026-01-10", distance: 8.0, duration: 2880, avgPace: 6.0, avgHr: 130, maxHr: 142, elevationGain: 35, calories: 520, hasDetailedData: false },
  { id: "18", name: "Tempo Intervals", date: "2026-01-08", distance: 7.0, duration: 1980, avgPace: 4.71, avgHr: 160, maxHr: 180, elevationGain: 30, calories: 480, hasDetailedData: false },
  { id: "19", name: "Easy Spin", date: "2026-01-07", distance: 5.0, duration: 1860, avgPace: 6.2, avgHr: 122, maxHr: 135, elevationGain: 15, calories: 330, hasDetailedData: false },
  { id: "20", name: "Long Base Run", date: "2026-01-05", distance: 15.0, duration: 4920, avgPace: 5.47, avgHr: 136, maxHr: 152, elevationGain: 80, calories: 990, hasDetailedData: false },
];

// ----- Detailed streams for runs 1, 4, 9 -----

export const detailedStreams: Record<string, StreamPoint[]> = {
  "1": generateStream(2880, 3.54, 158, 45, "rolling"),
  "4": generateStream(5760, 3.21, 142, 30, "hilly"),
  "9": generateStream(2820, 3.55, 155, 50, "flat"),
};

// ----- AI Team mock conversations -----

export const aiConversations: Record<string, AIMessage[]> = {
  coach: [
    { id: "c1", role: "assistant", content: "Great tempo run yesterday! Your pace consistency at 4:42/km shows real improvement. The negative split in the last 3km was textbook execution.", timestamp: "2026-02-08T08:00:00" },
    { id: "c2", role: "assistant", content: "This week's focus: maintain your 42km volume but add 6×200m strides after Tuesday's easy run. Your speed endurance will thank you.", timestamp: "2026-02-08T08:01:00" },
    { id: "c3", role: "assistant", content: "Your long run HR of 142bpm is right in the sweet spot. Keep those easy days truly easy — I see your recovery runs creeping up to Z2.", timestamp: "2026-02-08T08:02:00" },
  ],
  nutritionist: [
    { id: "n1", role: "assistant", content: "Post-long-run fueling is critical. Aim for 1.2g/kg carbs + 0.3g/kg protein within 30 minutes. For you, that's about 90g carbs + 22g protein.", timestamp: "2026-02-08T08:00:00" },
    { id: "n2", role: "assistant", content: "For morning tempo runs, try 200ml of beet juice 2 hours before. The nitrates can improve your running economy by 1-3%.", timestamp: "2026-02-08T08:01:00" },
    { id: "n3", role: "assistant", content: "Your training load this week suggests ~3,500 extra calories burned. Make sure you're not under-fueling — that's a recipe for injury and fatigue.", timestamp: "2026-02-08T08:02:00" },
  ],
  physio: [
    { id: "p1", role: "assistant", content: "I noticed cadence drops in the final kilometers of your long runs. This often signals hip flexor fatigue. Try adding hip flexor stretches and glute bridges daily.", timestamp: "2026-02-08T08:00:00" },
    { id: "p2", role: "assistant", content: "After those hill repeats, prioritize calf recovery: foam roll 2 minutes per side, followed by eccentric heel drops (3×15 reps).", timestamp: "2026-02-08T08:01:00" },
    { id: "p3", role: "assistant", content: "Your weekly elevation gain of 445m is solid. Keep monitoring any Achilles tenderness — the eccentric load from downhills accumulates over time.", timestamp: "2026-02-08T08:02:00" },
  ],
};

export const aiMockResponses: Record<string, string[]> = {
  coach: [
    "Focus on maintaining form during the last quarter of your runs. That's where the real gains are made.",
    "Consider adding a track session on Wednesdays. 5×1000m at threshold pace would complement your current program nicely.",
    "Your mileage progression looks solid. Let's hold here for 2 weeks before the next bump — consistency over ambition.",
  ],
  nutritionist: [
    "Try increasing your iron intake this week. Spinach, red meat, and lentils are your best friends for maintaining ferritin levels.",
    "Hydration check: aim for 2ml per calorie burned during training. Your body will perform significantly better.",
    "Pre-run: a banana with peanut butter 30 minutes before. Simple, effective, and easy on the stomach.",
  ],
  physio: [
    "Add 10 minutes of ankle mobility work before your tempo sessions. It'll improve your push-off mechanics noticeably.",
    "Your hamstring-to-quad strength ratio looks good based on your running metrics. Keep up the preventive work.",
    "Consider a sports massage this week. With the volume you're doing, soft tissue maintenance is non-negotiable.",
  ],
};
