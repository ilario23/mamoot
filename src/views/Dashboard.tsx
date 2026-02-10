'use client';

import StatCards from '@/components/dashboard/StatCards';
import VolumeChart from '@/components/dashboard/VolumeChart';
import PaceZoneDistribution from '@/components/dashboard/PaceZoneDistribution';
import FitnessChart from '@/components/dashboard/FitnessChart';
import PaceProgressionChart from '@/components/dashboard/PaceProgressionChart';
import ACWRChart from '@/components/dashboard/ACWRChart';
import CollapsibleSection from '@/components/ui/collapsible-section';

const Dashboard = () => {
  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
        Dashboard
      </h1>

      {/* Row 1: Stat Cards (6 cards) — always visible, mobile toggle inside */}
      <StatCards />

      {/* Row 2: Training Metrics — collapsed on mobile */}
      <CollapsibleSection
        title="Training Metrics"
        subtitle="BF (Base Fitness) / LI (Load Impact) / IT (Intensity Trend)"
        defaultOpenMobile={false}
        defaultOpenDesktop={true}
      >
        <FitnessChart embedded />
      </CollapsibleSection>

      {/* Row 3: Volume Chart — priority, always visible */}
      <VolumeChart />

      {/* Row 4: Pace Zone Distribution — priority, always visible */}
      <PaceZoneDistribution />

      {/* Row 5: Pace Progression — collapsed on mobile */}
      <CollapsibleSection
        title="Pace Progression"
        subtitle="Average pace per run with trend line"
        defaultOpenMobile={false}
        defaultOpenDesktop={true}
      >
        <PaceProgressionChart embedded />
      </CollapsibleSection>

      {/* Row 6: Workload Ratio — collapsed on mobile */}
      <CollapsibleSection
        title="Workload Ratio"
        subtitle="Acute:Chronic Workload Ratio (ACWR)"
        defaultOpenMobile={false}
        defaultOpenDesktop={true}
      >
        <ACWRChart embedded />
      </CollapsibleSection>
    </div>
  );
};

export default Dashboard;
