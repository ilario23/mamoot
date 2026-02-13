'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

type NeoLoaderSize = 'sm' | 'md' | 'lg';

interface NeoLoaderProps {
  /** Text label that cycles with dots. Default: "Loading" */
  label?: string;
  /** Size variant */
  size?: NeoLoaderSize;
  /** Override the accent color class for the bar/cursor (e.g. 'bg-secondary'). Defaults to page accent. */
  colorClass?: string;
  /** Additional className for the wrapper */
  className?: string;
}

const SIZE_CONFIG: Record<NeoLoaderSize, { cursor: string; text: string; bar: string; gap: string; blocks: string }> = {
  sm: { cursor: 'w-1.5 h-3', text: 'text-xs', bar: 'h-0.5 mt-1.5', gap: 'gap-1', blocks: 'w-1 h-3' },
  md: { cursor: 'w-2 h-4', text: 'text-sm', bar: 'h-1 mt-2', gap: 'gap-1.5', blocks: 'w-1.5 h-5' },
  lg: { cursor: 'w-2.5 h-5', text: 'text-base', bar: 'h-1.5 mt-3', gap: 'gap-2', blocks: 'w-2 h-7' },
};

const NeoLoader = ({
  label = 'Loading',
  size = 'md',
  colorClass = 'bg-page',
  className,
}: NeoLoaderProps) => {
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount((prev) => (prev + 1) % 4);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  const dots = '.'.repeat(dotCount);
  const cfg = SIZE_CONFIG[size];

  return (
    <div
      className={cn('flex flex-col items-center animate-fade-in-up', className)}
      role="status"
      aria-label={label}
    >
      {/* Animated blocks */}
      <div className={cn('flex items-end', cfg.gap, 'mb-3')}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(cfg.blocks, colorClass, 'border border-border animate-neo-blocks')}
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>

      {/* Blinking cursor + label */}
      <div className={cn('flex items-center', cfg.gap)}>
        <span className={cn('inline-block animate-neo-blink', cfg.cursor, colorClass)} />
        <span className={cn('font-bold tracking-wider text-muted-foreground', cfg.text)}>
          {label}{dots}
        </span>
      </div>

      {/* Indeterminate progress bar */}
      <div className={cn('w-full max-w-[180px] bg-muted overflow-hidden border-t border-border/30', cfg.bar)}>
        <div className={cn('h-full w-1/3 animate-neo-progress', colorClass)} />
      </div>
    </div>
  );
};

export { NeoLoader };
