import {generateObject} from 'ai';

interface RetryObjectParams<T> {
  model: Parameters<typeof generateObject>[0]['model'];
  schema: unknown;
  prompt: string;
  maxAttempts?: number;
  semanticCheck?: (value: T) => {ok: boolean; reason?: string};
}

export const generateObjectWithRetry = async <T>({
  model,
  schema,
  prompt,
  maxAttempts = 2,
  semanticCheck,
}: RetryObjectParams<T>): Promise<T> => {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const effectivePrompt =
        attempt === 1
          ? prompt
          : `${prompt}\n\nIMPORTANT RETRY INSTRUCTION:\nReturn strictly valid JSON that satisfies every schema field and preserves realistic running-coach constraints. Avoid nullable/empty mismatches and keep dates/session logic internally consistent.`;

      const result = await (generateObject as (args: {
        model: unknown;
        schema: unknown;
        prompt: string;
      }) => Promise<{object: T}>)({
        model,
        schema,
        prompt: effectivePrompt,
      });

      if (semanticCheck) {
        const semanticResult = semanticCheck(result.object);
        if (!semanticResult.ok) {
          throw new Error(
            `Semantic validation failed (attempt ${attempt}/${maxAttempts}): ${semanticResult.reason ?? 'unknown reason'}`,
          );
        }
      }

      return result.object;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        break;
      }
    }
  }

  throw lastError;
};
