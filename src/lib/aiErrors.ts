export type AiErrorCode =
  | 'invalid_json_body'
  | 'invalid_request_body'
  | 'invalid_persona'
  | 'orchestrator_disabled'
  | 'messages_required'
  | 'orchestrator_context_required'
  | 'athlete_id_required'
  | 'goal_fields_required'
  | 'adaptation_type_required'
  | 'source_plan_not_found'
  | 'source_block_not_found'
  | 'generation_failed';

export interface AiErrorPayload {
  error: string;
  code: AiErrorCode;
  recoveryActions: string[];
  issues?: string[];
  clarification?: string;
}

export interface AiClientError extends AiErrorPayload {
  status: number;
  traceId: string | null;
}

const AI_ERROR_RECOVERY_ACTIONS: Record<AiErrorCode, string[]> = {
  invalid_json_body: ['Retry request', 'Refresh page and try again'],
  invalid_request_body: ['Check required fields', 'Retry request'],
  invalid_persona: ['Switch persona', 'Start a new chat session'],
  orchestrator_disabled: ['Switch to Coach/Nutrition/Physio', 'Ask admin to enable orchestrator'],
  messages_required: ['Send a message first', 'Retry request'],
  orchestrator_context_required: ['Open orchestrator conversation from AI Team', 'Retry request'],
  athlete_id_required: ['Reconnect athlete account', 'Refresh page and retry'],
  goal_fields_required: ['Fill goal event and date', 'Retry generation'],
  adaptation_type_required: ['Select adaptation mode', 'Retry adaptation'],
  source_plan_not_found: ['Generate full weekly plan first', 'Retry remaining-days mode'],
  source_block_not_found: ['Create a training block first', 'Retry adaptation'],
  generation_failed: ['Retry generation', 'Try another model', 'Use x-trace-id for support'],
};

const FALLBACK_RECOVERY_ACTIONS = ['Retry request'];

export const getAiErrorRecoveryActions = (code: AiErrorCode): string[] =>
  AI_ERROR_RECOVERY_ACTIONS[code] ?? FALLBACK_RECOVERY_ACTIONS;

export const createAiErrorPayload = (
  code: AiErrorCode,
  error: string,
  extras?: Partial<Pick<AiErrorPayload, 'issues' | 'clarification'>>,
): AiErrorPayload => ({
  error,
  code,
  recoveryActions: getAiErrorRecoveryActions(code),
  ...(extras ?? {}),
});

const isAiErrorCode = (value: unknown): value is AiErrorCode =>
  typeof value === 'string' && value in AI_ERROR_RECOVERY_ACTIONS;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const parseAiErrorFromUnknown = (
  input: unknown,
  fallbackMessage = 'Something went wrong. Please try again.',
): AiErrorPayload => {
  if (!isRecord(input)) {
    return createAiErrorPayload('generation_failed', fallbackMessage);
  }

  const maybeCode = input.code;
  const maybeError = input.error;
  const maybeRecoveryActions = input.recoveryActions;

  const code = isAiErrorCode(maybeCode) ? maybeCode : 'generation_failed';
  const error = typeof maybeError === 'string' ? maybeError : fallbackMessage;
  const recoveryActions = Array.isArray(maybeRecoveryActions)
    ? maybeRecoveryActions.filter(
        (action): action is string => typeof action === 'string',
      )
    : [];

  return {
    error,
    code,
    recoveryActions:
      recoveryActions.length > 0
        ? recoveryActions
        : getAiErrorRecoveryActions(code),
    ...(Array.isArray(input.issues)
      ? {
          issues: input.issues.filter(
            (issue): issue is string => typeof issue === 'string',
          ),
        }
      : {}),
    ...(typeof input.clarification === 'string'
      ? {clarification: input.clarification}
      : {}),
  };
};
