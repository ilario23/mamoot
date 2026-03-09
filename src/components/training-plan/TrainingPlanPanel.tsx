'use client';

import {ChevronDown} from 'lucide-react';
import {type ReactNode} from 'react';

interface TrainingPlanPanelProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

const TrainingPlanPanel = ({title, open, onToggle, children}: TrainingPlanPanelProps) => {
  return (
    <div className='border-3 border-border bg-background shadow-neo overflow-hidden'>
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
        className='w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors'
      >
        <span className='font-black text-sm md:text-base uppercase tracking-wider'>
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden='true'
        />
      </button>
      {open && <div className='px-4 pb-4'>{children}</div>}
    </div>
  );
};

export default TrainingPlanPanel;
