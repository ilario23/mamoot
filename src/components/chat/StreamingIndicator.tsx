'use client';

import {useState, useEffect} from 'react';
import type {LucideIcon} from 'lucide-react';

interface StreamingIndicatorProps {
  /** Persona display name (uppercase label) */
  label: string;
  /** Persona icon component */
  icon: LucideIcon;
  /** Persona color class, e.g. 'bg-secondary' */
  color: string;
  /** Colored left-border class for the bubble, e.g. 'border-l-secondary' */
  bubbleBorder?: string;
  /** Text color class for the persona label, e.g. 'text-secondary' */
  labelColor?: string;
}

const thinkingSteps = ['Thinking', 'Thinking.', 'Thinking..', 'Thinking...'];

const StreamingIndicator = ({
  label,
  icon: Icon,
  color,
  bubbleBorder = '',
  labelColor = '',
}: StreamingIndicatorProps) => {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIdx((prev) => (prev + 1) % thinkingSteps.length);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className='flex gap-2 flex-row min-w-0 animate-slide-in-left'>
      {/* Thinking bubble — transparent, no icon */}
      <div className='py-1 text-sm font-medium text-foreground mr-auto max-w-[90%] md:max-w-[80%] min-w-0'>
        <span className={`font-black text-xs uppercase mb-1 flex items-center gap-1.5 ${labelColor}`}>
          <span className={`w-1.5 h-1.5 ${color} border border-border shrink-0`} />
          {label}
        </span>
        <div className='flex items-center gap-1.5'>
          {/* Block cursor */}
          <span className='inline-block w-2 h-4 bg-primary animate-neo-blink' />
          <span className='text-muted-foreground text-sm font-bold tracking-wider'>
            {thinkingSteps[stepIdx]}
          </span>
        </div>

        {/* Indeterminate progress bar */}
        <div className='mt-2 h-1 bg-muted overflow-hidden border-t border-border/30'>
          <div className='h-full w-1/3 bg-primary animate-neo-progress' />
        </div>
      </div>
    </div>
  );
};

export default StreamingIndicator;
