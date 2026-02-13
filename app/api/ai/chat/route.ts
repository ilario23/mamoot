import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';
import {getSystemPrompt, isValidPersona} from '@/lib/aiPrompts';
import {shareTrainingPlanSchema, sharePhysioPlanSchema, suggestFollowUpsSchema} from '@/lib/aiTools';
import {createRetrievalTools} from '@/lib/aiRetrievalTools';
import {db} from '@/db';
import {coachPlans, physioPlans, userSettings} from '@/db/schema';
import {eq} from 'drizzle-orm';
import type {ResolvedMention} from '@/lib/mentionTypes';

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

// ----- Route handler -----

export async function POST(req: Request) {
  const body = await req.json();
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
  } = body;

  // --- AI Debug Logging ---
  const resolvedModel =
    clientModel && ALLOWED_MODELS[clientModel]
      ? clientModel
      : (process.env.AI_MODEL ?? 'gpt-4o-mini');
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
      JSON.stringify({
        error: 'Invalid persona. Must be one of: coach, nutritionist, physio',
      }),
      {status: 400, headers: {'Content-Type': 'application/json'}},
    );
  }

  // Validate messages
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({
        error: 'Messages array is required and must not be empty',
      }),
      {status: 400, headers: {'Content-Type': 'application/json'}},
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

  // Build tools — retrieval tools (all personas) + persona-specific sharing tools
  const retrievalTools = athleteId ? createRetrievalTools(athleteId) : {};
  const shareTrainingPlan =
    persona === 'coach'
      ? {
          shareTrainingPlan: {
            description:
              'Share a structured training plan with the athlete and the rest of the coaching team (Nutritionist, Physio). Call this tool whenever you create or update a training plan.',
            inputSchema: shareTrainingPlanSchema,
            execute: async (plan: {
              title: string;
              summary?: string;
              goal?: string;
              durationWeeks?: number;
              sessions: Array<{
                day: string;
                date?: string;
                type: string;
                description: string;
                duration?: string;
                targetPace?: string;
                targetZone?: string;
                notes?: string;
              }>;
              content: string;
            }) => {
              const planId = crypto.randomUUID();
              const now = Date.now();

              if (athleteId) {
                try {
                  // Save as inactive — the user must explicitly activate
                  await db.insert(coachPlans).values({
                    id: planId,
                    athleteId,
                    title: plan.title,
                    summary: plan.summary ?? null,
                    goal: plan.goal ?? null,
                    durationWeeks: plan.durationWeeks ?? null,
                    sessions: plan.sessions,
                    content: plan.content,
                    isActive: false,
                    sourceMessageId: null,
                    sourceSessionId: sessionId ?? null,
                    sharedAt: now,
                  });
                } catch (error) {
                  console.error(
                    '[shareTrainingPlan] Failed to save plan:',
                    error,
                  );
                }
              }

              return {planId, title: plan.title, sharedAt: now};
            },
          },
        }
      : {};

  const sharePhysioPlan =
    persona === 'physio'
      ? {
          sharePhysioPlan: {
            description:
              'Share a structured strength/mobility plan with the athlete and the rest of the coaching team (Coach, Nutritionist). Call this tool whenever you create or update a strength, mobility, or rehab program.',
            inputSchema: sharePhysioPlanSchema,
            execute: async (plan: {
              title: string;
              summary?: string;
              phase?: string;
              strengthSessionsPerWeek?: number;
              sessions: Array<{
                day: string;
                date?: string;
                type: string;
                exercises: Array<{
                  name: string;
                  sets?: string;
                  reps?: string;
                  tempo?: string;
                  notes?: string;
                }>;
                duration?: string;
                notes?: string;
              }>;
              content: string;
            }) => {
              const planId = crypto.randomUUID();
              const now = Date.now();

              if (athleteId) {
                try {
                  await db.insert(physioPlans).values({
                    id: planId,
                    athleteId,
                    title: plan.title,
                    summary: plan.summary ?? null,
                    phase: plan.phase ?? null,
                    strengthSessionsPerWeek: plan.strengthSessionsPerWeek ?? null,
                    sessions: plan.sessions,
                    content: plan.content,
                    isActive: false,
                    sourceSessionId: sessionId ?? null,
                    sharedAt: now,
                  });
                } catch (error) {
                  console.error(
                    '[sharePhysioPlan] Failed to save plan:',
                    error,
                  );
                }
              }

              return {planId, title: plan.title, sharedAt: now};
            },
          },
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

  const tools = {
    ...retrievalTools,
    ...shareTrainingPlan,
    ...sharePhysioPlan,
    ...suggestFollowUps,
  };

  const toolNames = Object.keys(tools);
  console.log(`[AI] Tools registered: [${toolNames.join(', ')}]`);

  const result = streamText({
    model: getModel(clientModel),
    system,
    messages: await convertToModelMessages(processedMessages),
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    stopWhen: stepCountIs(5),
    onStepFinish(event) {
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

  return result.toUIMessageStreamResponse();
}
