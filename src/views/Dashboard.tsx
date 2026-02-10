'use client';

import StatCards from '@/components/dashboard/StatCards';
import VolumeChart from '@/components/dashboard/VolumeChart';
import PaceZoneDistribution from '@/components/dashboard/PaceZoneDistribution';
import FitnessChart from '@/components/dashboard/FitnessChart';
import PaceProgressionChart from '@/components/dashboard/PaceProgressionChart';
import ACWRChart from '@/components/dashboard/ACWRChart';

const Dashboard = () => {
  return (
    <div className='space-y-6'>
      <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
        Dashboard
      </h1>

      {/* Row 1: Stat Cards (6 cards) */}
      <StatCards />

      {/* Row 2: Training Metrics — BF / LI / IT (full width) */}
      <FitnessChart />

      {/* Row 3: Volume Chart + Pace Progression (side by side) */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <VolumeChart />
        <PaceProgressionChart />
      </div>

      {/* Row 4: Pace Zone Distribution (full width) */}
      <PaceZoneDistribution />

      {/* Row 5: Workload Ratio (full width) */}
      <ACWRChart />
    </div>
  );
};

export default Dashboard;
