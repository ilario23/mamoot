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
} from '@/lib/aiTools';
import {createRetrievalTools} from '@/lib/aiRetrievalTools';
import {db} from '@/db';
import {userSettings, trainingBlocks} from '@/db/schema';
import {eq, and, isNull} from 'drizzle-orm';
import type {WeekOutline} from '@/lib/cacheTypes';
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

  // Build tools — retrieval tools (all personas) + follow-up suggestions
  const retrievalTools = athleteId ? createRetrievalTools(athleteId) : {};

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

  const tools = {
    ...retrievalTools,
    ...coachOnlyTools,
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
