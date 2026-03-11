import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';
import {getSystemPrompt, isValidPersona} from '@/lib/aiPrompts';
import {
  suggestFollowUpsSchema,
  saveWeeklyPreferencesSchema,
  updateTrainingBlockSchema,
  startPlanningFlowSchema,
  setPlanningFieldSchema,
  getPlanningStateSchema,
  confirmPlanningStateSchema,
  executePlanningGenerationSchema,
  type PlanningFlowIntent,
  type SetPlanningFieldInput,
} from '@/lib/aiTools';
import {createRetrievalTools} from '@/lib/aiRetrievalTools';
import {db} from '@/db';
import {
  userSettings,
  trainingBlocks,
  aiPlanningState,
} from '@/db/schema';
import {eq, and, isNull, lt, sql} from 'drizzle-orm';
import type {WeekOutline} from '@/lib/cacheTypes';
import type {ResolvedMention} from '@/lib/mentionTypes';
import {chatRequestSchema} from '@/lib/aiRequestSchemas';
import {createTraceContext, logAiTrace, promptHash} from '@/lib/aiTrace';
import {createAiErrorPayload} from '@/lib/aiErrors';
import {
  buildReliabilityEnvelope,
  detectRedFlagInput,
} from '@/lib/aiReliabilityPolicy';
import {parseSseChunks, type AiProgressEvent} from '@/lib/aiProgress';
import {
  defaultWeeklyPlanRequirements,
  defaultWeeklyPlanEditRequirements,
  defaultTrainingBlockRequirements,
  summarizeWeeklyPlanRequirements,
  summarizeWeeklyPlanEditRequirements,
  summarizeTrainingBlockRequirements,
  type WeeklyPlanRequirements,
  type WeeklyPlanEditRequirements,
  type TrainingBlockRequirements,
} from '@/lib/coachIntake';
import {
  getCurrentMondayInTimeZone,
  getNextMondayInTimeZone,
} from '@/lib/weekTime';
import {
  sanitizeExplicitContext,
  isAdvisoryIntent,
  shouldRequireRetrieval,
  buildFallbackFollowUps,
  getMessageText,
} from '@/lib/chatChainPolicies';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

// ----- Allowed models (whitelist for client-selected models) -----

const ALLOWED_MODELS: Record<
  string,
  () => ReturnType<typeof openai | typeof anthropic>
> = {
  'gpt-4o-mini': () => openai('gpt-4o-mini'),
  'gpt-4o': () => openai('gpt-4o'),
  'gpt-4.1-mini': () => openai('gpt-4.1-mini'),
  'gpt-4.1': () => openai('gpt-4.1'),
  'gpt-4.1-nano': () => openai('gpt-4.1-nano'),
  'gpt-5-mini': () => openai('gpt-5-mini'),
  'gpt-5-nano': () => openai('gpt-5-nano'),
  'gpt-5.2': () => openai('gpt-5.2'),
  'gpt-5.3': () => openai('gpt-5.3'),
  'gpt-5.4': () => openai('gpt-5.4'),
  'claude-sonnet-4-5': () => anthropic('claude-sonnet-4-5'),
  'claude-haiku-3-5': () => anthropic('claude-3-5-haiku-latest'),
};

// ----- Provider / model selection -----

const getModel = (clientModel?: string) => {
  // If client selected a valid model, use it
  if (clientModel && ALLOWED_MODELS[clientModel]) {
    return ALLOWED_MODELS[clientModel]();
  }

  // Fall back to env config
  const provider = process.env.AI_PROVIDER ?? 'openai';
  const modelOverride = process.env.AI_MODEL;

  if (provider === 'anthropic') {
    return anthropic(modelOverride ?? 'claude-sonnet-4-5');
  }

  // Default: OpenAI
  return openai(modelOverride ?? 'gpt-4o-mini');
};

type PlanningState = {
  flow: PlanningFlowIntent;
  confirmed: boolean;
  weeklyPlan: WeeklyPlanRequirements;
  weeklyPlanEdit: WeeklyPlanEditRequirements;
  trainingBlock: TrainingBlockRequirements;
  sourcePlanId?: string;
  lastUpdatedAt: number;
};

const PLANNING_TTL_MS = 60 * 60 * 1000;

const isPlanningToolsEnabled = () =>
  process.env.AI_CHAT_PLANNING_TOOLS_ENABLED !== 'false';

const getPlanningSessionKey = (athleteId: number, sessionId: string) =>
  `${athleteId}:${sessionId}`;

const inferTargetWeekFromNotes = (
  notes: string | undefined,
  timeZone: string,
): 'current' | 'next' | null => {
  if (!notes?.trim()) return null;
  const normalized = notes.toLowerCase();
  const currentMonday = getCurrentMondayInTimeZone(timeZone);
  const nextMonday = getNextMondayInTimeZone(timeZone);

  const embeddedIso = normalized.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  if (embeddedIso === currentMonday) return 'current';
  if (embeddedIso === nextMonday) return 'next';
  if (normalized.includes('current week') || normalized.includes('this week')) {
    return 'current';
  }
  if (
    normalized.includes('start from current day') ||
    normalized.includes('start from today') ||
    normalized.includes('from current day') ||
    normalized.includes('from today')
  ) {
    return 'current';
  }
  if (normalized.includes('next week')) return 'next';
  return null;
};

const inferGenerationModeFromNotes = (
  notes: string | undefined,
): 'remaining_days' | 'full' | null => {
  if (!notes?.trim()) return null;
  const normalized = notes.toLowerCase();
  if (
    normalized.includes('start from current day') ||
    normalized.includes('start from today') ||
    normalized.includes('from current day') ||
    normalized.includes('from today') ||
    normalized.includes('remaining days')
  ) {
    return 'remaining_days';
  }
  if (
    normalized.includes('full week') ||
    normalized.includes('entire week')
  ) {
    return 'full';
  }
  return null;
};


const getMissingRequiredPlanningFields = (
  state: PlanningState,
): {field: string; prompt: string}[] => {
  if (state.flow === 'weekly_plan') {
    const missing: {field: string; prompt: string}[] = [];
    if (!state.weeklyPlan.focus.trim()) {
      missing.push({
        field: 'focus',
        prompt: 'What should this week optimize for?',
      });
    }
    return missing;
  }

  if (state.flow === 'weekly_plan_edit') {
    const missing: {field: string; prompt: string}[] = [];
    if (!state.sourcePlanId?.trim()) {
      missing.push({
        field: 'sourcePlanId',
        prompt: 'Which active weekly plan should I edit?',
      });
    }
    if (!state.weeklyPlanEdit.editGoal.trim()) {
      missing.push({
        field: 'editGoal',
        prompt: 'What is the primary goal for this edit?',
      });
    }
    if (!state.weeklyPlanEdit.constraints.trim()) {
      missing.push({
        field: 'constraints',
        prompt: 'What constraints must stay true?',
      });
    }
    return missing;
  }

  const missing: {field: string; prompt: string}[] = [];
  if (!state.trainingBlock.goalEvent.trim()) {
    missing.push({
      field: 'goalEvent',
      prompt: 'What is your goal event?',
    });
  }
  if (!state.trainingBlock.goalDate.trim()) {
    missing.push({
      field: 'goalDate',
      prompt: 'What is the goal event date (YYYY-MM-DD)?',
    });
  }
  return missing;
};

const summarizePlanningState = (state: PlanningState): string => {
  if (state.flow === 'weekly_plan') {
    return summarizeWeeklyPlanRequirements(state.weeklyPlan);
  }
  if (state.flow === 'weekly_plan_edit') {
    return summarizeWeeklyPlanEditRequirements(state.weeklyPlanEdit);
  }
  return summarizeTrainingBlockRequirements(state.trainingBlock);
};

const readWeeklyPlanStreamPayload = async (response: Response) => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('WEEKLY_PLAN_STREAM_MISSING');
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let donePayload: unknown = null;
  let latestProgressMessage = 'Generating weekly plan...';

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream: true});
    const parsed = parseSseChunks<AiProgressEvent>(buffer, '');
    buffer = parsed.remainder;
    for (const event of parsed.events) {
      if (event.type === 'progress') {
        latestProgressMessage = event.message;
      }
      if (event.type === 'error') {
        const code =
          (event.meta as {code?: string; status?: number} | undefined)?.code ??
          'weekly_plan_generation_failed';
        throw new Error(
          `WEEKLY_PLAN_STREAM_ERROR:${code}:${event.message ?? 'unknown'}`,
        );
      }
      if (event.type === 'done') {
        donePayload = event.payload;
        latestProgressMessage = event.message;
      }
    }
  }

  if (!donePayload && buffer.trim().length > 0) {
    const parsed = parseSseChunks<AiProgressEvent>(buffer, '\n\n');
    for (const event of parsed.events) {
      if (event.type === 'done') {
        donePayload = event.payload;
      }
      if (event.type === 'error') {
        throw new Error(`WEEKLY_PLAN_STREAM_ERROR:unknown:${event.message}`);
      }
    }
  }

  if (!donePayload) {
    throw new Error(`WEEKLY_PLAN_STREAM_DONE_MISSING:${latestProgressMessage}`);
  }

  return donePayload as Record<string, unknown>;
};

const cleanupExpiredPlanningState = async () => {
  const now = Date.now();
  await db
    .delete(aiPlanningState)
    .where(lt(aiPlanningState.expiresAt, now))
    .catch(() => {});
};

// ----- Route handler -----

export async function POST(req: Request) {
  const trace = createTraceContext('ai.chat', req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify(
        createAiErrorPayload('invalid_json_body', 'Invalid JSON body'),
      ),
      {
      status: 400,
      headers: {'Content-Type': 'application/json', 'x-trace-id': trace.traceId},
      },
    );
  }

  const parsedBody = chatRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return new Response(
      JSON.stringify(
        createAiErrorPayload('invalid_request_body', 'Invalid request body', {
          issues: parsedBody.error.issues.map((issue) => issue.message),
        }),
      ),
      {
        status: 400,
        headers: {'Content-Type': 'application/json', 'x-trace-id': trace.traceId},
      },
    );
  }

  const {
    messages,
    persona,
    memory,
    model: clientModel,
    athleteId,
    sessionId,
    allowUnknownAllergies = false,
    riskOverride = false,
    timeZone,
    explicitContext,
  }: {
    messages: UIMessage[];
    persona: string;
    memory?: string | null;
    model?: string;
    athleteId?: number | null;
    sessionId?: string | null;
    allowUnknownAllergies?: boolean;
    riskOverride?: boolean;
    timeZone?: string;
    explicitContext?: ResolvedMention[] | null;
  } = parsedBody.data as {
    messages: UIMessage[];
    persona: string;
    memory?: string | null;
    model?: string;
    athleteId?: number | null;
    sessionId?: string | null;
    allowUnknownAllergies?: boolean;
    riskOverride?: boolean;
    timeZone?: string;
    explicitContext?: ResolvedMention[] | null;
  };

  const clientMessages = messages.filter(
    (message) => message.role === 'user' || message.role === 'assistant',
  );
  const droppedSystemMessages = messages.length - clientMessages.length;
  const explicitContextBudget = sanitizeExplicitContext(explicitContext);
  const sanitizedExplicitContext = explicitContextBudget.context;

  await cleanupExpiredPlanningState();
  const planningSessionKey =
    athleteId && sessionId ? getPlanningSessionKey(athleteId, sessionId) : null;
  const resolvedTimeZone = timeZone?.trim() || 'UTC';

  const resolvedModel =
    clientModel && ALLOWED_MODELS[clientModel]
      ? clientModel
      : (process.env.AI_MODEL ?? 'gpt-4o-mini');

  logAiTrace(trace, 'request_received', {
    persona,
    model: resolvedModel,
    sessionId: sessionId ?? null,
    athleteId: athleteId ?? null,
    messageCount: clientMessages.length,
    timeZone: resolvedTimeZone,
    riskOverride,
    allowUnknownAllergies,
  });
  if (droppedSystemMessages > 0) {
    logAiTrace(trace, 'system_role_dropped', {
      persona,
      model: resolvedModel,
      athleteId: athleteId ?? null,
      sessionId: sessionId ?? null,
      droppedSystemMessages,
    });
  }
  if (explicitContextBudget.capped) {
    logAiTrace(trace, 'explicit_context_capped', {
      persona,
      model: resolvedModel,
      athleteId: athleteId ?? null,
      sessionId: sessionId ?? null,
      originalItems: explicitContextBudget.originalItems,
      finalItems: explicitContextBudget.finalItems,
      originalChars: explicitContextBudget.originalChars,
      finalChars: explicitContextBudget.finalChars,
    });
  }

  // --- AI Debug Logging ---
  console.log(`\n[AI] ========== New Chat Request ==========`);
  console.log(`[AI] Model: ${resolvedModel}`);
  console.log(`[AI] Persona: ${persona}`);
  console.log(`[AI] Session: ${sessionId ?? 'none'}`);
  console.log(`[AI] Athlete: ${athleteId ?? 'none'}`);
  console.log(`[AI] Messages in context: ${clientMessages?.length ?? 0}`);
  console.log(
    `[AI] Memory: ${memory ? 'yes (' + memory.length + ' chars)' : 'none'}`,
  );
  if (sanitizedExplicitContext?.length) {
    console.log(`[AI] Explicit context (@-mentions):`);
    for (const m of sanitizedExplicitContext) {
      console.log(
        `[AI]   - @${m.categoryId}: ${m.label} (${m.data.length} chars)`,
      );
    }
  } else {
    console.log(`[AI] Explicit context: none`);
  }

  // Validate persona
  if (!persona || !isValidPersona(persona)) {
    return new Response(
      JSON.stringify(
        createAiErrorPayload(
          'invalid_persona',
          'Invalid persona. Must be one of: coach, nutritionist, physio',
        ),
      ),
      {
        status: 400,
        headers: {'Content-Type': 'application/json', 'x-trace-id': trace.traceId},
      },
    );
  }

  // Validate messages
  if (
    !clientMessages ||
    !Array.isArray(clientMessages) ||
    clientMessages.length === 0
  ) {
    return new Response(
      JSON.stringify(
        createAiErrorPayload(
          'messages_required',
          'Messages array is required and must not be empty',
        ),
      ),
      {
        status: 400,
        headers: {'Content-Type': 'application/json', 'x-trace-id': trace.traceId},
      },
    );
  }

  // Fetch minimal always-on context (athlete name + HR zones + weight) from Neon
  let athleteName: string | null = null;
  let hrZonesText: string | null = null;
  let athleteWeight: number | null = null;
  let trainingBalance: number | null = null;
  let knownAllergies: string[] = [];
  if (athleteId) {
    try {
      const settingsRows = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.athleteId, athleteId));
      const s = settingsRows[0];
      if (s) {
        const zones = s.zones as Record<string, [number, number]>;
        hrZonesText = Object.entries(zones)
          .map(([key, [min, max]]) => `${key.toUpperCase()} ${min}-${max}`)
          .join(' | ');
        athleteWeight = s.weight ?? null;
        trainingBalance = s.trainingBalance ?? 50;
        knownAllergies = Array.isArray(s.allergies)
          ? (s.allergies as string[]).filter((value) => typeof value === 'string')
          : [];
      }
    } catch {
      // Non-blocking — proceed without minimal context
    }
  }

  if (persona === 'nutritionist' && athleteId) {
    if (knownAllergies.length === 0 && !allowUnknownAllergies) {
      return new Response(
        JSON.stringify(
          createAiErrorPayload(
            'allergy_confirmation_required',
            'Nutrition guidance is blocked until allergies are confirmed. Update dietary info or send allowUnknownAllergies=true to override explicitly.',
          ),
        ),
        {
          status: 412,
          headers: {'Content-Type': 'application/json', 'x-trace-id': trace.traceId},
        },
      );
    }
  }

  // Build system prompt with minimal context + memory
  const baseSystem = getSystemPrompt(
    persona,
    athleteName,
    hrZonesText,
    athleteWeight,
    trainingBalance,
    memory ?? null,
  );
  const reliabilityPolicy = `\n\n## Reliability Policy\n- For training-science or factual claims, cite concrete evidence from tool outputs or attached context.\n- If data is missing or uncertain, ask a clarifying question before giving specific prescriptions.\n- If the user asks for medical diagnosis, medication, or reports severe red-flag symptoms, refuse safely and recommend immediate professional care.\n- Keep critic loop bounded: produce one coherent answer; do not recurse endlessly.`;
  const system = `${baseSystem}${reliabilityPolicy}`;
  logAiTrace(trace, 'system_prompt_built', {
    promptHash: promptHash(system),
    memoryChars: memory?.length ?? 0,
  });

  // Strip client-side mention metadata (<!-- mentions:... -->) from all user messages
  // so the LLM never sees the raw HTML comment markers
  const mentionMetaRe = /^<!-- mentions:.*? -->\n/;
  let processedMessages = clientMessages.map((msg) => {
    if (msg.role !== 'user') return msg;
    const text =
      msg.parts
        ?.filter((p): p is {type: 'text'; text: string} => p.type === 'text')
        .map((p) => p.text)
        .join('') ?? '';
    if (!mentionMetaRe.test(text)) return msg;
    return {
      ...msg,
      parts: [{type: 'text' as const, text: text.replace(mentionMetaRe, '')}],
    };
  });

  // Inject explicit @-mention context into the last user message
  if (sanitizedExplicitContext && sanitizedExplicitContext.length > 0) {
    processedMessages = [...processedMessages];
    const lastIdx = processedMessages.length - 1;
    const lastMsg = processedMessages[lastIdx];

    if (lastMsg && lastMsg.role === 'user') {
      const contextBlock = sanitizedExplicitContext
        .map((m) => `### @${m.categoryId}: ${m.label}\n${m.data}`)
        .join('\n\n');

      // Extract existing text from parts (already stripped of mention metadata above)
      const existingText =
        lastMsg.parts
          ?.filter((p): p is {type: 'text'; text: string} => p.type === 'text')
          .map((p) => p.text)
          .join('') ?? '';

      const augmentedText = `[User attached context]\n${contextBlock}\n\n[Message]\n${existingText}`;

      processedMessages[lastIdx] = {
        ...lastMsg,
        parts: [{type: 'text' as const, text: augmentedText}],
      };
    }
  }

  const latestUserText = processedMessages
    .filter((message) => message.role === 'user')
    .map((message) => getMessageText(message))
    .at(-1) ?? '';
  const advisoryIntent = isAdvisoryIntent(latestUserText);
  const requiresRetrieval = shouldRequireRetrieval({
    persona,
    athleteId,
    advisoryIntent,
  });
  const reliability = buildReliabilityEnvelope({
    userText: latestUserText,
    hasGroundingData: Boolean(
      (sanitizedExplicitContext && sanitizedExplicitContext.length > 0) ||
        athleteId,
    ),
    citesNumbers: /\d/.test(latestUserText),
  });
  logAiTrace(trace, 'reliability_envelope', {
    persona,
    model: resolvedModel,
    athleteId: athleteId ?? null,
    sessionId: sessionId ?? null,
    confidence: reliability.confidence,
    citationRequired: reliability.citationRequired,
    refusalRequired: reliability.refusalRequired,
    rationale: reliability.rationale,
    advisoryIntent,
    requiresRetrieval,
  });
  if (detectRedFlagInput(latestUserText) || reliability.refusalRequired) {
    logAiTrace(trace, 'safety_refusal', {
      persona,
      model: resolvedModel,
      athleteId: athleteId ?? null,
      sessionId: sessionId ?? null,
      reason: reliability.rationale,
    });
    return new Response(
      `I can't safely provide diagnosis or emergency guidance in chat. Please stop training now and seek urgent medical care or contact local emergency services. I can help you prepare a short symptom summary for a clinician once you're safe.`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'x-trace-id': trace.traceId,
        },
      },
    );
  }

  // Build tools — retrieval tools (all personas) + follow-up suggestions
  const retrievalRequestCache = new Map<string, Promise<unknown>>();
  const allRetrievalTools = athleteId
    ? createRetrievalTools(athleteId, {
        requestCache: retrievalRequestCache,
        onCacheEvent: (event, key) => {
          logAiTrace(
            trace,
            event === 'hit' ? 'retrieval_cache_hit' : 'retrieval_cache_miss',
            {
              persona,
              model: resolvedModel,
              athleteId: athleteId ?? null,
              sessionId: sessionId ?? null,
              cacheKey: key,
            },
          );
        },
      })
    : null;
  const retrievalTools = allRetrievalTools ?? {};

  const suggestFollowUps = {
    suggestFollowUps: {
      description:
        'REQUIRED at the end of most responses. Suggest 2-3 short follow-up questions (max 8 words each) the athlete might ask next. These appear as clickable buttons in the UI. Do NOT write follow-up suggestions as text — always use this tool instead.',
      inputSchema: suggestFollowUpsSchema,
      execute: async (input: {suggestions: string[]}) => {
        return {suggestions: input.suggestions};
      },
    },
  };

  // Planning intake/execution is handled by the deterministic in-chat form UI.
  // Keep chat route focused on advisory assistance and retrieval-grounded answers.
  const canUsePlanningTools = false;

  const getState = async (): Promise<PlanningState | null> => {
    if (!planningSessionKey || !athleteId || !sessionId) return null;
    const rows = await db
      .select()
      .from(aiPlanningState)
      .where(eq(aiPlanningState.key, planningSessionKey))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.expiresAt < Date.now()) {
      await db
        .delete(aiPlanningState)
        .where(eq(aiPlanningState.key, planningSessionKey))
        .catch(() => {});
      return null;
    }
    return row.state as PlanningState;
  };

  const upsertState = async (next: PlanningState): Promise<PlanningState> => {
    if (!planningSessionKey || !athleteId || !sessionId) return next;
    const now = Date.now();
    const withTimestamp: PlanningState = {
      ...next,
      lastUpdatedAt: now,
    };
    await db
      .insert(aiPlanningState)
      .values({
        key: planningSessionKey,
        athleteId,
        sessionId,
        state: withTimestamp,
        expiresAt: now + PLANNING_TTL_MS,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: aiPlanningState.key,
        set: {
          state: sql`excluded.state`,
          expiresAt: sql`excluded.expires_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
    return withTimestamp;
  };

  const resolveState = async (
    requestedFlow?: PlanningFlowIntent,
  ): Promise<PlanningState | null> => {
    const state = await getState();
    if (!state) return null;
    if (!requestedFlow || requestedFlow === state.flow) return state;
    return {
      ...state,
      flow: requestedFlow,
      confirmed: false,
    };
  };

  const planningTools = canUsePlanningTools
    ? {
        startPlanningFlow: {
          description:
            'Start a structured planning flow in chat for weekly plan creation, weekly plan edits, or training block creation.',
          inputSchema: startPlanningFlowSchema,
          execute: async ({
            flow,
            reset,
          }: {
            flow: PlanningFlowIntent;
            reset: boolean;
          }) => {
            const existing = await getState();
            const shouldReset = reset || !existing;
            const next: PlanningState =
              shouldReset || !existing
                ? {
                    flow,
                    confirmed: false,
                    weeklyPlan:
                      flow === 'weekly_plan'
                        ? {
                            ...defaultWeeklyPlanRequirements(),
                            targetWeek: 'current',
                          }
                        : defaultWeeklyPlanRequirements(),
                    weeklyPlanEdit: defaultWeeklyPlanEditRequirements(),
                    trainingBlock: defaultTrainingBlockRequirements(),
                    sourcePlanId: undefined,
                    lastUpdatedAt: Date.now(),
                  }
                : {
                    ...existing,
                    flow,
                    confirmed: false,
                    lastUpdatedAt: Date.now(),
                  };
            const saved = await upsertState(next);
            return {
              ok: true,
              action: 'started',
              flow: saved.flow,
              confirmed: saved.confirmed,
              missing: getMissingRequiredPlanningFields(saved),
              summary: summarizePlanningState(saved),
              resumeToken: planningSessionKey,
            };
          },
        },
        setPlanningField: {
          description:
            'Set one or more structured planning fields for the active chat planning flow.',
          inputSchema: setPlanningFieldSchema,
          execute: async (input: SetPlanningFieldInput) => {
            const existing = (await resolveState(input.flow)) ?? {
              flow: input.flow,
              confirmed: false,
              weeklyPlan: defaultWeeklyPlanRequirements(),
              weeklyPlanEdit: defaultWeeklyPlanEditRequirements(),
              trainingBlock: defaultTrainingBlockRequirements(),
              sourcePlanId: undefined,
              lastUpdatedAt: Date.now(),
            };

            let updated: PlanningState = {
              ...existing,
              flow: input.flow,
              confirmed: false,
            };

            if (input.flow === 'weekly_plan') {
              const weeklyPatch = input.patch as Partial<WeeklyPlanRequirements>;
              const inferredTargetWeek =
                weeklyPatch.targetWeek ??
                inferTargetWeekFromNotes(weeklyPatch.notes, resolvedTimeZone);
              const inferredGenerationMode =
                weeklyPatch.generationMode ??
                inferGenerationModeFromNotes(weeklyPatch.notes);
              updated = {
                ...updated,
                weeklyPlan: {
                  ...updated.weeklyPlan,
                  ...input.patch,
                  ...(inferredTargetWeek
                    ? {targetWeek: inferredTargetWeek}
                    : {}),
                  ...(inferredGenerationMode
                    ? {generationMode: inferredGenerationMode}
                    : {}),
                },
              };
            } else if (input.flow === 'weekly_plan_edit') {
              const patch = input.patch as Partial<WeeklyPlanEditRequirements> & {
                sourcePlanId?: string;
              };
              updated = {
                ...updated,
                weeklyPlanEdit: {
                  ...updated.weeklyPlanEdit,
                  ...patch,
                },
                sourcePlanId:
                  patch.sourcePlanId?.trim() || updated.sourcePlanId || undefined,
              };
            } else {
              updated = {
                ...updated,
                trainingBlock: {
                  ...updated.trainingBlock,
                  ...input.patch,
                },
              };
            }

            const saved = await upsertState(updated);
            return {
              ok: true,
              action: 'updated',
              flow: saved.flow,
              confirmed: saved.confirmed,
              summary: summarizePlanningState(saved),
              missing: getMissingRequiredPlanningFields(saved),
              resumeToken: planningSessionKey,
            };
          },
        },
        getPlanningState: {
          description:
            'Return the current planning state summary, confirmation status, and missing fields.',
          inputSchema: getPlanningStateSchema,
          execute: async (input?: {flow?: PlanningFlowIntent}) => {
            const state = await resolveState(input?.flow);
            if (!state) {
              return {
                ok: false,
                error: 'No planning flow started yet. Call startPlanningFlow first.',
              };
            }
            const saved = await upsertState(state);
            return {
              ok: true,
              flow: saved.flow,
              confirmed: saved.confirmed,
              summary: summarizePlanningState(saved),
              missing: getMissingRequiredPlanningFields(saved),
              state: {
                weeklyPlan: saved.weeklyPlan,
                weeklyPlanEdit: saved.weeklyPlanEdit,
                trainingBlock: saved.trainingBlock,
                sourcePlanId: saved.sourcePlanId ?? null,
              },
              resumeToken: planningSessionKey,
            };
          },
        },
        confirmPlanningState: {
          description:
            'Confirm or unconfirm the current planning state before execution.',
          inputSchema: confirmPlanningStateSchema,
          execute: async ({
            flow,
            confirmed,
          }: {
            flow?: PlanningFlowIntent;
            confirmed: boolean;
          }) => {
            const state = await resolveState(flow);
            if (!state) {
              return {
                ok: false,
                error: 'No planning flow to confirm. Start one first.',
              };
            }
            const missing = getMissingRequiredPlanningFields(state);
            const nextConfirmed = confirmed && missing.length === 0;
            const saved = await upsertState({
              ...state,
              confirmed: nextConfirmed,
            });
            return {
              ok: true,
              flow: saved.flow,
              confirmed: saved.confirmed,
              summary: summarizePlanningState(saved),
              missing,
              warning:
                confirmed && missing.length > 0
                  ? 'Cannot confirm yet; required fields are still missing.'
                  : null,
              resumeToken: planningSessionKey,
            };
          },
        },
        executePlanningGeneration: {
          description:
            'Execute generation for the confirmed planning flow. This triggers weekly-plan or training-block APIs.',
          inputSchema: executePlanningGenerationSchema,
          execute: async ({
            flow,
            dryRun,
          }: {
            flow?: PlanningFlowIntent;
            dryRun: boolean;
          }) => {
            const state = await resolveState(flow);
            if (!state) {
              return {
                ok: false,
                error: 'No planning flow found. Start and fill one first.',
              };
            }
            const missing = getMissingRequiredPlanningFields(state);
            if (missing.length > 0) {
              return {
                ok: false,
                flow: state.flow,
                error: 'Planning state is incomplete.',
                missing,
                summary: summarizePlanningState(state),
              };
            }
            if (!state.confirmed) {
              return {
                ok: false,
                flow: state.flow,
                error: 'Planning state is not confirmed yet.',
                summary: summarizePlanningState(state),
              };
            }
            if (!athleteId || !sessionId) {
              return {
                ok: false,
                flow: state.flow,
                error: 'Missing athlete/session context to execute generation.',
              };
            }
            if (dryRun) {
              return {
                ok: true,
                flow: state.flow,
                dryRun: true,
                summary: summarizePlanningState(state),
              };
            }

            const baseUrl = new URL(req.url);

            try {
              if (state.flow === 'training_block') {
                const payload = {
                  athleteId,
                  goalEvent: state.trainingBlock.goalEvent,
                  goalDate: state.trainingBlock.goalDate,
                  requirements: summarizeTrainingBlockRequirements(
                    state.trainingBlock,
                  ),
                  totalWeeks: state.trainingBlock.totalWeeks,
                  model: clientModel,
                  strategySelectionMode:
                    state.trainingBlock.strategySelectionMode,
                  strategyPreset: state.trainingBlock.strategyPreset,
                  optimizationPriority:
                    state.trainingBlock.optimizationPriority,
                  riskOverride,
                  timeZone: resolvedTimeZone,
                };
                const response = await fetch(
                  new URL('/api/ai/training-block', baseUrl),
                  {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload),
                  },
                );

                if (!response.ok) {
                  let body: unknown = null;
                  try {
                    body = await response.json();
                  } catch {
                    body = null;
                  }
                  return {
                    ok: false,
                    flow: state.flow,
                    error: 'Training block generation failed.',
                    status: response.status,
                    details: body,
                  };
                }

                const data = (await response.json()) as Record<string, unknown>;
                const resetState = await upsertState({
                  ...state,
                  confirmed: false,
                });
                return {
                  ok: true,
                  flow: state.flow,
                  status: 'completed',
                  summary: summarizePlanningState(resetState),
                  result: {
                    id: data.id ?? null,
                    goalEvent: data.goalEvent ?? null,
                    goalDate: data.goalDate ?? null,
                    totalWeeks: data.totalWeeks ?? null,
                  },
                };
              }

              const weekStartDate =
                state.flow === 'weekly_plan'
                  ? state.weeklyPlan.targetWeek === 'current'
                    ? getCurrentMondayInTimeZone(resolvedTimeZone)
                    : getNextMondayInTimeZone(resolvedTimeZone)
                  : undefined;
              const weeklyPayload = {
                athleteId,
                model: clientModel,
                riskOverride,
                timeZone: resolvedTimeZone,
                weekStartDate,
                mode:
                  state.flow === 'weekly_plan'
                    ? state.weeklyPlan.generationMode
                    : state.weeklyPlanEdit.generationMode,
                preferences:
                  state.flow === 'weekly_plan'
                    ? summarizeWeeklyPlanRequirements(state.weeklyPlan)
                    : undefined,
                strategySelectionMode:
                  state.flow === 'weekly_plan'
                    ? state.weeklyPlan.strategySelectionMode
                    : state.weeklyPlanEdit.strategySelectionMode,
                strategyPreset:
                  state.flow === 'weekly_plan'
                    ? state.weeklyPlan.strategyPreset
                    : state.weeklyPlanEdit.strategyPreset,
                optimizationPriority:
                  state.flow === 'weekly_plan'
                    ? state.weeklyPlan.optimizationPriority
                    : state.weeklyPlanEdit.optimizationPriority,
                sourcePlanId:
                  state.flow === 'weekly_plan_edit'
                    ? state.sourcePlanId
                    : undefined,
                editSourcePlanId:
                  state.flow === 'weekly_plan_edit'
                    ? state.sourcePlanId
                    : undefined,
                editInstructions:
                  state.flow === 'weekly_plan_edit'
                    ? summarizeWeeklyPlanEditRequirements(state.weeklyPlanEdit)
                    : undefined,
              };

              const weeklyResponse = await fetch(
                new URL('/api/ai/weekly-plan', baseUrl),
                {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify(weeklyPayload),
                },
              );
              if (!weeklyResponse.ok) {
                let body: unknown = null;
                try {
                  body = await weeklyResponse.json();
                } catch {
                  body = null;
                }
                return {
                  ok: false,
                  flow: state.flow,
                  error: 'Weekly plan generation failed.',
                  status: weeklyResponse.status,
                  details: body,
                };
              }

              const donePayload = await readWeeklyPlanStreamPayload(
                weeklyResponse,
              );
              const resetState = await upsertState({
                ...state,
                confirmed: false,
              });
              return {
                ok: true,
                flow: state.flow,
                status: 'completed',
                summary: summarizePlanningState(resetState),
                result: {
                  id: donePayload.id ?? null,
                  title: donePayload.title ?? null,
                  weekStart: donePayload.weekStart ?? null,
                  sourcePlanId: donePayload.sourcePlanId ?? null,
                },
              };
            } catch (error) {
              return {
                ok: false,
                flow: state.flow,
                error: 'Execution bridge failed while generating.',
                details:
                  error instanceof Error ? error.message : 'unknown execution error',
              };
            }
          },
        },
      }
    : {};

  const coachOnlyTools =
    persona === 'coach' && athleteId
      ? {
          saveWeeklyPreferences: {
            description:
              "Save the athlete's preferences/constraints for their next weekly plan generation. Call this when the athlete mentions schedule constraints, unavailable days, focus areas, or special requests for their upcoming training week.",
            inputSchema: saveWeeklyPreferencesSchema,
            execute: async ({preferences}: {preferences: string}) => {
              await db
                .update(userSettings)
                .set({weeklyPreferences: preferences})
                .where(eq(userSettings.athleteId, athleteId));
              return {saved: true, preferences};
            },
          },
          updateTrainingBlock: {
            description:
              "Modify a specific week in the athlete's active training block. Use when the athlete wants to change a week's type (e.g. make it a recovery/off-load week), adjust volume, intensity, or key workouts. Always call getTrainingBlock first to see the current block before making changes.",
            inputSchema: updateTrainingBlockSchema,
            execute: async (input: {weekNumber: number; weekType?: string; volumeTargetKm?: number; intensityLevel?: string; keyWorkouts?: string[]; notes?: string}) => {
              const blocks = await db
                .select()
                .from(trainingBlocks)
                .where(
                  and(
                    eq(trainingBlocks.athleteId, athleteId),
                    eq(trainingBlocks.isActive, true),
                    isNull(trainingBlocks.deletedAt),
                  ),
                )
                .limit(1);

              const block = blocks[0];
              if (!block) {
                return {error: 'No active training block found.'};
              }

              const outlines = block.weekOutlines as WeekOutline[];
              const idx = outlines.findIndex((o) => o.weekNumber === input.weekNumber);
              if (idx === -1) {
                return {error: `Week ${input.weekNumber} not found in the training block.`};
              }

              const updated = {...outlines[idx]};
              if (input.weekType) updated.weekType = input.weekType as WeekOutline['weekType'];
              if (input.volumeTargetKm !== undefined) updated.volumeTargetKm = input.volumeTargetKm;
              if (input.intensityLevel) updated.intensityLevel = input.intensityLevel as WeekOutline['intensityLevel'];
              if (input.keyWorkouts) updated.keyWorkouts = input.keyWorkouts;
              if (input.notes !== undefined) updated.notes = input.notes;

              const newOutlines = [...outlines];
              newOutlines[idx] = updated;

              await db
                .update(trainingBlocks)
                .set({weekOutlines: newOutlines, updatedAt: Date.now()})
                .where(
                  and(
                    eq(trainingBlocks.id, block.id),
                    isNull(trainingBlocks.deletedAt),
                  ),
                );

              return {
                updated: true,
                weekNumber: input.weekNumber,
                summary: `Week ${input.weekNumber} updated: ${updated.weekType} | ${updated.volumeTargetKm}km | ${updated.intensityLevel} | workouts: ${updated.keyWorkouts.join(', ')}`,
              };
            },
          },
          ...planningTools,
        }
      : {};

  const tools = {
    ...retrievalTools,
    ...coachOnlyTools,
    ...suggestFollowUps,
  };

  const toolNames = Object.keys(tools);
  console.log(`[AI] Tools registered: [${toolNames.join(', ')}]`);
  logAiTrace(trace, 'tools_registered', {
    toolCount: toolNames.length,
    tools: toolNames,
  });

  const retrievalToolNames = new Set(Object.keys(retrievalTools));
  let sawRetrievalCall = false;
  let sawFollowUpsCall = false;
  let retrievalGuardrailViolated = false;
  let fallbackFollowUps: string[] | null = null;

  let result;
  const maxToolSteps = canUsePlanningTools ? 8 : 5;
  try {
    result = streamText({
      model: getModel(clientModel),
      system,
      messages: await convertToModelMessages(processedMessages),
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      stopWhen: stepCountIs(maxToolSteps),
      onStepFinish(event) {
        logAiTrace(trace, 'step_finished', {
          persona,
          model: resolvedModel,
          sessionId: sessionId ?? null,
          athleteId: athleteId ?? null,
          finishReason: event.finishReason,
          toolCalls: event.toolCalls?.length ?? 0,
          toolResults: event.toolResults?.length ?? 0,
          inputTokens: event.usage?.inputTokens ?? null,
          outputTokens: event.usage?.outputTokens ?? null,
        });
        console.log(`[AI] --- Step finished (reason: ${event.finishReason}) ---`);
        const calls = event.toolCalls;
        if (Array.isArray(calls) && calls.length > 0) {
          for (const tc of calls) {
            if (retrievalToolNames.has(tc.toolName)) {
              sawRetrievalCall = true;
            }
            if (tc.toolName === 'suggestFollowUps') {
              sawFollowUpsCall = true;
            }
            console.log(`[AI]   Tool call: ${tc.toolName}`);
            console.log(`[AI]     Args: ${JSON.stringify(tc.input)}`);
          }
        }
        const results = event.toolResults;
        if (Array.isArray(results) && results.length > 0) {
          for (const tr of results) {
            const resultStr = JSON.stringify(tr.output) ?? '(empty)';
            const preview =
              resultStr.length > 300
                ? resultStr.slice(0, 300) + '...'
                : resultStr;
            console.log(`[AI]   Tool result [${tr.toolName}]: ${preview}`);
          }
        }
        const txt = event.text ?? '';
        if (txt) {
          const preview = txt.length > 200 ? txt.slice(0, 200) + '...' : txt;
          console.log(`[AI]   Text: ${preview}`);
          if (requiresRetrieval && !sawRetrievalCall) {
            logAiTrace(trace, 'guardrail_violation', {
              type: 'retrieval_first_missing',
              persona,
              model: resolvedModel,
              athleteId: athleteId ?? null,
              sessionId: sessionId ?? null,
            });
            retrievalGuardrailViolated = true;
            throw new Error('GUARDRAIL_RETRIEVAL_REQUIRED_BEFORE_ANSWER');
          }
        }
        const u = event.usage;
        if (u) {
          console.log(
            `[AI]   Tokens: ${u.inputTokens ?? '?'} in / ${u.outputTokens ?? '?'} out`,
          );
        }
      },
      onFinish(event) {
        if (requiresRetrieval && !sawRetrievalCall) {
          logAiTrace(trace, 'guardrail_violation', {
            type: 'retrieval_first_missing_at_finish',
            persona,
            model: resolvedModel,
            athleteId: athleteId ?? null,
            sessionId: sessionId ?? null,
          });
          retrievalGuardrailViolated = true;
        }
        if (!sawFollowUpsCall) {
          fallbackFollowUps = buildFallbackFollowUps(persona);
          logAiTrace(trace, 'followups_fallback_used', {
            persona,
            model: resolvedModel,
            athleteId: athleteId ?? null,
            sessionId: sessionId ?? null,
            suggestions: fallbackFollowUps,
          });
        }
        if (retrievalGuardrailViolated) {
          logAiTrace(trace, 'guardrail_flagged', {
            type: 'retrieval_required_but_missing',
            persona,
            model: resolvedModel,
            athleteId: athleteId ?? null,
            sessionId: sessionId ?? null,
          });
        }
        logAiTrace(trace, 'request_finished', {
          persona,
          model: resolvedModel,
          sessionId: sessionId ?? null,
          athleteId: athleteId ?? null,
          finishReason: event.finishReason,
          steps: Array.isArray(event.steps) ? event.steps.length : null,
          inputTokens: event.usage?.inputTokens ?? null,
          outputTokens: event.usage?.outputTokens ?? null,
          advisoryIntent,
          requiresRetrieval,
          sawRetrievalCall,
          sawFollowUpsCall,
          retrievalGuardrailViolated,
          followUpsFallbackUsed: Boolean(fallbackFollowUps),
        });
        console.log(`[AI] ========== Request Complete ==========`);
        console.log(`[AI] Final reason: ${event.finishReason}`);
        console.log(
          `[AI] Total steps: ${Array.isArray(event.steps) ? event.steps.length : '?'}`,
        );
        const u = event.usage;
        if (u && typeof u === 'object') {
          console.log(
            `[AI] Total tokens: ${u.inputTokens ?? '?'} in / ${u.outputTokens ?? '?'} out`,
          );
        }
        console.log(`[AI] ========================================\n`);
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    if (message.startsWith('GUARDRAIL_')) {
      return new Response(
        JSON.stringify(
          createAiErrorPayload(
            'chat_guardrail_blocked',
            'Assistant response blocked by runtime guardrails. A repair retry is required.',
            {clarification: message},
          ),
        ),
        {
          status: 422,
          headers: {'Content-Type': 'application/json', 'x-trace-id': trace.traceId},
        },
      );
    }
    logAiTrace(trace, 'request_failed', {
      persona,
      model: resolvedModel,
      sessionId: sessionId ?? null,
      athleteId: athleteId ?? null,
      message,
    });
    return new Response(
      JSON.stringify(
        createAiErrorPayload(
          'generation_failed',
          'Failed to process chat request',
        ),
      ),
      {
      status: 500,
      headers: {'Content-Type': 'application/json', 'x-trace-id': trace.traceId},
      },
    );
  }

  return result.toUIMessageStreamResponse({
    headers: {
      'x-trace-id': trace.traceId,
    },
  });
}
