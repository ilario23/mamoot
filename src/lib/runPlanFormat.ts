import type {UnifiedSession} from './cacheTypes';
import type {RunStep} from './weeklyPlanSchema';

const cell = (value: string): string => value.replace(/\|/g, '/');

/** One-line summary of step list for mentions / tool context. */
export const summarizeRunSteps = (steps: RunStep[] | undefined): string | undefined => {
  if (!steps?.length) return undefined;
  return steps.map((s) => s.label).join(' → ');
};

/** Prefer phased summary when steps exist; otherwise description only. */
export const formatRunPhasesSummary = (run: NonNullable<UnifiedSession['run']>): string => {
  const wu = summarizeRunSteps(run.warmupSteps);
  const main = summarizeRunSteps(run.mainSteps);
  const cd = summarizeRunSteps(run.cooldownSteps);
  if (!wu && !main && !cd) return run.description;
  const parts = [
    wu ? `Warmup: ${wu}` : null,
    main ? `Main: ${main}` : null,
    cd ? `Cooldown: ${cd}` : null,
  ].filter(Boolean) as string[];
  if (!parts.length) return run.description;
  return `${run.description} — ${parts.join(' | ')}`;
};

const markdownRow = (step: RunStep): string => {
  const zonePace = [step.targetZone, step.targetPace].filter(Boolean).join(' / ') || '—';
  const time = step.durationMin != null ? String(step.durationMin) : '—';
  const dist = step.distanceKm != null ? String(step.distanceKm) : '—';
  const recovery = step.recovery ?? '—';
  const notes = step.notes ?? '—';
  const repeat =
    step.repeatCount != null ? `${cell(step.label)} (×${step.repeatCount})` : cell(step.label);
  return `| ${repeat} | ${time} | ${dist} | ${cell(zonePace)} | ${cell(recovery)} | ${cell(notes)} |`;
};

/** Append GFM tables for warmup / main / cooldown under ### Running. */
export const appendRunPhasesMarkdown = (
  lines: string[],
  run: NonNullable<UnifiedSession['run']>,
): void => {
  const pushTable = (title: string, steps: RunStep[] | undefined) => {
    if (!steps?.length) return;
    lines.push(`#### ${title}`);
    lines.push('| Step | Min | km | Zone / pace | Recovery | Notes |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const step of steps) lines.push(markdownRow(step));
  };
  pushTable('Warmup', run.warmupSteps);
  pushTable('Main', run.mainSteps);
  pushTable('Cooldown', run.cooldownSteps);
};
