import {beforeEach, vi} from 'vitest';

const isCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const allowLiveLlmTests = process.env.ALLOW_LIVE_LLM_TESTS === 'true';

if (isCi && !allowLiveLlmTests) {
  vi.mock('@ai-sdk/openai', () => ({
    openai: () => {
      throw new Error(
        'Live LLM calls are disabled in CI tests. Use mocks or set ALLOW_LIVE_LLM_TESTS=true.',
      );
    },
  }));
  vi.mock('@ai-sdk/anthropic', () => ({
    anthropic: () => {
      throw new Error(
        'Live LLM calls are disabled in CI tests. Use mocks or set ALLOW_LIVE_LLM_TESTS=true.',
      );
    },
  }));
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error(
        'Network calls are blocked in offline tests. Stub fetch explicitly in this test.',
      );
    }),
  );
});
