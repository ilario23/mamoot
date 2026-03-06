import {CheckCircle2, Circle, AlertCircle, Loader2} from 'lucide-react';
import type {AiProgressPhase} from '@/lib/aiProgress';

type PhaseStatus = 'pending' | 'in_progress' | 'done' | 'error';

interface AiProgressTimelineProps {
  phaseOrder: AiProgressPhase[];
  phaseLabels: Record<AiProgressPhase, string>;
  phaseStatusMap: Record<AiProgressPhase, PhaseStatus>;
  currentMessage?: string | null;
  className?: string;
}

const StatusIcon = ({status}: {status: PhaseStatus}) => {
  if (status === 'done') {
    return <CheckCircle2 className='h-4 w-4 text-secondary shrink-0' />;
  }
  if (status === 'in_progress') {
    return <Loader2 className='h-4 w-4 text-primary animate-spin shrink-0' />;
  }
  if (status === 'error') {
    return <AlertCircle className='h-4 w-4 text-destructive shrink-0' />;
  }
  return <Circle className='h-4 w-4 text-muted-foreground shrink-0' />;
};

const statusClasses: Record<PhaseStatus, string> = {
  pending: 'text-muted-foreground',
  in_progress: 'text-primary',
  done: 'text-foreground',
  error: 'text-destructive',
};

const AiProgressTimeline = ({
  phaseOrder,
  phaseLabels,
  phaseStatusMap,
  currentMessage,
  className,
}: AiProgressTimelineProps) => (
  <div
    className={`border-3 border-border bg-background shadow-neo-sm p-3 space-y-2 ${className ?? ''}`}
  >
    <p className='text-[10px] font-black uppercase tracking-widest text-primary'>
      Generation Progress
    </p>
    <div className='space-y-1.5'>
      {phaseOrder.map((phase) => {
        const status = phaseStatusMap[phase] ?? 'pending';
        return (
          <div
            key={phase}
            className='flex items-center gap-2 border-2 border-border/60 bg-muted/20 px-2 py-1.5'
          >
            <StatusIcon status={status} />
            <span className={`text-xs font-bold ${statusClasses[status]}`}>
              {phaseLabels[phase]}
            </span>
          </div>
        );
      })}
    </div>
    {currentMessage && (
      <p className='text-xs text-muted-foreground font-medium leading-relaxed'>
        {currentMessage}
      </p>
    )}
  </div>
);

export default AiProgressTimeline;
