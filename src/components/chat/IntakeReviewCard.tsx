import {CheckCircle2, Loader2, Pencil} from 'lucide-react';

interface ReviewItem {
  label: string;
  value: string;
}

interface IntakeReviewCardProps {
  title: string;
  subtitle: string;
  items: ReviewItem[];
  generateLabel: string;
  isGenerating?: boolean;
  onEdit: () => void;
  onGenerate: () => void;
  onCancel: () => void;
}

const IntakeReviewCard = ({
  title,
  subtitle,
  items,
  generateLabel,
  isGenerating = false,
  onEdit,
  onGenerate,
  onCancel,
}: IntakeReviewCardProps) => (
  <div className='border-3 border-border bg-background p-3 space-y-3 shadow-neo-sm'>
    <div className='space-y-1'>
      <p className='text-[10px] font-black uppercase tracking-widest text-primary'>
        {title}
      </p>
      <p className='text-xs font-medium text-muted-foreground'>{subtitle}</p>
    </div>

    <div className='space-y-1.5'>
      {items.map((item) => (
        <div
          key={item.label}
          className='border-2 border-border/70 bg-muted/30 px-2 py-1.5 text-xs'
        >
          <p className='text-[10px] font-black uppercase tracking-wider text-muted-foreground'>
            {item.label}
          </p>
          <p className='font-bold'>{item.value}</p>
        </div>
      ))}
    </div>

    <div className='flex flex-wrap items-center gap-1.5'>
      <button
        onClick={onEdit}
        disabled={isGenerating}
        tabIndex={0}
        aria-label='Edit guided setup answers'
        className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-background disabled:opacity-40 disabled:pointer-events-none'
      >
        <Pencil className='h-3 w-3' />
        Edit
      </button>
      <button
        onClick={onGenerate}
        disabled={isGenerating}
        tabIndex={0}
        aria-label={generateLabel}
        className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-primary text-primary-foreground disabled:opacity-40 disabled:pointer-events-none'
      >
        {isGenerating ? (
          <Loader2 className='h-3 w-3 animate-spin' />
        ) : (
          <CheckCircle2 className='h-3 w-3' />
        )}
        {generateLabel}
      </button>
      <button
        onClick={onCancel}
        disabled={isGenerating}
        tabIndex={0}
        aria-label='Cancel guided setup'
        className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-destructive/10 text-destructive disabled:opacity-40 disabled:pointer-events-none'
      >
        Cancel
      </button>
    </div>
  </div>
);

export default IntakeReviewCard;
