import {NextResponse} from 'next/server';
import {createHash, randomUUID} from 'node:crypto';
import {getDb} from '@/db';
import {aiTelemetryEvents} from '@/db/schema';

const stableBucket = (seed: string): number => {
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 8);
  return parseInt(hash, 16) % 100;
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({error: 'Invalid JSON body'}, {status: 400});
  }

  const parsed = body as {
    athleteId?: number;
    experimentKey?: string;
    traceId?: string;
    sessionId?: string | null;
  };
  const athleteId = parsed.athleteId;
  const experimentKey = parsed.experimentKey ?? 'weekly-plan-routing-v1';
  if (
    typeof athleteId !== 'number' ||
    !Number.isFinite(athleteId) ||
    !Number.isInteger(athleteId) ||
    athleteId <= 0
  ) {
    return NextResponse.json({error: 'athleteId required'}, {status: 400});
  }

  const bucket = stableBucket(`${experimentKey}:${athleteId}`);
  const arm = bucket < 50 ? 'control' : 'candidate';
  const now = Date.now();

  try {
    const db = getDb();
    await db.insert(aiTelemetryEvents).values({
      id: randomUUID(),
      traceId: parsed.traceId ?? randomUUID(),
      route: 'ai.experiments',
      event: 'assignment',
      athleteId,
      sessionId: parsed.sessionId ?? null,
      model: null,
      promptHash: null,
      promptVersion: 'exp-routing-v1',
      validatorStatus: 'assigned',
      repairReason: null,
      latencyMs: 0,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      payload: {
        experimentKey,
        arm,
        bucket,
      },
      createdAt: now,
    });
  } catch {
    return NextResponse.json({error: 'Failed to persist experiment assignment'}, {status: 500});
  }

  return NextResponse.json({
    experimentKey,
    arm,
    bucket,
  });
}
