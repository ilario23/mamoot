import { runs, formatDuration } from "@/lib/mockData";

const StatCards = () => {
  // Current week (Mon–Sun based on Feb 8 2026 = Sunday)
  const now = new Date("2026-02-08");
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const weekRuns = runs.filter((r) => new Date(r.date) >= monday);
  const weekDistance = weekRuns.reduce((sum, r) => sum + r.distance, 0);
  const weekDuration = weekRuns.reduce((sum, r) => sum + r.duration, 0);

  // Average weekly distance (previous 4 weeks)
  const prevRuns = runs.filter((r) => new Date(r.date) < monday);
  const prevWeeksAvg =
    prevRuns.reduce((sum, r) => sum + r.distance, 0) / 4;
  const loadRatio =
    prevWeeksAvg > 0 ? ((weekDistance / prevWeeksAvg) * 100).toFixed(0) : "—";

  const vo2Max = 52.3;

  const cards = [
    {
      label: "Weekly Volume",
      value: `${weekDistance.toFixed(1)} km`,
      sub: formatDuration(weekDuration),
      accentClass: "bg-secondary",
    },
    {
      label: "Acute Load",
      value: `${loadRatio}%`,
      sub: `${weekDistance.toFixed(1)} vs ${prevWeeksAvg.toFixed(1)} km/wk`,
      accentClass: "bg-accent",
    },
    {
      label: "Est. VO₂ Max",
      value: `${vo2Max}`,
      sub: "ml/kg/min",
      accentClass: "bg-primary",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {cards.map((card, i) => (
        <div
          key={i}
          className="border-3 border-foreground p-5 bg-background shadow-neo"
        >
          <p className="text-xs font-black uppercase tracking-wider mb-2">
            {card.label}
          </p>
          <p className="text-4xl font-black leading-tight">{card.value}</p>
          <p className="text-sm font-bold text-muted-foreground mt-1">
            {card.sub}
          </p>
          <div className={`h-2 w-16 mt-3 ${card.accentClass}`} />
        </div>
      ))}
    </div>
  );
};

export default StatCards;
