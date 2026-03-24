/** Focused pipeline prompts for generating unified weekly plans. */

import type {CoachWeekOutput, CoachWeekSession} from './weeklyPlanSchema';

/** One-line-per-day snapshot of the current week for partial repair prompts. */
export const formatFrozenCoachWeekForRepair = (coach: CoachWeekOutput): string =>
  coach.sessions
    .map(
      (s) =>
        `- ${s.day} ${s.date}: type=${s.type}, ${s.plannedDistanceKm ?? 'n/a'}km, ${s.plannedDurationMin ?? 'n/a'}min — ${s.description}`,
    )
    .join('\n');

export const buildCoachDayRepairPrompt = (context: {
  weekStart: string;
  weekEnd: string;
  repairDates: string[];
  frozenWeekSummary: string;
  distributionFeedback: string;
  skeletonSummary: string;
  blockVolumeHint: string | null;
}) => `You are repairing a weekly running plan by regenerating ONLY specific days.

## Allowed repair dates (ISO)
You MUST output one full session per date below, and ONLY these dates:
${context.repairDates.join(', ')}

## Frozen week (all 7 days — copy unchanged days mentally; your JSON must only include the repair dates above)
${context.frozenWeekSummary}

## Week skeleton (preserve intent for repaired days)
${context.skeletonSummary}

## Distribution feedback to fix
${context.distributionFeedback}
${context.blockVolumeHint ? `\n${context.blockVolumeHint}\n` : ''}

## Rules
- Week window: ${context.weekStart} to ${context.weekEnd}.
- Each output session must use the same \`day\` and \`date\` as in the frozen week for that ISO date.
- For running days: include warmupSteps, mainSteps, cooldownSteps (each ≥1 step). For rest/strength: empty phase arrays.
- Align plannedDistanceKm / plannedDurationMin with phase steps; use structured repeat_block/composite steps when applicable.
- Fix the distribution issues without changing non-repair days (they are not in your output).
- If a repaired day was rest/strength, you may change type only if required to fix load spread; otherwise keep skeleton sessionType.
`;

export const buildWeekSkeletonPrompt = (context: {
  weekStart: string;
  weekEnd: string;
  recentTraining: string;
  goal: string | null;
  preferences: string | null;
  trainingBlockContext: string | null;
  optimizationPriorityLabel: string;
  strategyLabel: string;
  strategyDescription: string;
  riskPolicyBanner: string | null;
}) => `You are an expert running coach planning only weekly structure.

Generate exactly 7 days (Monday through Sunday) for ${context.weekStart} to ${context.weekEnd}.

## Strategy
- Strategy: ${context.strategyLabel}
- Strategy intent: ${context.strategyDescription}
- Priority: ${context.optimizationPriorityLabel}
${context.riskPolicyBanner ? `- Risk policy: ${context.riskPolicyBanner}` : ''}
${context.goal ? `- Goal: ${context.goal}` : ''}
${context.trainingBlockContext ? `\n## Training Block Context\n${context.trainingBlockContext}\n` : ''}

## Recent Training
${context.recentTraining}
${context.preferences ? `\n## Athlete Preferences\n${context.preferences}\n` : ''}

## Instructions
- Output only day-level structure; do not generate detailed warmup/main/cooldown workouts.
- For each day provide: sessionType, dayTargetKm, dayTargetMin, intensityTag, strengthSlotIntent, notes.
- Keep exactly 7 unique dates.
- Weekly distribution constraints:
  - hard run days usually 1-3.
  - avoid back-to-back hard run days.
  - include long run freshness (no hard lower-body strength right before long run).
  - easy/recovery load should dominate.
- If training block target exists, distribute dayTargetKm so weekly total is near target (within about ±6%).
- For rest/strength days, dayTargetKm can be null or 0.
- For non-rest running days, set positive dayTargetKm when possible.
`;

export const buildCoachPipelinePrompt = (context: {
  athleteName: string | null;
  hrZones: string | null;
  paceZones: string | null;
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
  strategyLabel: string;
  strategyDescription: string;
  optimizationPriorityLabel: string;
  metricsSummary: string | null;
}) => `You are an expert running coach. Generate a 7-day running plan for the week of ${context.weekStart} to ${context.weekEnd}.

## Athlete
${context.athleteName ? `- Name: ${context.athleteName}` : ''}
${context.hrZones ? `- HR Zones (6-zone model): ${context.hrZones}` : '- HR Zones model: Use a 6-zone heart-rate system (Z1, Z2, Z3, Z4, Z5, Z6).'}
${context.paceZones ? `- Pace Zones (secondary guidance): ${context.paceZones}` : '- Pace Zones: none configured; use HR-first guidance and omit pace when uncertain.'}
${context.weight ? `- Weight: ${context.weight} kg` : ''}
${context.trainingBalance != null ? `- Training Balance: ${context.trainingBalance}/80 (20=run-focused, 80=gym-focused)` : ''}
${context.goal ? `- Goal: ${context.goal}` : ''}
${context.metricsSummary ? `\n## Current Hybrid Metrics Snapshot\n${context.metricsSummary}` : ''}
## Strategy Constraints
- Strategy to follow: ${context.strategyLabel}
- Strategy intent: ${context.strategyDescription}
- Primary optimization priority: ${context.optimizationPriorityLabel}
${context.trainingBlockContext ? `\n## Training Block Context\nThis week is part of a periodized training block. The weekly **running** volume target below is mandatory, not approximate: your planned distances must add up to it (see Instructions).\n${context.trainingBlockContext}\n` : ''}
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
- Use HR zones (6-zone model: Z1-Z6) as the PRIMARY intensity target for run sessions.
- Include targetZone and targetZoneId for every run session; use targetPace only as secondary guidance when useful.
- Pace precedence rules:
  - HR zone is always primary.
  - If pace zones are marked manual, use them as pace guidance.
  - Else use auto-derived pace zones only when confidence is adequate.
  - If pace confidence is low or unavailable, omit targetPace and keep HR-only.
- For rest/strength days, use type "rest" or "strength" and describe what the day is for; set warmupSteps, mainSteps, and cooldownSteps to empty arrays [].
- For every **running** day (easy, intervals, tempo, long, recovery): fill warmupSteps, mainSteps, and cooldownSteps — each array must have at least one step. Quality sessions: progressive warmup (easy + drills/strides as needed), explicit main work (intervals, tempo, pyramid, fartlek as separate steps), then cooldown (easy jog + walk). Easy/recovery: keep all three phases but they can be short (e.g. 5–15 min build, steady aerobic block, 5 min walk). Phase steps must align with plannedDistanceKm, plannedDurationMin, and zone targets where applicable.
- Use structured step encoding whenever possible:
  - For repeated work like "6 x (30s sprint + 90s jog)", encode as one step with stepKind="repeat_block", repeatCount=6, and subSteps containing sprint + jog child steps (each child has subSteps=null; do not nest repeat blocks inside subSteps).
  - For multi-part blocks without repeats, use stepKind="composite" with subSteps (same single-level rule).
  - Keep label human-readable, but treat structured fields as canonical for machine-readability.
- The description field is a short narrative summary (1–3 sentences) that matches the phase steps.
- Honor the training balance: lower values (closer to 20) = more running days; higher values (closer to 80) = fewer runs, more rest/strength days.
- Coach owns strength slot allocation: intentionally create 1-3 explicit "strength" days across the week (typically on rest or low-run-load days).
- Use activity-type-aware sequencing: pair strength slots with easy/recovery/rest context; avoid placing them right before key run days whenever possible.
- DOMS-aware planning: if a **strength** day is immediately **before** intervals, tempo, long, threshold, or race, either (1) put easy/recovery/rest between, or (2) make that strength session explicitly **low-DOMS** in description/notes (use words like light, mobility, activation, primer, prehab, bodyweight; avoid heavy lower-body eccentric work). Heavy strength must not sit the day before those hard/long runs.
- Weekly distribution targets (deterministic scorer aligned):
  - Run days: usually 3-6/week.
  - Rest days: usually 1-3/week.
  - Hard run days (intervals/tempo/threshold/race): usually 1-3/week.
  - Avoid back-to-back hard run days.
  - Keep easy aerobic minutes dominant over moderate+hard combined.
  - Avoid overloading weekend share of run volume (do not stack most load only on Sat/Sun).
- Keep long-run freshness: avoid scheduling long runs within 24 hours after hard lower-body strength stress.
- Base pace targets on the athlete's personal records.
- If ACWR is high (>1.3) or volume has been increasing rapidly, include extra rest.
- If TSB is strongly negative (< -12), bias toward recovery/low-intensity placement.
- Keep weekly load ramp conservative when monotony or strain is elevated.
- If injuries are reported, avoid aggravating movements and reduce load.
- If climate constraints are mentioned in preferences/context (heat, humidity, wind, rain, altitude), adapt targets and structure (e.g., lower zone caps, shorter quality reps, safer timing, hydration emphasis).
- If a Last Week Review is provided, factor adherence into your plan: if sessions were missed, consider whether load should stay flat or catch up; if everything was hit, consider progressing; if the week was an intentional deload (check athlete preferences), plan a return to normal or increased load.
- If a Training Block Context is provided, your plan MUST respect the volume target and intensity level. Include the specified key workouts. The week type (build/recovery/taper/etc.) should guide overall session selection.
- If a Training Block Context includes a volume target (km): every running day (easy, intervals, tempo, long, recovery) MUST have a positive plannedDistanceKm, and the SUM of those distances for the week must fall within roughly ±6% of that target. Spread distance across the week (do not ignore the target or only reflect it in prose).
- Be specific with workout descriptions (e.g. "6x1000m at 4:15/km with 90s jog recovery") and mirror that detail in mainSteps rows (and warmup/cooldown as appropriate).`;

export const buildPhysioPipelinePrompt = (context: {
  athleteName: string | null;
  weight: number | null;
  trainingBalance: number | null;
  weekStart: string;
  weekEnd: string;
  injuries: string;
  coachSessions: string;
  preferences: string | null;
  optimizationPriorityLabel: string;
}) => `You are a sports physiotherapist. Generate strength and mobility sessions to complement the running plan below for the week of ${context.weekStart} to ${context.weekEnd}.

## Athlete
${context.athleteName ? `- Name: ${context.athleteName}` : ''}
${context.weight ? `- Weight: ${context.weight} kg` : ''}
${context.trainingBalance != null ? `- Training Balance: ${context.trainingBalance}/80 (20=run-focused, 80=gym-focused)` : ''}
- Optimization priority: ${context.optimizationPriorityLabel}

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
- Physio owns session filling: prioritize Coach-designated strength-capable windows first, and turn those into concrete strength prescriptions with exercises, sets, reps, and tempo.
- Use activity-type-aware loading:
  - If next day is intervals/tempo/long run, keep preceding strength low DOMS risk (lighter load, lower eccentric stress, shorter volume).
  - If next day is easy/recovery/rest, you may prescribe a fuller lower-body strength stimulus.
- DOMS-safe best practices:
  - Do NOT schedule heavy eccentric lower-body sessions on the day before long run or quality run days.
  - Prefer warm-up, cooldown, mobility, and tissue-prep work around quality run days.
  - If recent soreness/injury risk is implied, bias toward mobility, isometrics, and controlled tempo work over maximal loading.
- Distribution alignment with deterministic scorer:
  - Preserve coach hard-day spacing (no new back-to-back hard stress patterns).
  - Prefer physio prescriptions that support easy-day recovery when weekly hard density is already high.
  - If coach load is weekend-heavy, avoid adding extra high-fatigue physio load on Sat/Sun.
- Honor the training balance: higher values = fuller strength programs; lower values = minimal, injury-prevention focused.
- If injuries are reported, include targeted rehab exercises and avoid aggravating movements.
- Include specific exercises with sets, reps, and tempo cues.
- You may produce sessions for all 7 days, or skip days that truly need no physio work.
- Each session must include the matching date from the running plan.`;

/** Compact summary of sessions already generated earlier in the week (per-day coach mode). */
export const formatPriorCoachSessionsForCoach = (
  sessions: CoachWeekSession[],
): string =>
  sessions
    .map(
      (s) =>
        `- ${s.day} (${s.date}): type=${s.type}, ${
          s.plannedDistanceKm ?? 'n/a'
        }km — ${s.description.slice(0, 200)}`,
    )
    .join('\n');

export const buildCoachSingleDayContract = (context: {
  weekStart: string;
  weekEnd: string;
  targetDay: string;
  targetDate: string;
  skeletonDayLine: string;
  priorCoachSessionsSummary: string | null;
}) => `

## Single-day output mode (STRICT)
- Output JSON with exactly **one** session in \`sessions\` (array length 1).
- That session MUST use day="${context.targetDay}" and date="${context.targetDate}".
- Week window: ${context.weekStart} to ${context.weekEnd}.
- Follow this skeleton line for **this day only**:
${context.skeletonDayLine}
${
  context.priorCoachSessionsSummary
    ? `\n## Already planned earlier this week (stay coherent; do not contradict)\n${context.priorCoachSessionsSummary}\n`
    : ''
}
- Ignore any instruction above that says "exactly 7 sessions" or "Monday through Sunday" for output shape — here you output **only this calendar day**.
- For running days: warmupSteps, mainSteps, cooldownSteps each have ≥1 step. For rest/strength: use [] for all three phase arrays.
`;
