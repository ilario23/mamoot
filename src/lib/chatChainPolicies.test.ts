import {describe, expect, it} from 'vitest';
import {
  buildFallbackFollowUps,
  isAdvisoryIntent,
  sanitizeExplicitContext,
  shouldRequireRetrieval,
} from './chatChainPolicies';

describe('chat chain policies', () => {
  it('detects advisory intent from coaching request text', () => {
    expect(
      isAdvisoryIntent('Can you adjust my workout pace for tomorrow?'),
    ).toBe(true);
    expect(isAdvisoryIntent('thanks, got it')).toBe(false);
  });

  it('requires retrieval only for advisory intents with athlete context', () => {
    expect(
      shouldRequireRetrieval({
        persona: 'coach',
        athleteId: 1,
        advisoryIntent: true,
      }),
    ).toBe(true);
    expect(
      shouldRequireRetrieval({
        persona: 'coach',
        athleteId: null,
        advisoryIntent: true,
      }),
    ).toBe(false);
    expect(
      shouldRequireRetrieval({
        persona: 'coach',
        athleteId: 1,
        advisoryIntent: false,
      }),
    ).toBe(false);
  });

  it('returns bounded fallback follow-ups', () => {
    const followUps = buildFallbackFollowUps('nutritionist');
    expect(followUps.length).toBeGreaterThanOrEqual(2);
    expect(followUps.length).toBeLessThanOrEqual(3);
    for (const item of followUps) {
      expect(item.trim().split(/\s+/).length).toBeLessThanOrEqual(8);
    }
  });

  it('caps explicit context deterministically', () => {
    const oversized = Array.from({length: 12}).map((_, index) => ({
      categoryId: `ctx-${index}`,
      label: `Context ${index}`,
      data: 'x'.repeat(3000),
    }));
    const result = sanitizeExplicitContext(oversized);
    expect(result.capped).toBe(true);
    expect(result.finalItems).toBeLessThanOrEqual(8);
    expect(result.finalChars).toBeLessThanOrEqual(12000);
  });
});
