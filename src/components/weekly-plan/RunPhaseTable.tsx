'use client';

import type {UnifiedSession} from '@/lib/cacheTypes';
import type {RunStep} from '@/lib/weeklyPlanSchema';

type Run = NonNullable<UnifiedSession['run']>;

const targetCell = (step: RunStep): string => {
  const parts = [step.targetZone, step.targetPace].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
};

const PhaseBlock = ({
  title,
  steps,
}: {
  title: string;
  steps: RunStep[];
}) => (
  <div className='space-y-1.5'>
    <h4 className='text-[10px] font-black uppercase tracking-wider text-muted-foreground'>
      {title}
    </h4>
    <div className='overflow-x-auto border-2 border-border'>
      <table className='w-full min-w-[360px] text-left text-xs border-collapse'>
        <thead>
          <tr className='bg-muted/50 border-b-2 border-border'>
            <th className='px-2 py-1.5 font-black uppercase tracking-wider'>Step</th>
            <th className='px-2 py-1.5 font-black uppercase tracking-wider w-12'>Min</th>
            <th className='px-2 py-1.5 font-black uppercase tracking-wider w-12'>km</th>
            <th className='px-2 py-1.5 font-black uppercase tracking-wider'>Target</th>
            <th className='px-2 py-1.5 font-black uppercase tracking-wider'>Recovery</th>
            <th className='px-2 py-1.5 font-black uppercase tracking-wider'>Notes</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, i) => (
            <tr key={`${title}-${i}`} className='border-b border-border/60 last:border-b-0'>
              <td className='px-2 py-1.5 font-medium align-top'>
                {step.label}
                {step.repeatCount != null ? (
                  <span className='ml-1 text-[10px] text-muted-foreground font-bold'>
                    ×{step.repeatCount}
                  </span>
                ) : null}
              </td>
              <td className='px-2 py-1.5 text-muted-foreground align-top'>
                {step.durationMin != null ? step.durationMin : '—'}
              </td>
              <td className='px-2 py-1.5 text-muted-foreground align-top'>
                {step.distanceKm != null ? step.distanceKm : '—'}
              </td>
              <td className='px-2 py-1.5 align-top'>{targetCell(step)}</td>
              <td className='px-2 py-1.5 text-muted-foreground align-top'>
                {step.recovery ?? '—'}
              </td>
              <td className='px-2 py-1.5 text-muted-foreground align-top'>{step.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const hasRunPhaseStructure = (run: Run): boolean =>
  (run.warmupSteps?.length ?? 0) +
    (run.mainSteps?.length ?? 0) +
    (run.cooldownSteps?.length ?? 0) >
  0;

const RunPhaseTable = ({run}: {run: Run}) => {
  if (!hasRunPhaseStructure(run)) return null;

  return (
    <div className='space-y-3 mt-2' aria-label='Workout structure'>
      {run.warmupSteps && run.warmupSteps.length > 0 ? (
        <PhaseBlock title='Warmup' steps={run.warmupSteps} />
      ) : null}
      {run.mainSteps && run.mainSteps.length > 0 ? (
        <PhaseBlock title='Main' steps={run.mainSteps} />
      ) : null}
      {run.cooldownSteps && run.cooldownSteps.length > 0 ? (
        <PhaseBlock title='Cooldown' steps={run.cooldownSteps} />
      ) : null}
    </div>
  );
};

export default RunPhaseTable;
