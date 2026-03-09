'use client';

import {Dumbbell, Minus, Target, TrendingDown, TrendingUp, Zap} from 'lucide-react';
import type {CachedTrainingBlock, WeekOutline} from '@/lib/cacheTypes';

const WEEK_TYPE_COLORS: Record<string, string> = {
  base: 'bg-zone-1/20 text-zone-1',
  build: 'bg-zone-2/20 text-zone-2',
  recovery: 'bg-zone-1/30 text-zone-1',
  'off-load': 'bg-muted text-muted-foreground',
  peak: 'bg-zone-4/20 text-zone-4',
  taper: 'bg-zone-3/20 text-zone-3',
  race: 'bg-primary/20 text-primary',
};

const INTENSITY_ICON: Record<string, typeof Zap> = {
  low: Minus,
  moderate: TrendingUp,
  high: Zap,
};

const PhaseHeader = ({
  name,
  volumeDirection,
}: {
  name: string;
  volumeDirection: 'build' | 'hold' | 'reduce';
}) => {
  const VolumeIcon =
    volumeDirection === 'build'
      ? TrendingUp
      : volumeDirection === 'reduce'
        ? TrendingDown
        : Minus;
  return (
    <div className='flex items-center gap-2 pt-3 pb-1 first:pt-0'>
      <div className='h-px flex-1 bg-border' />
      <span className='inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-black uppercase tracking-widest border-2 border-border bg-background'>
        <Dumbbell className='h-3 w-3' />
        {name}
        <VolumeIcon className='h-3 w-3 text-muted-foreground' />
      </span>
      <div className='h-px flex-1 bg-border' />
    </div>
  );
};

const WeekChip = ({
  outline,
  isCurrent,
}: {
  outline: WeekOutline;
  isCurrent: boolean;
}) => {
  const IntensityIcon = INTENSITY_ICON[outline.intensityLevel] ?? Minus;
  return (
    <div
      className={`border-2 border-border p-2 space-y-1 ${
        isCurrent ? 'bg-primary/10 ring-2 ring-primary/20' : 'bg-background'
      }`}
    >
      <div className='flex items-center justify-between gap-2'>
        <span className='text-[10px] font-black uppercase tracking-wider'>
          W{outline.weekNumber}
        </span>
        <span
          className={`px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider border border-border ${
            WEEK_TYPE_COLORS[outline.weekType] ?? 'bg-muted text-foreground'
          }`}
        >
          {outline.weekType}
        </span>
      </div>
      <div className='flex items-center gap-1 text-[10px] font-bold text-muted-foreground'>
        <IntensityIcon className='h-3 w-3' />
        {outline.volumeTargetKm} km · {outline.intensityLevel}
      </div>
      {outline.keyWorkouts.length > 0 && (
        <p className='text-[10px] text-muted-foreground truncate'>
          {outline.keyWorkouts[0]}
        </p>
      )}
    </div>
  );
};

interface BlockRoadmapPanelProps {
  block: CachedTrainingBlock;
  currentWeek: number;
}

const BlockRoadmapPanel = ({block, currentWeek}: BlockRoadmapPanelProps) => {
  return (
    <section className='border-3 border-border bg-background shadow-neo-sm p-4 space-y-3'>
      <div className='flex items-center gap-1.5'>
        <Target className='h-3.5 w-3.5 text-primary' />
        <span className='font-black text-[10px] uppercase tracking-widest text-primary'>
          Block Roadmap
        </span>
      </div>
      <div className='space-y-2'>
        {block.phases.map((phase) => (
          <div key={phase.name}>
            <PhaseHeader name={phase.name} volumeDirection={phase.volumeDirection} />
            <div className='grid grid-cols-1 md:grid-cols-2 gap-2 mt-2'>
              {block.weekOutlines
                .filter((outline) => outline.phase === phase.name)
                .map((outline) => (
                  <WeekChip
                    key={outline.weekNumber}
                    outline={outline}
                    isCurrent={outline.weekNumber === currentWeek}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default BlockRoadmapPanel;
