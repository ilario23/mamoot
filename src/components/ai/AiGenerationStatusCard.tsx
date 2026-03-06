import type {AiProgressPhase} from '@/lib/aiProgress';
import AiProgressTimeline from '@/components/ai/AiProgressTimeline';

type PhaseStatus = 'pending' | 'in_progress' | 'done' | 'error';

interface AiGenerationStatusCardProps {
  title: string;
  subtitle?: string;
  phaseOrder: AiProgressPhase[];
  phaseLabels: Record<AiProgressPhase, string>;
  phaseStatusMap: Record<AiProgressPhase, PhaseStatus>;
  currentMessage?: string | null;
  className?: string;
}

const AiGenerationStatusCard = ({
  title,
  subtitle,
  phaseOrder,
  phaseLabels,
  phaseStatusMap,
  currentMessage,
  className,
}: AiGenerationStatusCardProps) => (
  <div className={`space-y-2 ${className ?? ''}`}>
    <div className='space-y-1'>
      <h4 className='text-xs font-black uppercase tracking-widest'>{title}</h4>
      {subtitle && (
        <p className='text-xs text-muted-foreground font-medium'>{subtitle}</p>
      )}
    </div>
    <AiProgressTimeline
      phaseOrder={phaseOrder}
      phaseLabels={phaseLabels}
      phaseStatusMap={phaseStatusMap}
      currentMessage={currentMessage}
    />
  </div>
);

export default AiGenerationStatusCard;
