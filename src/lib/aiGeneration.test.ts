import {beforeEach, describe, expect, it, vi} from 'vitest';
import {generateObjectWithRetry} from './aiGeneration';

const {generateObjectMock} = vi.hoisted(() => ({generateObjectMock: vi.fn()}));

vi.mock('ai', () => ({
  generateObject: generateObjectMock,
}));

describe('generateObjectWithRetry', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it('retries after semantic check failure and succeeds', async () => {
    generateObjectMock
      .mockResolvedValueOnce({object: {score: 1}})
      .mockResolvedValueOnce({object: {score: 3}});

    const result = await generateObjectWithRetry<{score: number}>({
      model: {id: 'mock-model'} as never,
      schema: {type: 'object'},
      prompt: 'Build output',
      maxAttempts: 2,
      semanticCheck: (value) =>
        value.score >= 2 ? {ok: true} : {ok: false, reason: 'score too low'},
    });

    expect(result.score).toBe(3);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
    expect(generateObjectMock.mock.calls[1][0].prompt).toContain(
      'IMPORTANT RETRY INSTRUCTION',
    );
  });

  it('throws when maxAttempts is invalid', async () => {
    await expect(
      generateObjectWithRetry({
        model: {id: 'mock-model'} as never,
        schema: {type: 'object'},
        prompt: 'Build output',
        maxAttempts: 0,
      }),
    ).rejects.toThrow('maxAttempts must be an integer >= 1');
  });

  it('throws the final guardrail error after exhausting attempts', async () => {
    generateObjectMock.mockResolvedValue({object: {safe: false}});

    await expect(
      generateObjectWithRetry<{safe: boolean}>({
        model: {id: 'mock-model'} as never,
        schema: {type: 'object'},
        prompt: 'Build output',
        maxAttempts: 2,
        guardrailCheck: (value) =>
          value.safe
            ? {ok: true}
            : {ok: false, reason: 'guardrail violation'},
      }),
    ).rejects.toThrow('Guardrail validation failed');
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });
});
