import { describe, it, expect } from 'vitest';
import { mainMenu, modeBadge, agentRow, formatStatus } from '../src/telegram/ui.js';

describe('modeBadge', () => {
  it('shows observe/active and dry-run state', () => {
    expect(modeBadge('observe', true)).toContain('👁');
    expect(modeBadge('active', false)).toContain('⚡');
    expect(modeBadge('active', true)).toMatch(/dry/i);
  });
});

describe('mainMenu', () => {
  it('builds an inline keyboard with global controls', () => {
    const kb = mainMenu(['main']);
    expect(kb.inline_keyboard).toBeInstanceOf(Array);
    const flat = kb.inline_keyboard.flat();
    const data = flat.map((b) => b.callback_data);
    expect(data).toContain('cmd:status:all');
    expect(data).toContain('cmd:go:all');
    expect(data).toContain('cmd:observe:all');
    expect(data).toContain('cmd:stop:all');
  });

  it('adds a per-agent row for each label', () => {
    const kb = mainMenu(['main', 'sub1']);
    const flat = kb.inline_keyboard.flat();
    expect(flat.some((b) => b.callback_data === 'cmd:status:main')).toBe(true);
    expect(flat.some((b) => b.callback_data === 'cmd:status:sub1')).toBe(true);
  });
});

describe('agentRow', () => {
  it('makes a labelled control row for one agent', () => {
    const row = agentRow('main');
    expect(row.every((b) => b.callback_data.endsWith(':main'))).toBe(true);
  });
});

describe('formatStatus', () => {
  it('renders a rich multi-line status card', () => {
    const txt = formatStatus({
      label: 'main',
      running: true,
      mode: 'active',
      dryRun: false,
      shardId: '2',
      connected: true,
      activity: 'combat',
      level: 10,
      gold: 1234,
      hp: 45,
      maxHp: 50,
      pubkey: 'di3ekoVELU2R9gw1GoVdAzjcMGDv76iMARGF19YXNTq',
    });
    expect(txt).toContain('main');
    expect(txt).toContain('combat');
    expect(txt).toContain('1,234');
    expect(txt).toContain('di3ekoVE');
    expect(txt).toMatch(/45.*50/); // hp/maxHp
  });
  it('shows a stopped/offline state clearly', () => {
    const txt = formatStatus({ label: 'sub1', running: false, mode: 'observe', connected: false });
    expect(txt).toMatch(/stopped|offline/i);
  });
});
