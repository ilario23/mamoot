import {generateObject} from 'ai';

interface RetryObjectParams<T> {
  model: Parameters<typeof generateObject>[0]['model'];
  schema: unknown;
  prompt: string;
  maxAttempts?: number;
  semanticCheck?: (value: T) => {ok: boolean; reason?: string};
  guardrailCheck?: (value: T) => {ok: boolean; reason?: string};
}

export const generateObjectWithRetry = async <T>({
  model,
  schema,
  prompt,
  maxAttempts = 2,
  semanticCheck,
  guardrailCheck,
}: RetryObjectParams<T>): Promise<T> => {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('maxAttempts must be an integer >= 1');
  }

  let lastError: unknown = null;
  let retryReason: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const effectivePrompt =
        attempt === 1
          ? prompt
          : `${prompt}\n\nIMPORTANT RETRY INSTRUCTION:\nReturn strictly valid JSON that satisfies every schema field and preserves realistic running-coach constraints. Avoid nullable/empty mismatches and keep dates/session logic internally consistent.\n\nPrevious output failed validation due to:\n${retryReason ?? 'unknown validation issue'}\n\nRepair only what is needed while keeping all valid sections coherent.`;

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
          retryReason = semanticResult.reason ?? 'semantic validation failure';
          throw new Error(
            `Semantic validation failed (attempt ${attempt}/${maxAttempts}): ${semanticResult.reason ?? 'unknown reason'}`,
          );
        }
      }

      if (guardrailCheck) {
        const guardrailResult = guardrailCheck(result.object);
        if (!guardrailResult.ok) {
          retryReason = guardrailResult.reason ?? 'guardrail validation failure';
          throw new Error(
            `Guardrail validation failed (attempt ${attempt}/${maxAttempts}): ${guardrailResult.reason ?? 'unknown reason'}`,
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

  throw lastError instanceof Error
    ? lastError
    : new Error('generateObjectWithRetry failed without a captured error');
};
