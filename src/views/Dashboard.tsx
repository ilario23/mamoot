'use client';

import dynamic from 'next/dynamic';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {ClipboardList, MessageSquare} from 'lucide-react';
import StatCards from '@/components/dashboard/StatCards';
import CollapsibleSection from '@/components/ui/collapsible-section';
import {NeoLoader} from '@/components/ui/neo-loader';

const SectionLoading = ({label}: {label: string}) => (
  <div className="border-3 border-border p-5 bg-background shadow-neo flex items-center justify-center min-h-[220px] md:min-h-[280px]">
    <NeoLoader label={label} size="sm" colorClass="bg-primary" />
  </div>
);

const VolumeChart = dynamic(() => import('@/components/dashboard/VolumeChart'), {
  ssr: false,
  loading: () => <SectionLoading label="Loading volume" />,
});

const PaceZoneDistribution = dynamic(
  () => import('@/components/dashboard/PaceZoneDistribution'),
  {
    ssr: false,
    loading: () => <SectionLoading label="Loading zones" />,
  },
);

const FitnessChart = dynamic(() => import('@/components/dashboard/FitnessChart'), {
  ssr: false,
  loading: () => <SectionLoading label="Loading training metrics" />,
});

const PaceProgressionChart = dynamic(
  () => import('@/components/dashboard/PaceProgressionChart'),
  {
    ssr: false,
    loading: () => <SectionLoading label="Loading pace progression" />,
  },
);

const ACWRChart = dynamic(() => import('@/components/dashboard/ACWRChart'), {
  ssr: false,
  loading: () => <SectionLoading label="Loading workload ratio" />,
});

const LoadReadinessChart = dynamic(
  () => import('@/components/dashboard/LoadReadinessChart'),
  {
    ssr: false,
    loading: () => <SectionLoading label="Loading readiness trends" />,
  },
);

const TrainingStressChart = dynamic(
  () => import('@/components/dashboard/TrainingStressChart'),
  {
    ssr: false,
    loading: () => <SectionLoading label="Loading stress trends" />,
  },
);

const PerformanceTrendChart = dynamic(
  () => import('@/components/dashboard/PerformanceTrendChart'),
  {
    ssr: false,
    loading: () => <SectionLoading label="Loading performance trends" />,
  },
);

const Dashboard = () => {
  const [showDeferredSections, setShowDeferredSections] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowDeferredSections(true);
    }, 250);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3">
        Dashboard
      </h1>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
        <Link
          href='/weekly-plan'
          tabIndex={0}
          aria-label='Open weekly plan workflow'
          className='border-3 border-border bg-background shadow-neo-sm hover:shadow-neo p-4 space-y-1'
        >
          <span className='inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary'>
            <ClipboardList className='h-3.5 w-3.5' />
            Weekly loop
          </span>
          <p className='text-sm font-bold'>Review last week and regenerate this week</p>
        </Link>
        <Link
          href='/ai-chat'
          tabIndex={0}
          aria-label='Open AI team chat'
          className='border-3 border-border bg-background shadow-neo-sm hover:shadow-neo p-4 space-y-1'
        >
          <span className='inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary'>
            <MessageSquare className='h-3.5 w-3.5' />
            AI team
          </span>
          <p className='text-sm font-bold'>Ask coach, physio, and nutrition in one place</p>
        </Link>
      </div>

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
        {showDeferredSections ? (
          <PaceProgressionChart embedded />
        ) : (
          <SectionLoading label="Loading pace progression" />
        )}
      </CollapsibleSection>

      {/* Row 6: Workload Ratio — collapsed on mobile */}
      <CollapsibleSection
        title="Workload Ratio"
        subtitle="Acute:Chronic Workload Ratio (ACWR)"
        defaultOpenMobile={false}
        defaultOpenDesktop={true}
      >
        {showDeferredSections ? (
          <ACWRChart embedded />
        ) : (
          <SectionLoading label="Loading workload ratio" />
        )}
      </CollapsibleSection>

      {/* Row 7: Load & Readiness */}
      <CollapsibleSection
        title="Load & Readiness"
        subtitle="CTL / ATL / TSB coaching view"
        defaultOpenMobile={false}
        defaultOpenDesktop={true}
      >
        {showDeferredSections ? (
          <LoadReadinessChart embedded />
        ) : (
          <SectionLoading label="Loading readiness trends" />
        )}
      </CollapsibleSection>

      {/* Row 8: Stress Structure */}
      <CollapsibleSection
        title="Stress Structure"
        subtitle="Weekly strain, monotony, and ramp rate"
        defaultOpenMobile={false}
        defaultOpenDesktop={true}
      >
        {showDeferredSections ? (
          <TrainingStressChart embedded />
        ) : (
          <SectionLoading label="Loading stress trends" />
        )}
      </CollapsibleSection>

      {/* Row 9: Performance Trend */}
      <CollapsibleSection
        title="Performance Trend"
        subtitle="Threshold pace and efficiency factor"
        defaultOpenMobile={false}
        defaultOpenDesktop={true}
      >
        {showDeferredSections ? (
          <PerformanceTrendChart embedded />
        ) : (
          <SectionLoading label="Loading performance trends" />
        )}
      </CollapsibleSection>
    </div>
  );
};

export default Dashboard;
