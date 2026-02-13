'use client';

import {useRef, useCallback, useEffect, useState} from 'react';
import {Footprints, Dumbbell} from 'lucide-react';

interface TrainingGaugeProps {
  value: number; // 20–80 (snapped to 10s)
  onChange: (v: number) => void;
}

const MIN = 20;
const MAX = 80;
const RANGE = MAX - MIN; // 60
const STEP = 10;
const TICKS = 10;
const SNAP_VALUES = [20, 30, 40, 50, 60, 70, 80];

/** Snap a raw value to the nearest 10-increment within [20, 80]. */
const snap = (v: number): number => {
  const snapped = Math.round(v / STEP) * STEP;
  return Math.min(MAX, Math.max(MIN, snapped));
};

/** Map a value (20–80) to an angle (π → 0, i.e. left→right on a top-opening semicircle). */
const valueToAngle = (v: number): number => {
  const t = (v - MIN) / RANGE; // 0→1
  return Math.PI * (1 - t); // π→0
};

/** Map an angle (π→0) back to a raw value (20–80), then snap. */
const angleToValue = (angle: number): number => {
  const t = 1 - angle / Math.PI;
  const raw = MIN + t * RANGE;
  return snap(raw);
};

/** Polar→cartesian on a top-opening arc centered at (cx, cy). */
const polarToXY = (
  cx: number,
  cy: number,
  r: number,
  angle: number,
): {x: number; y: number} => ({
  x: cx + r * Math.cos(angle),
  y: cy - r * Math.sin(angle), // SVG y is inverted
});

const getLabel = (v: number): string => {
  if (v <= 30) return 'Run-focused';
  if (v <= 40) return 'Run-leaning';
  if (v <= 55) return 'Balanced';
  if (v <= 65) return 'Gym-leaning';
  return 'Gym-focused';
};

/**
 * Segment colors along the arc (left=Run → right=Gym).
 * 7 key colors at each snap value: green → yellow → orange → magenta.
 * Matches the existing design-system palette.
 */
const SEGMENT_COLORS = [
  'hsl(152, 65%, 42%)', // 20 – deep green (run)
  'hsl(120, 55%, 45%)', // 30 – green
  'hsl(84, 70%, 48%)',  // 40 – yellow-green
  'hsl(48, 96%, 53%)',  // 50 – bright yellow (balanced)
  'hsl(24, 95%, 53%)',  // 60 – orange
  'hsl(350, 75%, 52%)', // 70 – red-pink
  'hsl(312, 100%, 62%)',// 80 – magenta (gym/strength)
];

/** Build a partial arc path from startAngle to endAngle at radius r. */
const arcSegmentPath = (
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string => {
  const start = polarToXY(cx, cy, r, startAngle);
  const end = polarToXY(cx, cy, r, endAngle);
  const sweep = startAngle - endAngle;
  const largeArc = sweep > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
};

const TrainingGauge = ({value, onChange}: TrainingGaugeProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  // Gauge layout constants
  const W = 320;
  const H = 200;
  const CX = W / 2;
  const CY = H - 20;
  const R = 120;
  const TRACK_WIDTH = 14;

  /** Convert a mouse/touch position to a snapped gauge value. */
  const pointerToValue = useCallback(
    (clientX: number, clientY: number): number | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const sx = ((clientX - rect.left) / rect.width) * W;
      const sy = ((clientY - rect.top) / rect.height) * H;
      const dx = sx - CX;
      const dy = CY - sy;
      if (dy < -10) return null;
      let angle = Math.atan2(dy, dx);
      if (angle < 0) angle = 0;
      if (angle > Math.PI) angle = Math.PI;
      return angleToValue(angle);
    },
    [CX, CY, W, H],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const v = pointerToValue(e.clientX, e.clientY);
      if (v === null) return;
      dragging.current = true;
      setIsDragging(true);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      onChange(v);
    },
    [pointerToValue, onChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragging.current) return;
      const v = pointerToValue(e.clientX, e.clientY);
      if (v !== null) onChange(v);
    },
    [pointerToValue, onChange],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const up = () => {
      dragging.current = false;
      setIsDragging(false);
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  // Full arc path (for the border/track background)
  const fullArcPath = (r: number): string => {
    const start = polarToXY(CX, CY, r, Math.PI);
    const end = polarToXY(CX, CY, r, 0);
    return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
  };

  const snappedValue = snap(value);
  const needleAngle = valueToAngle(snappedValue);

  // Needle geometry
  const needleTip = polarToXY(CX, CY, R + 6, needleAngle);
  const needleBase1 = polarToXY(CX, CY, 18, needleAngle + 0.25);
  const needleBase2 = polarToXY(CX, CY, 18, needleAngle - 0.25);

  return (
    <div className='flex flex-col items-center gap-1 select-none'>
      {/* Label badge */}
      <span className='inline-block px-4 py-1.5 border-3 border-border bg-primary/10 font-black text-sm uppercase tracking-wider shadow-neo-sm mb-1'>
        {getLabel(snappedValue)}
      </span>

      <div className='relative w-full max-w-[320px]'>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className='w-full h-auto touch-none'
          style={{cursor: isDragging ? 'grabbing' : 'pointer'}}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          aria-hidden='true'
        >
          {/* Track border — outer ring */}
          <path
            d={fullArcPath(R)}
            fill='none'
            stroke='hsl(var(--border))'
            strokeWidth={TRACK_WIDTH + 6}
            strokeLinecap='butt'
          />

          {/* Track background (muted) — full arc */}
          <path
            d={fullArcPath(R)}
            fill='none'
            stroke='hsl(var(--muted))'
            strokeWidth={TRACK_WIDTH}
            strokeLinecap='butt'
          />

          {/* Colored segments — one per gap between snap values, only up to the needle */}
          {SNAP_VALUES.slice(0, -1).map((segStart, i) => {
            const segEnd = SNAP_VALUES[i + 1];
            // Skip segments entirely past the needle
            if (segStart >= snappedValue) return null;
            // Clamp the segment end to the needle position
            const clampedEnd = Math.min(segEnd, snappedValue);
            const startAngle = valueToAngle(segStart);
            const endAngle = valueToAngle(clampedEnd);
            return (
              <path
                key={i}
                d={arcSegmentPath(CX, CY, R, startAngle, endAngle)}
                fill='none'
                stroke={SEGMENT_COLORS[i]}
                strokeWidth={TRACK_WIDTH}
                strokeLinecap='butt'
              />
            );
          })}

          {/* Tick marks — 10 ticks */}
          {Array.from({length: TICKS}).map((_, i) => {
            const t = i / (TICKS - 1);
            const angle = Math.PI * (1 - t);
            const outer = polarToXY(CX, CY, R + TRACK_WIDTH / 2 + 4, angle);
            const inner = polarToXY(CX, CY, R + TRACK_WIDTH / 2 + 12, angle);
            return (
              <line
                key={i}
                x1={outer.x}
                y1={outer.y}
                x2={inner.x}
                y2={inner.y}
                stroke='hsl(var(--border))'
                strokeWidth={3}
                strokeLinecap='butt'
              />
            );
          })}

          {/* Needle shadow (neo offset) */}
          <polygon
            points={`${needleTip.x + 2},${needleTip.y + 2} ${needleBase1.x + 2},${needleBase1.y + 2} ${needleBase2.x + 2},${needleBase2.y + 2}`}
            fill='hsl(var(--neo-shadow))'
            opacity={0.5}
          />

          {/* Needle */}
          <polygon
            points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
            fill='hsl(var(--foreground))'
            stroke='hsl(var(--border))'
            strokeWidth={2.5}
            strokeLinejoin='bevel'
          />

          {/* Needle center hub */}
          <circle
            cx={CX}
            cy={CY}
            r={10}
            fill='hsl(var(--background))'
            stroke='hsl(var(--border))'
            strokeWidth={3}
          />
          <circle cx={CX} cy={CY} r={4} fill='hsl(var(--primary))' />

          {/* Footprints icon box (left) */}
          <g transform={`translate(${CX - R - TRACK_WIDTH / 2 - 28}, ${CY - 12})`}>
            <rect
              x={-2}
              y={-2}
              width={28}
              height={28}
              fill='hsl(var(--background))'
              stroke='hsl(var(--border))'
              strokeWidth={2.5}
            />
          </g>

          {/* Dumbbell icon box (right) */}
          <g transform={`translate(${CX + R + TRACK_WIDTH / 2 + 4}, ${CY - 12})`}>
            <rect
              x={-2}
              y={-2}
              width={28}
              height={28}
              fill='hsl(var(--background))'
              stroke='hsl(var(--border))'
              strokeWidth={2.5}
            />
          </g>
        </svg>

        {/* Overlay HTML icons for crisp lucide rendering */}
        <div
          className='absolute flex items-center justify-center w-6 h-6'
          style={{
            left: `${((CX - R - TRACK_WIDTH / 2 - 26) / W) * 100}%`,
            top: `${((CY - 8) / H) * 100}%`,
          }}
        >
          <Footprints className='h-5 w-5 text-muted-foreground pointer-events-none' />
        </div>
        <div
          className='absolute flex items-center justify-center w-6 h-6'
          style={{
            left: `${((CX + R + TRACK_WIDTH / 2 + 4) / W) * 100}%`,
            top: `${((CY - 8) / H) * 100}%`,
          }}
        >
          <Dumbbell className='h-5 w-5 text-muted-foreground pointer-events-none' />
        </div>
      </div>

      {/* Scale labels under the gauge */}
      <div className='flex justify-between w-full max-w-[320px] px-6 -mt-2'>
        <span className='font-black text-[10px] uppercase tracking-wider text-muted-foreground'>
          Run
        </span>
        <span className='font-black text-[10px] uppercase tracking-wider text-muted-foreground'>
          Balanced
        </span>
        <span className='font-black text-[10px] uppercase tracking-wider text-muted-foreground'>
          Gym
        </span>
      </div>

      {/* Value display — below the gauge */}
      <div className='text-center mt-2'>
        <p className='font-black text-3xl tabular-nums tracking-tight leading-none'>
          {100 - snappedValue}
          <span className='text-lg text-muted-foreground'>/</span>
          {snappedValue}
        </p>
        <div className='flex justify-center gap-6 mt-1'>
          <span className='font-bold text-[10px] uppercase tracking-wider text-muted-foreground'>
            Run
          </span>
          <span className='font-bold text-[10px] uppercase tracking-wider text-muted-foreground'>
            Gym
          </span>
        </div>
      </div>

      {/* Hidden range input for keyboard / screen-reader accessibility */}
      <input
        type='range'
        min={MIN}
        max={MAX}
        step={STEP}
        value={snappedValue}
        onChange={(e) => onChange(snap(parseInt(e.target.value)))}
        aria-label='Training balance between running and gym'
        className='sr-only'
      />
    </div>
  );
};

export default TrainingGauge;
