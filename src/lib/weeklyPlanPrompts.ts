/** Focused pipeline prompts for generating unified weekly plans. */

export const buildCoachPipelinePrompt = (context: {
  athleteName: string | null;
  hrZones: string | null;
  weight: number | null;
  trainingBalance: number | null;
  weekStart: string;
  weekEnd: string;
  recentTraining: string;
  injuries: string;
  goal: string | null;
  personalRecords: string;
  preferences: string | null;
  lastWeekReview: string | null;
  trainingBlockContext: string | null;
}) => `You are an expert running coach. Generate a 7-day running plan for the week of ${context.weekStart} to ${context.weekEnd}.

## Athlete
${context.athleteName ? `- Name: ${context.athleteName}` : ''}
${context.hrZones ? `- HR Zones: ${context.hrZones}` : ''}
${context.weight ? `- Weight: ${context.weight} kg` : ''}
${context.trainingBalance != null ? `- Training Balance: ${context.trainingBalance}/80 (20=run-focused, 80=gym-focused)` : ''}
${context.goal ? `- Goal: ${context.goal}` : ''}
${context.trainingBlockContext ? `\n## Training Block Context\nThis week is part of a periodized training block. Follow the volume target, intensity level, and key workouts specified below. These are the guardrails — you decide exact session placement, paces, and structure.\n${context.trainingBlockContext}\n` : ''}
## Recent Training (last 4 weeks)
${context.recentTraining}
${context.lastWeekReview ? `\n## Last Week Review\nBelow is a comparison of last week's planned sessions vs what the athlete actually did. Use this to inform progression, recovery needs, and session placement this week:\n${context.lastWeekReview}\n` : ''}
## Personal Records
${context.personalRecords}

## Injuries
${context.injuries || 'None reported'}
${context.preferences ? `\n## Athlete Preferences\nThe athlete has specified the following preferences for this week. You MUST respect these constraints:\n${context.preferences}\n` : ''}
## Instructions
- Produce exactly 7 sessions (Monday through Sunday) with ISO dates.
- Vary session types: include easy runs, one quality session (intervals or tempo), one long run, and appropriate rest days.
- For rest/strength days, use type "rest" or "strength" and describe what the day is for.
- Honor the training balance: lower values (closer to 20) = more running days; higher values (closer to 80) = fewer runs, more rest/strength days.
- Base pace targets on the athlete's personal records.
- If ACWR is high (>1.3) or volume has been increasing rapidly, include extra rest.
- If injuries are reported, avoid aggravating movements and reduce load.
- If a Last Week Review is provided, factor adherence into your plan: if sessions were missed, consider whether load should stay flat or catch up; if everything was hit, consider progressing; if the week was an intentional deload (check athlete preferences), plan a return to normal or increased load.
- If a Training Block Context is provided, your plan MUST respect the volume target and intensity level. Include the specified key workouts. The week type (build/recovery/taper/etc.) should guide overall session selection.
- Be specific with workout descriptions (e.g. "6x1000m at 4:15/km with 90s jog recovery").`;

export const buildPhysioPipelinePrompt = (context: {
  athleteName: string | null;
  weight: number | null;
  trainingBalance: number | null;
  weekStart: string;
  weekEnd: string;
  injuries: string;
  coachSessions: string;
  preferences: string | null;
}) => `You are a sports physiotherapist. Generate strength and mobility sessions to complement the running plan below for the week of ${context.weekStart} to ${context.weekEnd}.

## Athlete
${context.athleteName ? `- Name: ${context.athleteName}` : ''}
${context.weight ? `- Weight: ${context.weight} kg` : ''}
${context.trainingBalance != null ? `- Training Balance: ${context.trainingBalance}/80 (20=run-focused, 80=gym-focused)` : ''}

## Injuries
${context.injuries || 'None reported'}

## Coach Running Plan for This Week
${context.coachSessions}
${context.preferences ? `\n## Athlete Preferences\nThe athlete has specified the following preferences for this week. You MUST respect these constraints:\n${context.preferences}\n` : ''}
## Instructions
- For each day, prescribe the appropriate physio session type based on the running plan:
  - **Rest day**: Full strength session (30-45 min) — compound movements, core, hip stability.
  - **Easy/recovery run**: Light mobility (15-20 min) — dynamic stretches, foam rolling, hip openers.
  - **Before intervals/tempo**: Dynamic warm-up (10-15 min) — glute activation, leg swings, A-skips.
  - **After intervals/tempo**: Cooldown (10 min) — static stretching, foam rolling.
  - **Before long run**: Abbreviated warm-up (5-10 min).
  - **After long run**: Extended recovery (15-20 min) — full-body stretching, foam rolling, eccentric calf raises.
  - **Strength day**: Full program with sets, reps, tempo.
- Honor the training balance: higher values = fuller strength programs; lower values = minimal, injury-prevention focused.
- If injuries are reported, include targeted rehab exercises and avoid aggravating movements.
- Include specific exercises with sets, reps, and tempo cues.
- You may produce sessions for all 7 days, or skip days that truly need no physio work.
- Each session must include the matching date from the running plan.`;
