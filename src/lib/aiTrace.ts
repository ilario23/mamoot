import {createHash, randomUUID} from 'node:crypto';
import {getDb} from '@/db';
import {aiTelemetryEvents} from '@/db/schema';

export interface TraceContext {
  traceId: string;
  route: string;
  startedAt: number;
}

const toFiniteInt = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value);
};

const toPayload = (payload: Record<string, unknown> | undefined) => payload ?? {};

export const createTraceContext = (route: string, request: Request): TraceContext => {
  const incoming =
    request.headers.get('x-trace-id') ??
    request.headers.get('x-request-id') ??
    null;

  return {
    traceId: incoming || randomUUID(),
    route,
    startedAt: Date.now(),
  };
};

export const promptHash = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 16);

export const logAiTrace = (
  trace: TraceContext,
  event: string,
  payload?: Record<string, unknown>,
) => {
  const now = Date.now();
  const line = {
    traceId: trace.traceId,
    route: trace.route,
    event,
    ts: now,
    elapsedMs: now - trace.startedAt,
    ...(payload ?? {}),
  };

  console.log(`[AI_TRACE] ${JSON.stringify(line)}`);

  const record = {
    id: randomUUID(),
    traceId: trace.traceId,
    route: trace.route,
    event,
    athleteId:
      typeof payload?.athleteId === 'number' && Number.isFinite(payload.athleteId)
        ? payload.athleteId
        : null,
    sessionId: typeof payload?.sessionId === 'string' ? payload.sessionId : null,
    model: typeof payload?.model === 'string' ? payload.model : null,
    promptHash: typeof payload?.promptHash === 'string' ? payload.promptHash : null,
    promptVersion:
      typeof payload?.promptVersion === 'string' ? payload.promptVersion : null,
    validatorStatus:
      typeof payload?.validatorStatus === 'string' ? payload.validatorStatus : null,
    repairReason:
      typeof payload?.repairReason === 'string' ? payload.repairReason : null,
    latencyMs: toFiniteInt(payload?.elapsedMs ?? now - trace.startedAt),
    inputTokens: toFiniteInt(payload?.inputTokens),
    outputTokens: toFiniteInt(payload?.outputTokens),
    costUsd: typeof payload?.costUsd === 'number' ? payload.costUsd : null,
    payload: toPayload(payload),
    createdAt: now,
  };

  void getDb()
    .insert(aiTelemetryEvents)
    .values(record)
    .catch(() => {
      // Never block route responses on telemetry failures.
    });
};
