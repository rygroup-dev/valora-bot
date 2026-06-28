import { describe, it, expect } from 'vitest';
import { gatePasses } from '../src/game/gate.js';

// Mirrors the live client: pass when level >= minLevel and not blocked by a
// token-hold gate. gate_result = { minLevel, minHold, failLevel, failHold, tokenActive }.
describe('gatePasses', () => {
  it('passes when level meets minLevel and no active hold block', () => {
    expect(gatePasses({ minLevel: 3, tokenActive: false, failHold: false }, 5)).toBe(true);
  });
  it('fails when level is below minLevel', () => {
    expect(gatePasses({ minLevel: 5, tokenActive: false, failHold: false }, 3)).toBe(false);
  });
  it('fails when a token-hold gate is active and unmet', () => {
    expect(gatePasses({ minLevel: 1, tokenActive: true, failHold: true }, 10)).toBe(false);
  });
  it('passes a token gate when the hold is met (failHold false)', () => {
    expect(gatePasses({ minLevel: 1, tokenActive: true, failHold: false }, 10)).toBe(true);
  });
  it('treats a missing/timed-out result as passable (fallback)', () => {
    expect(gatePasses({ fallback: true }, 1)).toBe(true);
    expect(gatePasses(null, 1)).toBe(true);
  });
});
