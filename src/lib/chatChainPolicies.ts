import type {UIMessage} from 'ai';
import type {ResolvedMention} from '@/lib/mentionTypes';

const EXPLICIT_CONTEXT_MAX_ITEMS = 8;
const EXPLICIT_CONTEXT_MAX_ITEM_CHARS = 4000;
const EXPLICIT_CONTEXT_MAX_TOTAL_CHARS = 12000;

const ADVISORY_INTENT_RE =
  /\b(plan|workout|session|pace|zone|hydration|fuel|nutrition|injury|recover|recovery|adjust|modify|analyze|review|recommend|should i|what should)\b/i;

const trimToLength = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 19))}\n...[truncated]`;
};

export const getMessageText = (message: UIMessage): string =>
  message.parts
    ?.filter((part): part is {type: 'text'; text: string} => part.type === 'text')
    .map((part) => part.text)
    .join('') ?? '';

export const sanitizeExplicitContext = (
  explicitContext: ResolvedMention[] | null | undefined,
) => {
  if (!explicitContext || explicitContext.length === 0) {
    return {
      context: [] as ResolvedMention[],
      capped: false,
      originalItems: 0,
      finalItems: 0,
      originalChars: 0,
      finalChars: 0,
    };
  }

  const cappedItems = explicitContext.slice(0, EXPLICIT_CONTEXT_MAX_ITEMS);
  const sanitized: ResolvedMention[] = [];
  let totalChars = 0;

  for (const item of cappedItems) {
    const perItem = trimToLength(item.data ?? '', EXPLICIT_CONTEXT_MAX_ITEM_CHARS);
    if (totalChars >= EXPLICIT_CONTEXT_MAX_TOTAL_CHARS) break;
    const remaining = EXPLICIT_CONTEXT_MAX_TOTAL_CHARS - totalChars;
    const finalData = trimToLength(perItem, remaining);
    sanitized.push({...item, data: finalData});
    totalChars += finalData.length;
  }

  const originalChars = explicitContext.reduce(
    (sum, item) => sum + (item.data?.length ?? 0),
    0,
  );
  const finalChars = sanitized.reduce(
    (sum, item) => sum + (item.data?.length ?? 0),
    0,
  );

  return {
    context: sanitized,
    capped:
      explicitContext.length !== sanitized.length || originalChars !== finalChars,
    originalItems: explicitContext.length,
    finalItems: sanitized.length,
    originalChars,
    finalChars,
  };
};

export const isAdvisoryIntent = (text: string): boolean =>
  ADVISORY_INTENT_RE.test(text);

export const shouldRequireRetrieval = (params: {
  persona: string;
  athleteId?: number | null;
  advisoryIntent: boolean;
}): boolean => {
  if (!params.athleteId) return false;
  if (!params.advisoryIntent) return false;
  return (
    params.persona === 'coach' ||
    params.persona === 'nutritionist' ||
    params.persona === 'physio'
  );
};

/** Appended to the system prompt when `shouldRequireRetrieval` is true (chat route). */
export const RETRIEVAL_FIRST_SYSTEM_APPEND = `

## Retrieval-first (server-enforced)
This turn is advisory with a linked athlete. On your **first** step, call one or more **retrieval** tools and emit **no user-visible prose** until tool results return (no greeting, preamble, or advice). After tool outputs, answer normally and end with **suggestFollowUps** as usual.`;

/** Appended on a single automatic retry after a retrieval-first guardrail violation. */
export const RETRIEVAL_REPAIR_SYSTEM_APPEND = `

## Repair (retry)
Your previous attempt included assistant text before any retrieval tool ran. Retry this turn: **first step = retrieval tool call(s) only**, then give your full answer.`;

export const buildFallbackFollowUps = (persona: string): string[] => {
  if (persona === 'nutritionist') {
    return [
      'Need a pre-run meal option?',
      'Hydration targets for tomorrow?',
      'Adjust carbs for long run?',
    ];
  }
  if (persona === 'physio') {
    return [
      'Any pain pattern this week?',
      'Need a warm-up routine?',
      'Want mobility progressions?',
    ];
  }
  return [
    'Want a workout tweak?',
    'Need pacing guidance tomorrow?',
    'Review this week progress?',
  ];
};
