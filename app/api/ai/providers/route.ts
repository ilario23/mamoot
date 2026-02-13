// GET /api/ai/providers
// Returns which AI providers have API keys configured so the client
// can filter the model dropdown accordingly.

import {NextResponse} from 'next/server';

export async function GET() {
  const providers: string[] = ['OpenAI']; // Always available (app requires it)

  if (process.env.ANTHROPIC_API_KEY) {
    providers.push('Anthropic');
  }

  return NextResponse.json({providers});
}
