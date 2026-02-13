// ----- Shared session type badge colors for training plans -----

export const SESSION_TYPE_COLORS: Record<string, string> = {
  easy: 'bg-zone-1/20 text-zone-1',
  intervals: 'bg-zone-4/20 text-zone-4',
  tempo: 'bg-zone-3/20 text-zone-3',
  long: 'bg-zone-2/20 text-zone-2',
  rest: 'bg-muted text-muted-foreground',
  strength: 'bg-secondary/20 text-secondary',
  recovery: 'bg-zone-1/20 text-zone-1',
  mobility: 'bg-zone-2/20 text-zone-2',
  warmup: 'bg-zone-3/20 text-zone-3',
  cooldown: 'bg-zone-1/20 text-zone-1',
};

/** Border-left color per session type for card accent strips */
export const SESSION_TYPE_BORDER_COLORS: Record<string, string> = {
  easy: 'border-l-zone-1',
  intervals: 'border-l-zone-4',
  tempo: 'border-l-zone-3',
  long: 'border-l-zone-2',
  rest: 'border-l-muted-foreground',
  strength: 'border-l-secondary',
  recovery: 'border-l-zone-1',
};
