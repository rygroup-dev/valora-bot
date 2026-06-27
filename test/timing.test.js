import { describe, it, expect } from 'vitest';
import { jitter, backoff, humanDelay } from '../src/util/timing.js';

describe('jitter', () => {
  it('stays within [min,max]', () => {
    for (let i = 0; i < 200; i++) {
      const v = jitter(800, 2600);
      expect(v).toBeGreaterThanOrEqual(800);
      expect(v).toBeLessThanOrEqual(2600);
    }
  });
  it('returns min when min===max', () => {
    expect(jitter(500, 500)).toBe(500);
  });
});

describe('backoff (exponential with cap and jitter)', () => {
  it('grows with attempt and never exceeds cap', () => {
    const base = 1000, cap = 30000;
    for (let attempt = 0; attempt < 12; attempt++) {
      const v = backoff(attempt, { base, cap, jitterRatio: 0 });
      expect(v).toBeLessThanOrEqual(cap);
      expect(v).toBeGreaterThanOrEqual(base);
    }
    expect(backoff(0, { base, cap, jitterRatio: 0 })).toBe(base);
    expect(backoff(1, { base, cap, jitterRatio: 0 })).toBe(2000);
    expect(backoff(2, { base, cap, jitterRatio: 0 })).toBe(4000);
  });
  it('applies jitter within ratio bounds', () => {
    const v = backoff(3, { base: 1000, cap: 100000, jitterRatio: 0.5 });
    // base for attempt 3 = 8000; jitter ±50% => [4000, 12000]
    expect(v).toBeGreaterThanOrEqual(4000);
    expect(v).toBeLessThanOrEqual(12000);
  });
});

describe('humanDelay', () => {
  it('resolves after roughly the requested jittered time', async () => {
    const t0 = Date.now();
    await humanDelay(20, 40);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(18);
  });
});
