import { describe, it, expect, vi } from 'vitest';
import { isOwner, ConfirmRegistry, parseCommand } from '../src/telegram/control.js';

describe('isOwner', () => {
  const owners = [111, 222];
  it('accepts configured owner ids', () => {
    expect(isOwner(111, owners)).toBe(true);
  });
  it('rejects everyone else', () => {
    expect(isOwner(999, owners)).toBe(false);
  });
  it('rejects all when no owners configured (fail closed)', () => {
    expect(isOwner(111, [])).toBe(false);
  });
});

describe('parseCommand', () => {
  it('extracts command and target label', () => {
    expect(parseCommand('/status main')).toEqual({ cmd: 'status', arg: 'main', args: ['main'] });
    expect(parseCommand('/stop')).toEqual({ cmd: 'stop', arg: undefined, args: [] });
    // multi-arg commands expose the full args array (e.g. /sendval <label> <amt>)
    expect(parseCommand('/sendval sub1 110')).toEqual({ cmd: 'sendval', arg: 'sub1', args: ['sub1', '110'] });
  });
  it('strips bot @mention', () => {
    expect(parseCommand('/status@valora_bot sub1')).toEqual({ cmd: 'status', arg: 'sub1', args: ['sub1'] });
  });
  it('returns null for non-commands', () => {
    expect(parseCommand('hello')).toBeNull();
  });
});

describe('ConfirmRegistry (inline confirm for risky ops)', () => {
  it('creates a pending confirmation and resolves it on approve', async () => {
    const reg = new ConfirmRegistry();
    const { id, promise } = reg.create({ action: 'hdv_buy', detail: '100 token' });
    expect(reg.pending(id)).toBeTruthy();
    reg.approve(id);
    await expect(promise).resolves.toEqual({ confirmed: true });
    expect(reg.pending(id)).toBeFalsy();
  });

  it('rejects on decline', async () => {
    const reg = new ConfirmRegistry();
    const { id, promise } = reg.create({ action: 'withdraw' });
    reg.decline(id);
    await expect(promise).resolves.toEqual({ confirmed: false });
  });

  it('auto-declines after timeout', async () => {
    vi.useFakeTimers();
    const reg = new ConfirmRegistry();
    const { id, promise } = reg.create({ action: 'withdraw', timeoutMs: 1000 });
    vi.advanceTimersByTime(1001);
    await expect(promise).resolves.toEqual({ confirmed: false, timedOut: true });
    expect(reg.pending(id)).toBeFalsy();
    vi.useRealTimers();
  });

  it('ignores approve for unknown id', () => {
    const reg = new ConfirmRegistry();
    expect(() => reg.approve('nope')).not.toThrow();
  });
});
