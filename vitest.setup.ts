import {beforeEach, vi} from 'vitest';

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
