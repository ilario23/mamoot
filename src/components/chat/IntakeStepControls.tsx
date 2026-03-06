import {ArrowLeft, ArrowRight, Play, Save, X} from 'lucide-react';

interface IntakeStepControlsProps {
  canGoBack: boolean;
  canGoNext: boolean;
  isLastStep: boolean;
  isSubmitting?: boolean;
  onBack: () => void;
  onNext: () => void;
  onCancel: () => void;
  onSaveDraft?: () => void;
}

const IntakeStepControls = ({
  canGoBack,
  canGoNext,
  isLastStep,
  isSubmitting = false,
  onBack,
  onNext,
  onCancel,
  onSaveDraft,
}: IntakeStepControlsProps) => (
  <div className='flex flex-wrap items-center gap-1.5 pt-1.5'>
    <button
      onClick={onBack}
      disabled={!canGoBack || isSubmitting}
      tabIndex={0}
      aria-label='Go to previous intake question'
      className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-background disabled:opacity-40 disabled:pointer-events-none'
    >
      <ArrowLeft className='h-3 w-3' />
      Back
    </button>
    <button
      onClick={onNext}
      disabled={!canGoNext || isSubmitting}
      tabIndex={0}
      aria-label={isLastStep ? 'Review intake answers' : 'Go to next intake question'}
      className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-primary text-primary-foreground disabled:opacity-40 disabled:pointer-events-none'
    >
      {isLastStep ? <Play className='h-3 w-3' /> : <ArrowRight className='h-3 w-3' />}
      {isLastStep ? 'Review' : 'Next'}
    </button>
    {onSaveDraft && (
      <button
        onClick={onSaveDraft}
        disabled={isSubmitting}
        tabIndex={0}
        aria-label='Save intake draft'
        className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-accent text-accent-foreground disabled:opacity-40 disabled:pointer-events-none'
      >
        <Save className='h-3 w-3' />
        Save draft
      </button>
    )}
    <button
      onClick={onCancel}
      disabled={isSubmitting}
      tabIndex={0}
      aria-label='Cancel guided setup'
      className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-destructive/10 text-destructive disabled:opacity-40 disabled:pointer-events-none'
    >
      <X className='h-3 w-3' />
      Cancel
    </button>
  </div>
);

export default IntakeStepControls;
