export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// AI Team mock conversations (kept as they are not from Strava)
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
