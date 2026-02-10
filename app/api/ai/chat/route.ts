import {streamText, convertToModelMessages, type UIMessage} from 'ai';
import {openai} from '@ai-sdk/openai';
import {anthropic} from '@ai-sdk/anthropic';
import {getSystemPrompt, isValidPersona} from '@/lib/aiPrompts';

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
  }: {
    messages: UIMessage[];
    persona: string;
    athleteContext: string | null;
    coachPlan?: string | null;
    memory?: string | null;
    model?: string;
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

  const result = streamText({
    model: getModel(clientModel),
    system,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
