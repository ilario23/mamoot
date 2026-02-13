'use client';

import {Loader2, Check} from 'lucide-react';

interface ToolCallChipProps {
  /** User-friendly label for the tool, e.g. "Looking at recent activities" */
  label: string;
  /** Whether the tool has finished executing */
  done: boolean;
}

const ToolCallChip = ({label, done}: ToolCallChipProps) => (
  <div
    className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold tracking-wide border-2 transition-all duration-300 ${
      done
        ? 'border-primary/30 bg-primary/10 text-primary/60'
        : 'border-primary/50 bg-primary/20 text-primary animate-neo-pulse'
    }`}
    role='status'
    aria-label={done ? `${label} — done` : `${label} — in progress`}
  >
    {done ? (
      <Check className='h-2.5 w-2.5 shrink-0' />
    ) : (
      <Loader2 className='h-2.5 w-2.5 shrink-0 animate-spin' />
    )}
    <span>{label}</span>
  </div>
);

export default ToolCallChip;
