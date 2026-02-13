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
    <div className='flex gap-2 flex-row min-w-0'>
      {/* Avatar (mirrors PersonaAvatar md size) */}
      <div
        className={`w-9 h-9 ${color} rounded-full border-3 border-border flex items-center justify-center shadow-neo-sm shrink-0`}
      >
        <Icon className='h-4 w-4 text-foreground' />
      </div>

      {/* Thinking bubble */}
      <div className={`p-2 md:p-3 border-2 md:border-3 border-border text-sm font-medium bg-foreground text-background mr-auto max-w-[85%] md:max-w-[75%] shadow-neo-sm animate-neo-pulse min-w-0 ${bubbleBorder ? `border-l-[5px] ${bubbleBorder}` : ''}`}>
        <span className={`font-black text-xs uppercase mb-1 block ${labelColor}`}>
          {label}
        </span>
        <div className='flex items-center gap-1.5'>
          {/* Block cursor */}
          <span className='inline-block w-2 h-4 bg-primary animate-neo-blink' />
          <span className='text-background/60 text-xs font-bold tracking-wide'>
            {thinkingSteps[stepIdx]}
          </span>
        </div>

        {/* Indeterminate progress bar */}
        <div className='mt-2 h-0.5 bg-background/20 overflow-hidden border-t border-background/10'>
          <div className='h-full w-1/3 bg-primary animate-neo-progress' />
        </div>
      </div>
    </div>
  );
};

export default StreamingIndicator;
