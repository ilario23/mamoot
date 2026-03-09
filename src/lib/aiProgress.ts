export type AiProgressPhase =
  | 'context'
  | 'coach'
  | 'physio'
  | 'repair'
  | 'merge'
  | 'save'
  | 'done'
  | 'error';

export type AiProgressEventType = 'progress' | 'done' | 'error';

export interface AiProgressEvent<TMeta = unknown, TPayload = unknown> {
  type: AiProgressEventType;
  phase: AiProgressPhase;
  message: string;
  timestamp: number;
  meta?: TMeta;
  payload?: TPayload;
}

export interface SseParseResult<T = unknown> {
  events: T[];
  remainder: string;
}

const END_OF_EVENT = '\n\n';

export const encodeSseEvent = <T>(event: T, eventName?: string): string => {
  const lines: string[] = [];
  if (eventName) {
    lines.push(`event: ${eventName}`);
  }
  lines.push(`data: ${JSON.stringify(event)}`);
  return `${lines.join('\n')}\n\n`;
};

export const parseSseChunks = <T>(
  buffer: string,
  chunk: string,
): SseParseResult<T> => {
  const joined = (buffer + chunk).replace(/\r\n/g, '\n');
  const rawEvents = joined.split(END_OF_EVENT);
  const remainder = rawEvents.pop() ?? '';
  const events: T[] = [];

  for (const rawEvent of rawEvents) {
    if (!rawEvent.trim()) continue;

    const lines = rawEvent.split('\n');
    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());

    if (dataLines.length === 0) continue;

    const payload = dataLines.join('\n');
    try {
      events.push(JSON.parse(payload) as T);
    } catch {
      // Ignore malformed event and continue processing stream.
    }
  }

  return {events, remainder};
};
