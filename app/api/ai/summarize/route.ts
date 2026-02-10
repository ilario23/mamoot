import {generateText} from 'ai';
import {openai} from '@ai-sdk/openai';

// Allow up to 30 seconds for summary generation
export const maxDuration = 30;

const SUMMARY_PROMPT = `You are a concise note-taker for a running coaching team. Your job is to compress a conversation between an AI coach/specialist and an athlete into a compact memory summary.

Capture the following if present:
- Key athlete goals and preferences mentioned
- Training plans and decisions made
- Important advice or recommendations given
- Action items or next steps agreed upon
- Injury concerns or health notes
- Nutrition strategies discussed
- Any specific race targets, dates, or milestones

Rules:
- Maximum 500 words
- Use bullet points for clarity
- Write in third person (e.g., "The athlete wants to...")
- Preserve specific numbers (paces, distances, dates, HR values)
- If an existing summary is provided, merge new information into it — don't repeat, update
- Omit small talk and greetings`;

export async function POST(req: Request) {
  let body: {
    messages: {role: string; content: string}[];
    existingSummary?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({error: 'Invalid JSON'}),
      {status: 400, headers: {'Content-Type': 'application/json'}},
    );
  }

  const {messages, existingSummary} = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({error: 'messages array required'}),
      {status: 400, headers: {'Content-Type': 'application/json'}},
    );
  }

  // Build the conversation text to summarize
  const conversationText = messages
    .map((m) => `${m.role === 'user' ? 'Athlete' : 'AI'}: ${m.content}`)
    .join('\n\n');

  const userPrompt = existingSummary
    ? `Here is the existing summary to update:\n\n${existingSummary}\n\n---\n\nHere are the new messages to incorporate:\n\n${conversationText}`
    : `Summarize this conversation:\n\n${conversationText}`;

  try {
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: SUMMARY_PROMPT,
      prompt: userPrompt,
    });

    return new Response(
      JSON.stringify({summary: result.text}),
      {status: 200, headers: {'Content-Type': 'application/json'}},
    );
  } catch (error) {
    console.error('[AI Summarize]', error);
    return new Response(
      JSON.stringify({error: 'Summary generation failed'}),
      {status: 500, headers: {'Content-Type': 'application/json'}},
    );
  }
}
