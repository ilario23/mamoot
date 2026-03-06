'use client';

import {useMemo, useState} from 'react';
import type {CachedTrainingFeedback} from '@/lib/cacheTypes';

type WeeklyReflectionValues = {
  adherence: number;
  effort: number;
  fatigue: number;
  soreness: number;
  mood: number;
  confidence: number;
  notes?: string;
};

interface WeeklyReflectionFormProps {
  weekStart: string;
  prompt?: string;
  initialValues?: CachedTrainingFeedback | null;
  isSubmitting?: boolean;
  submitLabel?: string;
  compact?: boolean;
  onSubmit: (values: WeeklyReflectionValues) => Promise<void> | void;
  onCancel?: () => void;
}

type ScoreField = {
  key: keyof WeeklyReflectionValues;
  label: string;
};

const SCORE_FIELDS: ScoreField[] = [
  {key: 'adherence', label: 'Adherence'},
  {key: 'effort', label: 'Effort'},
  {key: 'fatigue', label: 'Fatigue'},
  {key: 'soreness', label: 'Soreness'},
  {key: 'mood', label: 'Mood'},
  {key: 'confidence', label: 'Confidence'},
];

const clampScore = (value: number): number => {
  if (Number.isNaN(value)) return 3;
  return Math.max(1, Math.min(5, value));
};

const WeeklyReflectionForm = ({
  weekStart,
  prompt = 'Share how your training week felt.',
  initialValues,
  isSubmitting = false,
  submitLabel = 'Submit reflection',
  compact = false,
  onSubmit,
  onCancel,
}: WeeklyReflectionFormProps) => {
  const defaults = useMemo(
    () => ({
      adherence: initialValues?.adherence ?? 3,
      effort: initialValues?.effort ?? 3,
      fatigue: initialValues?.fatigue ?? 3,
      soreness: initialValues?.soreness ?? 3,
      mood: initialValues?.mood ?? 3,
      confidence: initialValues?.confidence ?? 3,
      notes: initialValues?.notes ?? '',
    }),
    [initialValues],
  );

  const [values, setValues] = useState(defaults);

  const handleScoreChange = (key: keyof WeeklyReflectionValues, raw: string) => {
    setValues((prev) => ({...prev, [key]: clampScore(Number(raw))}));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({
      adherence: clampScore(values.adherence),
      effort: clampScore(values.effort),
      fatigue: clampScore(values.fatigue),
      soreness: clampScore(values.soreness),
      mood: clampScore(values.mood),
      confidence: clampScore(values.confidence),
      notes: values.notes?.trim() || '',
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`space-y-3 ${compact ? '' : 'border-2 border-border bg-muted/40 p-3'}`}
    >
      <div className='space-y-1'>
        <p className='text-xs font-black uppercase tracking-wider text-primary'>
          Weekly reflection ({weekStart})
        </p>
        <p className='text-xs text-muted-foreground font-medium'>{prompt}</p>
      </div>

      <div className='grid grid-cols-2 gap-2'>
        {SCORE_FIELDS.map((field) => (
          <label key={field.key} className='space-y-1'>
            <span className='text-[10px] font-black uppercase tracking-wider text-muted-foreground'>
              {field.label}
            </span>
            <select
              value={String(values[field.key] ?? 3)}
              onChange={(event) => handleScoreChange(field.key, event.target.value)}
              className='w-full border-2 border-border bg-background px-2 py-1 text-xs font-medium'
              aria-label={`${field.label} score`}
            >
              <option value='1'>1</option>
              <option value='2'>2</option>
              <option value='3'>3</option>
              <option value='4'>4</option>
              <option value='5'>5</option>
            </select>
          </label>
        ))}
      </div>

      <label className='space-y-1 block'>
        <span className='text-[10px] font-black uppercase tracking-wider text-muted-foreground'>
          Notes (optional)
        </span>
        <textarea
          value={values.notes ?? ''}
          onChange={(event) =>
            setValues((prev) => ({...prev, notes: event.target.value}))
          }
          rows={compact ? 2 : 3}
          className='w-full border-2 border-border bg-background px-2 py-1 text-xs font-medium resize-none'
          aria-label='Reflection notes'
        />
      </label>

      <div className='flex flex-wrap gap-2'>
        <button
          type='submit'
          disabled={isSubmitting}
          tabIndex={0}
          aria-label='Save weekly reflection'
          className='inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-primary text-primary-foreground disabled:opacity-50'
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
        {onCancel && (
          <button
            type='button'
            onClick={onCancel}
            tabIndex={0}
            aria-label='Cancel reflection'
            className='inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-background hover:bg-muted'
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

export default WeeklyReflectionForm;
