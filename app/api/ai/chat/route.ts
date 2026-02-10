import {streamText, convertToModelMessages, type UIMessage} from 'ai';
import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';
import {getSystemPrompt, isValidPersona} from '@/lib/aiPrompts';
import {shareTrainingPlanSchema} from '@/lib/aiTools';
import {db} from '@/db';
import {coachPlans} from '@/db/schema';
import {eq, and} from 'drizzle-orm';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

// ----- Allowed models (whitelist for client-selected models) -----

const ALLOWED_MODELS: Record<string, () => ReturnType<typeof openai | typeof anthropic>> = {
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
    athleteContext,
    coachPlan,
    memory,
    model: clientModel,
    athleteId,
    sessionId,
  }: {
    messages: UIMessage[];
    persona: string;
    athleteContext: string | null;
    coachPlan?: string | null;
    memory?: string | null;
    model?: string;
    athleteId?: number | null;
    sessionId?: string | null;
  } = body;

  // Validate persona
  if (!persona || !isValidPersona(persona)) {
    return new Response(
      JSON.stringify({error: 'Invalid persona. Must be one of: coach, nutritionist, physio'}),
      {status: 400, headers: {'Content-Type': 'application/json'}},
    );
  }

  // Validate messages
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({error: 'Messages array is required and must not be empty'}),
      {status: 400, headers: {'Content-Type': 'application/json'}},
    );
  }

  // Build system prompt with athlete context, coach plan, and conversation memory
  const system = getSystemPrompt(persona, athleteContext ?? null, coachPlan ?? null, memory ?? null);

  // Build tools — Coach persona gets the shareTrainingPlan tool
  const tools = persona === 'coach'
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

            // If we know the athlete, persist to Neon
            if (athleteId) {
              try {
                // Deactivate previous active plans for this athlete
                await db
                  .update(coachPlans)
                  .set({isActive: false})
                  .where(
                    and(
                      eq(coachPlans.athleteId, athleteId),
                      eq(coachPlans.isActive, true),
                    ),
                  );

                // Insert the new plan
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
                console.error('[shareTrainingPlan] Failed to save plan:', error);
                // Non-blocking — the client will also save to Dexie
              }
            }

            return {planId, title: plan.title, sharedAt: now};
          },
        },
      }
    : undefined;

  const result = streamText({
    model: getModel(clientModel),
    system,
    messages: await convertToModelMessages(messages),
    tools,
  });

  return result.toUIMessageStreamResponse();
}
