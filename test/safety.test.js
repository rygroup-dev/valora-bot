import { describe, it, expect } from 'vitest';
import { Safety, RISKY_ACTIONS } from '../src/safety/Safety.js';

describe('Safety modes', () => {
  it('blocks all writes in observe mode', () => {
    const s = new Safety({ mode: 'observe' });
    expect(s.canWrite('move').ok).toBe(false);
    expect(s.canWrite('harvest').ok).toBe(false);
  });

  it('allows non-risky writes in active mode', () => {
    const s = new Safety({ mode: 'active' });
    expect(s.canWrite('move').ok).toBe(true);
    expect(s.canWrite('harvest').ok).toBe(true);
  });

  it('blocks risky on-chain writes unless explicitly confirmed', () => {
    const s = new Safety({ mode: 'active' });
    for (const a of RISKY_ACTIONS) {
      expect(s.canWrite(a).ok).toBe(false);
      expect(s.canWrite(a, { confirmed: true }).ok).toBe(true);
    }
  });

  it('simulates writes in dry-run mode (allowed but flagged)', () => {
    const s = new Safety({ mode: 'active', dryRun: true });
    const r = s.canWrite('harvest');
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
  });
});

describe('Safety kill-switch', () => {
  it('blocks every write when tripped', () => {
    const s = new Safety({ mode: 'active' });
    s.kill('manual stop');
    expect(s.canWrite('move').ok).toBe(false);
    expect(s.canWrite('harvest', { confirmed: true }).ok).toBe(false);
  });
  it('can be reset', () => {
    const s = new Safety({ mode: 'active' });
    s.kill();
    s.resume();
    expect(s.canWrite('move').ok).toBe(true);
  });
});

describe('Safety denied-backoff', () => {
  it('escalates backoff on repeated denials and resets on success', () => {
    const s = new Safety({ mode: 'active' });
    const b1 = s.recordDenied('harvest');
    const b2 = s.recordDenied('harvest');
    expect(b2).toBeGreaterThan(b1);
    s.recordSuccess('harvest');
    expect(s.deniedCount('harvest')).toBe(0);
  });
  it('tracks denials independently per action', () => {
    const s = new Safety({ mode: 'active' });
    s.recordDenied('harvest');
    expect(s.deniedCount('hdv_buy')).toBe(0);
  });
});
