import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

const isCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const allowLiveLlmTests = process.env.ALLOW_LIVE_LLM_TESTS === 'true';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    environment: 'node',
    restoreMocks: true,
    clearMocks: true,
    exclude:
      isCi && !allowLiveLlmTests
        ? ['**/*.llm.test.ts', '**/*live*.test.ts']
        : [],
  },
});
