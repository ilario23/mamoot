import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';
import {getSystemPrompt, isValidPersona} from '@/lib/aiPrompts';
import {shareTrainingPlanSchema} from '@/lib/aiTools';
import {createRetrievalTools} from '@/lib/aiRetrievalTools';
import {db} from '@/db';
import {coachPlans, userSettings} from '@/db/schema';
import {eq, and} from 'drizzle-orm';
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

  // Fetch minimal always-on context (athlete name + HR zones) from Neon
  let athleteName: string | null = null;
  let hrZonesText: string | null = null;
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

  // Build tools — retrieval tools (all personas) + shareTrainingPlan (coach only)
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
                  await db
                    .update(coachPlans)
                    .set({isActive: false})
                    .where(
                      and(
                        eq(coachPlans.athleteId, athleteId),
                        eq(coachPlans.isActive, true),
                      ),
                    );

                  await db.insert(coachPlans).values({
                    id: planId,
                    athleteId,
                    title: plan.title,
                    summary: plan.summary ?? null,
                    goal: plan.goal ?? null,
                    durationWeeks: plan.durationWeeks ?? null,
                    sessions: plan.sessions,
                    content: plan.content,
                    isActive: true,
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

  const tools = {
    ...retrievalTools,
    ...shareTrainingPlan,
  };

  const result = streamText({
    model: getModel(clientModel),
    system,
    messages: await convertToModelMessages(processedMessages),
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
