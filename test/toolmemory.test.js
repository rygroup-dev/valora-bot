import { describe, it, expect } from 'vitest';
import { Agent } from '../src/Agent.js';

// Regression: a stale server view (e.g. right after a cross-map rejoin) must not
// make the bot "forget" a tool it owns and permanently disable a gather kind.
function makeAgent() {
  const wallet = { label: 'test', publicKey: 'pk', };
  const config = { base: 'https://valora.gg/play', mode: 'observe', dryRun: true, pacing: { actionMin: 1, actionMax: 1 } };
  const store = { get: () => null, set: () => {} };
  const bot = { broadcast() {}, requestConfirm: async () => ({ confirmed: false }) };
  return new Agent({ wallet, config, store, bot, log: () => {} });
}

describe('tool ownership survives a stale view', () => {
  it('remembers a tool kind even after the inventory view drops it', () => {
    const a = makeAgent();
    a._serverInventory = [{ id: 'bucheron_axe', qty: 1 }, { id: 'fishing_rod', qty: 1 }];
    a._serverEquipped = {};
    expect(a._toolKinds().has('wood')).toBe(true);
    expect(a._toolKinds().has('fish')).toBe(true);

    // View goes stale (rejoin) — tools momentarily gone from the snapshot.
    a._serverInventory = [];
    expect(a._toolKinds().has('wood')).toBe(true); // still owned (remembered)
    expect(a._ownTool('bucheron_axe')).toBe(true);
  });

  it('does not claim ownership of a tool never seen', () => {
    const a = makeAgent();
    a._serverInventory = [];
    a._serverEquipped = {};
    expect(a._ownTool('mining_pick')).toBe(false);
    expect(a._toolKinds().has('mineral')).toBe(false);
  });
});
