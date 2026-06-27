import { describe, it, expect, vi } from 'vitest';
import { SaveManager } from '../src/state/SaveManager.js';

describe('SaveManager', () => {
  it('saves with the tracked expected version and advances on success', async () => {
    const rest = { saveCharacter: vi.fn(async () => ({ ok: true, version: 4 })) };
    const sm = new SaveManager({ rest, version: 3 });
    const r = await sm.save({ hp: 10 });
    expect(r.ok).toBe(true);
    expect(rest.saveCharacter).toHaveBeenCalledWith({ hp: 10 }, 3);
    expect(sm.version).toBe(4);
  });

  it('resolves a version conflict by adopting currentVersion and retrying', async () => {
    const rest = {
      saveCharacter: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, error: 'version_conflict', currentVersion: 9 })
        .mockResolvedValueOnce({ ok: true, version: 10 }),
    };
    const sm = new SaveManager({ rest, version: 3 });
    const r = await sm.save({ hp: 5 });
    expect(r.ok).toBe(true);
    expect(sm.version).toBe(10);
    expect(rest.saveCharacter).toHaveBeenNthCalledWith(2, { hp: 5 }, 9);
  });

  it('gives up after max retries on persistent conflict', async () => {
    const rest = {
      saveCharacter: vi.fn(async () => ({ ok: false, error: 'version_conflict', currentVersion: 1 })),
    };
    const sm = new SaveManager({ rest, version: 3, maxRetries: 2 });
    const r = await sm.save({ hp: 1 });
    expect(r.ok).toBe(false);
    expect(rest.saveCharacter).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry on non-conflict errors', async () => {
    const rest = { saveCharacter: vi.fn(async () => ({ ok: false, error: 'save_failed' })) };
    const sm = new SaveManager({ rest, version: 3 });
    const r = await sm.save({ hp: 1 });
    expect(r.ok).toBe(false);
    expect(rest.saveCharacter).toHaveBeenCalledTimes(1);
  });
});
