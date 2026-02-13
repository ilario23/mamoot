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
    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold tracking-wide border-2 transition-all duration-300 ${
      done
        ? 'border-border bg-muted text-foreground shadow-neo-sm'
        : 'border-border border-l-[3px] border-l-primary bg-primary/15 text-foreground animate-neo-pulse'
    }`}
    role='status'
    aria-label={done ? `${label} — done` : `${label} — in progress`}
  >
    {done ? (
      <Check className='h-3 w-3 shrink-0' />
    ) : (
      <Loader2 className='h-3 w-3 shrink-0 animate-spin' />
    )}
    <span>{label}</span>
  </div>
);

export default ToolCallChip;
