import { describe, it, expect } from 'vitest';
import { Agent, shouldTelegramNotify } from '../src/Agent.js';

describe('Telegram notification filter', () => {
  it('allows only fight and sold-HDV events', () => {
    expect(shouldTelegramNotify('⚔️ engaging champi_o (lvl 4)')).toBe(true);
    expect(shouldTelegramNotify('⚔️ fight won +10xp [#1]')).toBe(true);
    expect(shouldTelegramNotify('💀 fight lost')).toBe(true);
    expect(shouldTelegramNotify('💸 HDV sale: wood_ash for $VALORA')).toBe(true);

    expect(shouldTelegramNotify('🏷 listed on HDV for $VALORA')).toBe(false);
    expect(shouldTelegramNotify('🍳 crafting HP food dish_minnow ×2 @cuisine')).toBe(false);
    expect(shouldTelegramNotify('💰 selling 63 items (8 types) to broker')).toBe(false);
    expect(shouldTelegramNotify('🔁 reconnected to prime')).toBe(false);
  });
});

describe('bridge status text', () => {
  it('shows the live config source and selected server', async () => {
    const agent = Object.assign(Object.create(Agent.prototype), {
      label: 'main',
      shardId: 'prime',
      _shards: [{ id: 'prime', name: 'Valdoria Prime' }],
      hdvConfig: { goldBridge: true, tokenUsd: 0.00018, goldPerToken: 2500 },
      _hdvConfigAt: Date.now() - 1500,
      _gold: () => 1234,
      tokenBalance: async () => 31000,
    });

    const text = await agent.bridgeText();
    expect(text).toContain('Agent: *main* · server: Valdoria Prime');
    expect(text).toContain('Status: 🟢 ENABLED');
    expect(text).toContain('Data: hdv_config');
    expect(text).toContain('$VALORA ≈ $0.00018');
    expect(text).toContain('2,500 gold / $VALORA');
  });

  it('does not report disabled while waiting for the live config', async () => {
    const agent = Object.assign(Object.create(Agent.prototype), {
      label: 'main',
      shardId: 'prime',
      _shards: [],
      _gold: () => 0,
      tokenBalance: async () => null,
    });

    const text = await agent.bridgeText();
    expect(text).toContain('Status: 🟡 syncing live config');
    expect(text).toContain('Data: waiting');
  });
});

describe('agent telemetry formatting', () => {
  it('reports live pods and fallback pods', () => {
    const live = Object.assign(Object.create(Agent.prototype), {
      _pods: { used: 91, max: 100 },
      _inventory: () => [],
    });
    expect(live._podsText()).toBe(' (pods 91/100 91%)');

    const fallback = Object.assign(Object.create(Agent.prototype), {
      character: { save: { player: { podsMax: 10 } } },
      _inventory: () => [{ id: 'wood_ash' }, { id: 'wood_oak' }],
    });
    expect(fallback._podsText()).toBe(' (pods 2/10 20% fallback)');
  });

  it('reports HDV slots when the server exposes slot telemetry', () => {
    const agent = Object.assign(Object.create(Agent.prototype), {
      hdvConfig: { listingLimit: 10 },
    });

    expect(agent._hdvSlotText({ activeListings: 9, maxListings: 10 })).toBe(' (HDV slots 9/10)');
    expect(agent._hdvSlotText({})).toBe(' (HDV slots ?/10)');
    expect(agent._hdvSlotText({ mineCount: 3 })).toBe(' (HDV slots 3/10)');
  });
});
