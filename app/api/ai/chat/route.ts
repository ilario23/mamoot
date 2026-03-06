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
  requestTrainingFeedbackSchema,
  saveTrainingFeedbackSchema,
  getTrainingFeedbackSchema,
  updateTrainingBlockSchema,
  orchestratorGoalSchema,
  orchestratorGoalUpdateSchema,
  orchestratorPlanItemSchema,
  orchestratorPlanItemUpdateSchema,
  orchestratorBlockerSchema,
  orchestratorBlockerUpdateSchema,
  orchestratorHandoffSchema,
  orchestratorHandoffUpdateSchema,
} from '@/lib/aiTools';
import {createRetrievalTools} from '@/lib/aiRetrievalTools';
import {db} from '@/db';
import {
  userSettings,
  trainingFeedback,
  trainingBlocks,
  orchestratorGoals,
  orchestratorPlanItems,
  orchestratorBlockers,
  orchestratorHandoffs,
} from '@/db/schema';
import {eq, and, isNull, desc} from 'drizzle-orm';
import type {WeekOutline} from '@/lib/cacheTypes';
import type {ResolvedMention} from '@/lib/mentionTypes';
import {chatRequestSchema} from '@/lib/aiRequestSchemas';
import {createTraceContext, logAiTrace, promptHash} from '@/lib/aiTrace';
import {createAiErrorPayload} from '@/lib/aiErrors';

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
  'claude-sonnet-4-5': () => anthropic('claude-sonnet-4-5'),
  'claude-haiku-3-5': () => anthropic('claude-3-5-haiku-latest'),
};

const ORCHESTRATOR_ENABLED =
  (process.env.AI_ORCHESTRATOR_ENABLED ?? 'true').toLowerCase() !== 'false';

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

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

const getCurrentMondayIso = (): string => {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysSinceMonday);
  return toIsoDate(monday);
};

const getPreviousMondayIso = (): string => {
  const currentMonday = new Date(getCurrentMondayIso());
  currentMonday.setDate(currentMonday.getDate() - 7);
  return toIsoDate(currentMonday);
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
    explicitContext,
  }: {
    messages: UIMessage[];
    persona: string;
    memory?: string | null;
    model?: string;
    athleteId?: number | null;
    sessionId?: string | null;
    explicitContext?: ResolvedMention[] | null;
  } = parsedBody.data as {
    messages: UIMessage[];
    persona: string;
    memory?: string | null;
    model?: string;
    athleteId?: number | null;
    sessionId?: string | null;
    explicitContext?: ResolvedMention[] | null;
  };

  const resolvedModel =
    clientModel && ALLOWED_MODELS[clientModel]
      ? clientModel
      : (process.env.AI_MODEL ?? 'gpt-4o-mini');

  logAiTrace(trace, 'request_received', {
    persona,
    model: resolvedModel,
    sessionId: sessionId ?? null,
    athleteId: athleteId ?? null,
    messageCount: messages.length,
  });

  // --- AI Debug Logging ---
  console.log(`\n[AI] ========== New Chat Request ==========`);
  console.log(`[AI] Model: ${resolvedModel}`);
  console.log(`[AI] Persona: ${persona}`);
  console.log(`[AI] Session: ${sessionId ?? 'none'}`);
  console.log(`[AI] Athlete: ${athleteId ?? 'none'}`);
  console.log(`[AI] Messages in context: ${messages?.length ?? 0}`);
  console.log(
    `[AI] Memory: ${memory ? 'yes (' + memory.length + ' chars)' : 'none'}`,
  );
  if (explicitContext?.length) {
    console.log(`[AI] Explicit context (@-mentions):`);
    for (const m of explicitContext) {
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
          'Invalid persona. Must be one of: coach, nutritionist, physio, orchestrator',
        ),
      ),
      {
        status: 400,
        headers: {'Content-Type': 'application/json', 'x-trace-id': trace.traceId},
      },
    );
  }

  if (persona === 'orchestrator' && !ORCHESTRATOR_ENABLED) {
    return new Response(
      JSON.stringify(
        createAiErrorPayload(
          'orchestrator_disabled',
          'Orchestrator chat is currently disabled. Ask an admin to enable AI_ORCHESTRATOR_ENABLED.',
        ),
      ),
      {
        status: 503,
        headers: {'Content-Type': 'application/json', 'x-trace-id': trace.traceId},
      },
    );
  }

  // Validate messages
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
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

  if (persona === 'orchestrator' && (!athleteId || !sessionId)) {
    return new Response(
      JSON.stringify(
        createAiErrorPayload(
          'orchestrator_context_required',
          'Orchestrator requires athleteId and sessionId to coordinate goals, blockers, and handoffs.',
          {
            clarification:
              'Open an orchestrator conversation from AI Team and try again.',
          },
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
      }
    } catch {
      // Non-blocking — proceed without minimal context
    }
  }

  // Build system prompt with minimal context + memory
  const system = getSystemPrompt(
    persona,
    athleteName,
    hrZonesText,
    athleteWeight,
    trainingBalance,
    memory ?? null,
  );
  logAiTrace(trace, 'system_prompt_built', {
    promptHash: promptHash(system),
    memoryChars: memory?.length ?? 0,
  });

  // Strip client-side mention metadata (<!-- mentions:... -->) from all user messages
  // so the LLM never sees the raw HTML comment markers
  const mentionMetaRe = /^<!-- mentions:.*? -->\n/;
  let processedMessages = messages.map((msg) => {
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
  if (explicitContext && explicitContext.length > 0) {
    processedMessages = [...processedMessages];
    const lastIdx = processedMessages.length - 1;
    const lastMsg = processedMessages[lastIdx];

    if (lastMsg && lastMsg.role === 'user') {
      const contextBlock = explicitContext
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

  // Build tools — retrieval tools (all personas) + follow-up suggestions
  const allRetrievalTools = athleteId ? createRetrievalTools(athleteId) : null;
  const retrievalTools = allRetrievalTools ?? {};
  const orchestratorRetrievalTools =
    allRetrievalTools && persona === 'orchestrator'
      ? {
          getTrainingGoal: allRetrievalTools.getTrainingGoal,
          getInjuries: allRetrievalTools.getInjuries,
          getWeeklyPlan: allRetrievalTools.getWeeklyPlan,
          getTrainingBlock: allRetrievalTools.getTrainingBlock,
        }
      : {};

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
          requestTrainingFeedback: {
            description:
              'Ask the athlete for end-of-week training reflection using a structured checklist (adherence, effort, fatigue, soreness, mood, confidence, notes). Use when feedback is missing after a training week.',
            inputSchema: requestTrainingFeedbackSchema,
            execute: async (input: {weekStart?: string; prompt?: string}) => {
              const weekStart = input.weekStart ?? getPreviousMondayIso();
              return {
                requested: true,
                weekStart,
                prompt:
                  input.prompt ??
                  'How did last week of training go and feel overall?',
                questions: [
                  {key: 'adherence', label: 'How closely did you follow the plan? (1-5)'},
                  {key: 'effort', label: 'How hard did the week feel? (1-5)'},
                  {key: 'fatigue', label: 'How fatigued do you feel now? (1-5)'},
                  {key: 'soreness', label: 'How sore are you now? (1-5)'},
                  {key: 'mood', label: 'How is your mood/readiness? (1-5)'},
                  {key: 'confidence', label: 'How confident do you feel? (1-5)'},
                  {key: 'notes', label: 'Any notes about how training felt? (optional)'},
                ],
              };
            },
          },
          saveTrainingFeedback: {
            description:
              'Persist athlete end-of-week training reflection scores and optional notes.',
            inputSchema: saveTrainingFeedbackSchema,
            execute: async (input: {
              weekStart: string;
              adherence: number;
              effort: number;
              fatigue: number;
              soreness: number;
              mood: number;
              confidence: number;
              notes?: string;
            }) => {
              const now = Date.now();
              const id = `${athleteId}:${input.weekStart}`;
              await db
                .insert(trainingFeedback)
                .values({
                  id,
                  athleteId,
                  weekStart: input.weekStart,
                  adherence: input.adherence,
                  effort: input.effort,
                  fatigue: input.fatigue,
                  soreness: input.soreness,
                  mood: input.mood,
                  confidence: input.confidence,
                  notes: input.notes ?? null,
                  source: 'coach_chat',
                  createdAt: now,
                  updatedAt: now,
                })
                .onConflictDoUpdate({
                  target: trainingFeedback.id,
                  set: {
                    adherence: input.adherence,
                    effort: input.effort,
                    fatigue: input.fatigue,
                    soreness: input.soreness,
                    mood: input.mood,
                    confidence: input.confidence,
                    notes: input.notes ?? null,
                    source: 'coach_chat',
                    updatedAt: now,
                  },
                });
              return {saved: true, weekStart: input.weekStart};
            },
          },
          getTrainingFeedback: {
            description:
              'Retrieve latest athlete training reflection feedback, optionally for a specific week.',
            inputSchema: getTrainingFeedbackSchema,
            execute: async (input: {weekStart?: string; limit?: number}) => {
              const rows = await db
                .select()
                .from(trainingFeedback)
                .where(
                  and(
                    eq(trainingFeedback.athleteId, athleteId),
                    ...(input.weekStart
                      ? [eq(trainingFeedback.weekStart, input.weekStart)]
                      : []),
                  ),
                )
                .orderBy(desc(trainingFeedback.weekStart))
                .limit(input.weekStart ? 1 : (input.limit ?? 4));

              if (rows.length === 0) {
                return {feedback: 'No training feedback found for this athlete.'};
              }

              return {
                feedback: rows.map((row) => ({
                  weekStart: row.weekStart,
                  adherence: row.adherence,
                  effort: row.effort,
                  fatigue: row.fatigue,
                  soreness: row.soreness,
                  mood: row.mood,
                  confidence: row.confidence,
                  notes: row.notes,
                  source: row.source,
                  updatedAt: row.updatedAt,
                })),
              };
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
        }
      : {};

  const orchestratorTools =
    persona === 'orchestrator'
      ? {
          createOrchestratorGoal: {
            description:
              'Create a high-level goal tracked in the orchestrator board.',
            inputSchema: orchestratorGoalSchema,
            execute: async (input: {
              title: string;
              detail?: string;
              status?: 'active' | 'on_hold' | 'done';
            }) => {
              if (!athleteId || !sessionId) {
                return {saved: false, error: 'athleteId and sessionId required'};
              }
              const now = Date.now();
              const record = {
                id: crypto.randomUUID(),
                athleteId,
                sessionId,
                title: input.title,
                detail: input.detail ?? null,
                status: input.status ?? 'active',
                createdAt: now,
                updatedAt: now,
              };
              await db.insert(orchestratorGoals).values(record);
              return {saved: true, goal: record};
            },
          },
          updateOrchestratorGoal: {
            description: 'Update an existing orchestrator goal.',
            inputSchema: orchestratorGoalUpdateSchema,
            execute: async (input: {
              id: string;
              title?: string;
              detail?: string;
              status?: 'active' | 'on_hold' | 'done';
            }) => {
              await db
                .update(orchestratorGoals)
                .set({
                  ...(input.title !== undefined ? {title: input.title} : {}),
                  ...(input.detail !== undefined ? {detail: input.detail} : {}),
                  ...(input.status !== undefined ? {status: input.status} : {}),
                  updatedAt: Date.now(),
                })
                .where(eq(orchestratorGoals.id, input.id));
              return {updated: true, id: input.id};
            },
          },
          createOrchestratorPlanItem: {
            description:
              'Create a concrete execution item for the not-done queue.',
            inputSchema: orchestratorPlanItemSchema,
            execute: async (input: {
              title: string;
              detail?: string;
              status?: 'todo' | 'in_progress' | 'blocked' | 'done';
              ownerPersona?: 'coach' | 'nutritionist' | 'physio';
              dueDate?: string;
            }) => {
              if (!athleteId || !sessionId) {
                return {saved: false, error: 'athleteId and sessionId required'};
              }
              const now = Date.now();
              const record = {
                id: crypto.randomUUID(),
                athleteId,
                sessionId,
                title: input.title,
                detail: input.detail ?? null,
                status: input.status ?? 'todo',
                ownerPersona: input.ownerPersona ?? null,
                dueDate: input.dueDate ?? null,
                createdAt: now,
                updatedAt: now,
              };
              await db.insert(orchestratorPlanItems).values(record);
              return {saved: true, planItem: record};
            },
          },
          updateOrchestratorPlanItem: {
            description: 'Update an existing plan item in the orchestrator queue.',
            inputSchema: orchestratorPlanItemUpdateSchema,
            execute: async (input: {
              id: string;
              title?: string;
              detail?: string;
              status?: 'todo' | 'in_progress' | 'blocked' | 'done';
              ownerPersona?: 'coach' | 'nutritionist' | 'physio';
              dueDate?: string;
            }) => {
              await db
                .update(orchestratorPlanItems)
                .set({
                  ...(input.title !== undefined ? {title: input.title} : {}),
                  ...(input.detail !== undefined ? {detail: input.detail} : {}),
                  ...(input.status !== undefined ? {status: input.status} : {}),
                  ...(input.ownerPersona !== undefined
                    ? {ownerPersona: input.ownerPersona}
                    : {}),
                  ...(input.dueDate !== undefined ? {dueDate: input.dueDate} : {}),
                  updatedAt: Date.now(),
                })
                .where(eq(orchestratorPlanItems.id, input.id));
              return {updated: true, id: input.id};
            },
          },
          createOrchestratorBlocker: {
            description: 'Create a blocker item that prevents plan completion.',
            inputSchema: orchestratorBlockerSchema,
            execute: async (input: {
              title: string;
              detail?: string;
              linkedPlanItemId?: string;
              status?: 'open' | 'resolved';
            }) => {
              if (!athleteId || !sessionId) {
                return {saved: false, error: 'athleteId and sessionId required'};
              }
              const now = Date.now();
              const record = {
                id: crypto.randomUUID(),
                athleteId,
                sessionId,
                title: input.title,
                detail: input.detail ?? null,
                status: input.status ?? 'open',
                linkedPlanItemId: input.linkedPlanItemId ?? null,
                createdAt: now,
                updatedAt: now,
              };
              await db.insert(orchestratorBlockers).values(record);
              return {saved: true, blocker: record};
            },
          },
          updateOrchestratorBlocker: {
            description: 'Update an existing blocker.',
            inputSchema: orchestratorBlockerUpdateSchema,
            execute: async (input: {
              id: string;
              title?: string;
              detail?: string;
              linkedPlanItemId?: string;
              status?: 'open' | 'resolved';
            }) => {
              await db
                .update(orchestratorBlockers)
                .set({
                  ...(input.title !== undefined ? {title: input.title} : {}),
                  ...(input.detail !== undefined ? {detail: input.detail} : {}),
                  ...(input.status !== undefined ? {status: input.status} : {}),
                  ...(input.linkedPlanItemId !== undefined
                    ? {linkedPlanItemId: input.linkedPlanItemId}
                    : {}),
                  updatedAt: Date.now(),
                })
                .where(eq(orchestratorBlockers.id, input.id));
              return {updated: true, id: input.id};
            },
          },
          createOrchestratorHandoff: {
            description:
              'Create a handoff task for coach, nutritionist, or physio execution.',
            inputSchema: orchestratorHandoffSchema,
            execute: async (input: {
              targetPersona: 'coach' | 'nutritionist' | 'physio';
              title: string;
              detail?: string;
              status?: 'pending' | 'accepted' | 'done' | 'cancelled';
            }) => {
              if (!athleteId || !sessionId) {
                return {saved: false, error: 'athleteId and sessionId required'};
              }
              const now = Date.now();
              const record = {
                id: crypto.randomUUID(),
                athleteId,
                sessionId,
                targetPersona: input.targetPersona,
                title: input.title,
                detail: input.detail ?? null,
                status: input.status ?? 'pending',
                createdAt: now,
                updatedAt: now,
              };
              await db.insert(orchestratorHandoffs).values(record);
              return {saved: true, handoff: record};
            },
          },
          updateOrchestratorHandoff: {
            description: 'Update the state of an existing handoff.',
            inputSchema: orchestratorHandoffUpdateSchema,
            execute: async (input: {
              id: string;
              targetPersona?: 'coach' | 'nutritionist' | 'physio';
              title?: string;
              detail?: string;
              status?: 'pending' | 'accepted' | 'done' | 'cancelled';
            }) => {
              await db
                .update(orchestratorHandoffs)
                .set({
                  ...(input.targetPersona !== undefined
                    ? {targetPersona: input.targetPersona}
                    : {}),
                  ...(input.title !== undefined ? {title: input.title} : {}),
                  ...(input.detail !== undefined ? {detail: input.detail} : {}),
                  ...(input.status !== undefined ? {status: input.status} : {}),
                  updatedAt: Date.now(),
                })
                .where(eq(orchestratorHandoffs.id, input.id));
              return {updated: true, id: input.id};
            },
          },
        }
      : {};

  const tools = {
    ...(persona === 'orchestrator' ? orchestratorRetrievalTools : retrievalTools),
    ...coachOnlyTools,
    ...orchestratorTools,
    ...suggestFollowUps,
  };

  const toolNames = Object.keys(tools);
  console.log(`[AI] Tools registered: [${toolNames.join(', ')}]`);
  logAiTrace(trace, 'tools_registered', {
    toolCount: toolNames.length,
    tools: toolNames,
  });

  let result;
  try {
    result = streamText({
      model: getModel(clientModel),
      system,
      messages: await convertToModelMessages(processedMessages),
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      stopWhen: stepCountIs(5),
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
        }
        const u = event.usage;
        if (u) {
          console.log(
            `[AI]   Tokens: ${u.inputTokens ?? '?'} in / ${u.outputTokens ?? '?'} out`,
          );
        }
      },
      onFinish(event) {
        logAiTrace(trace, 'request_finished', {
          persona,
          model: resolvedModel,
          sessionId: sessionId ?? null,
          athleteId: athleteId ?? null,
          finishReason: event.finishReason,
          steps: Array.isArray(event.steps) ? event.steps.length : null,
          inputTokens: event.usage?.inputTokens ?? null,
          outputTokens: event.usage?.outputTokens ?? null,
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
    logAiTrace(trace, 'request_failed', {
      persona,
      model: resolvedModel,
      sessionId: sessionId ?? null,
      athleteId: athleteId ?? null,
      message: error instanceof Error ? error.message : 'unknown error',
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
