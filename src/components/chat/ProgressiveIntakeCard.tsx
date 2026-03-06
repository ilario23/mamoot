import {MessageSquareQuote} from 'lucide-react';
import type {ReactNode} from 'react';

interface IntakeOption {
  id: string;
  label: string;
  hint?: string;
}

interface ProgressiveIntakeCardProps {
  title: string;
  subtitle: string;
  question: string;
  stepIndex: number;
  totalSteps: number;
  options?: IntakeOption[];
  selectedOptionIds?: string[];
  allowMultiple?: boolean;
  onSelectOption?: (id: string) => void;
  freeText: string;
  onChangeFreeText: (value: string) => void;
  freeTextPlaceholder?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

const ProgressiveIntakeCard = ({
  title,
  subtitle,
  question,
  stepIndex,
  totalSteps,
  options = [],
  selectedOptionIds = [],
  allowMultiple = false,
  onSelectOption,
  freeText,
  onChangeFreeText,
  freeTextPlaceholder = 'Optional details',
  children,
  footer,
}: ProgressiveIntakeCardProps) => (
  <div className='border-3 border-border bg-background p-2.5 space-y-2.5 shadow-neo-sm'>
    <div className='flex items-start justify-between gap-2'>
      <div className='space-y-1'>
        <p className='text-[10px] font-black uppercase tracking-widest text-primary'>
          {title}
        </p>
        <p className='text-xs font-medium text-muted-foreground'>{subtitle}</p>
      </div>
      <span className='shrink-0 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-primary/10 px-2 py-1'>
        Q{stepIndex + 1}/{totalSteps}
      </span>
    </div>

    <div className='space-y-1.5'>
      <p className='text-sm font-bold flex items-start gap-1.5'>
        <MessageSquareQuote className='h-4 w-4 mt-0.5 text-primary shrink-0' />
        <span>{question}</span>
      </p>

      {options.length > 0 && onSelectOption && (
        <div className='flex flex-wrap gap-1.5'>
          {options.map((option) => {
            const isSelected = selectedOptionIds.includes(option.id);
            return (
              <button
                key={option.id}
                onClick={() => onSelectOption(option.id)}
                tabIndex={0}
                aria-label={`Select ${option.label}`}
                className={`px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 transition-colors ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {option.label}
                {option.hint ? ` · ${option.hint}` : ''}
              </button>
            );
          })}
          {allowMultiple && (
            <p className='w-full text-[10px] font-medium text-muted-foreground'>
              You can select multiple options.
            </p>
          )}
        </div>
      )}

      {children}

      <div className='space-y-1'>
        <label className='text-[10px] font-black uppercase tracking-wider text-muted-foreground'>
          Extra notes
        </label>
        <textarea
          value={freeText}
          onChange={(event) => onChangeFreeText(event.target.value)}
          rows={2}
          placeholder={freeTextPlaceholder}
          aria-label='Additional requirements'
          className='w-full border-2 border-border bg-background px-2 py-1 text-xs font-medium resize-none'
        />
      </div>
    </div>

    {footer}
  </div>
);

export default ProgressiveIntakeCard;
