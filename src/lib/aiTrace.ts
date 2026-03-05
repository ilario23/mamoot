import {createHash, randomUUID} from 'node:crypto';

export interface TraceContext {
  traceId: string;
  route: string;
  startedAt: number;
}

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
  const line = {
    traceId: trace.traceId,
    route: trace.route,
    event,
    ts: Date.now(),
    elapsedMs: Date.now() - trace.startedAt,
    ...(payload ?? {}),
  };

  console.log(`[AI_TRACE] ${JSON.stringify(line)}`);
};
