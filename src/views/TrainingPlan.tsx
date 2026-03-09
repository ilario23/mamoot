'use client';

import {ClipboardList, Target} from 'lucide-react';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import TrainingBlockView from '@/views/TrainingBlock';
import WeeklyPlan from '@/views/WeeklyPlan';

const TrainingPlan = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const modeParam = searchParams.get('tab');
  const mode = modeParam === 'block' ? 'block' : 'weekly';

  const handleModeChange = (nextMode: 'weekly' | 'block') => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === 'weekly') {
      params.delete('tab');
    } else {
      params.set('tab', nextMode);
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {scroll: false});
  };

  return (
    <div className='space-y-4 md:space-y-6'>
      <h1 className='text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3'>
        Training Plan
      </h1>
      <div className='space-y-3'>
        <div className='border-3 border-border bg-muted/60 shadow-neo-sm p-1.5 flex flex-wrap gap-1.5'>
          <button
            onClick={() => handleModeChange('weekly')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 border-2 border-border text-xs font-black uppercase tracking-wider transition-colors ${
              mode === 'weekly' ? 'bg-primary/10 text-primary' : 'bg-background hover:bg-muted'
            }`}
            aria-label='Show weekly details view'
          >
            <ClipboardList className='h-3.5 w-3.5' />
            Weekly
          </button>
          <button
            onClick={() => handleModeChange('block')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 border-2 border-border text-xs font-black uppercase tracking-wider transition-colors ${
              mode === 'block' ? 'bg-primary/10 text-primary' : 'bg-background hover:bg-muted'
            }`}
            aria-label='Show training block view'
          >
            <Target className='h-3.5 w-3.5' />
            Block
          </button>
        </div>
        {mode === 'weekly' ? <WeeklyPlan embedded /> : <TrainingBlockView embedded />}
      </div>
    </div>
  );
};

export default TrainingPlan;
