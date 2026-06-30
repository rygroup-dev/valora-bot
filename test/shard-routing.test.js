import { describe, it, expect } from 'vitest';
import { orderShardCandidates } from '../src/util/shards.js';

const shards = [
  { id: 'prime', name: 'Prime', playing: 24, capacity: 50, queue: 0, minHold: 30000 },
  { id: '1', name: 'I', playing: 18, capacity: 50, queue: 0, minHold: 0 },
  { id: '2', name: 'II', playing: 49, capacity: 50, queue: 0, minHold: 0 },
  { id: '3', name: 'III', playing: 50, capacity: 50, queue: 0, minHold: 0 }, // full
];

describe('orderShardCandidates', () => {
  it('keeps priority mode on gated shards only', () => {
    const order = orderShardCandidates(shards, { mode: 'priority' });
    expect(order).toEqual(['prime']);
  });

  it('keeps standard mode on normal shards only, ordered by busiest', () => {
    const order = orderShardCandidates(shards, { mode: 'standard' });
    // '2' (49 playing) before '1' (18); '3' excluded (full)
    expect(order[0]).toBe('2');
    expect(order).toContain('1');
    expect(order).not.toContain('prime');
    expect(order).not.toContain('3');
  });

  it('supports legacy auto mode with priority first, then normal fallback', () => {
    const order = orderShardCandidates(shards, { mode: 'auto' });
    expect(order[0]).toBe('prime');
    expect(order).toContain('2');
    expect(order).toContain('1');
  });

  it('orders multiple priority shards by minHold descending', () => {
    const s = [
      { id: 'p1', playing: 5, capacity: 50, minHold: 1000 },
      { id: 'p2', playing: 5, capacity: 50, minHold: 50000 },
      { id: 'n', playing: 5, capacity: 50, minHold: 0 },
    ];
    const order = orderShardCandidates(s, { mode: 'priority' });
    expect(order).toEqual(['p2', 'p1']);
  });

  it('skips priority shards above the wallet token holding when known', () => {
    const s = [
      { id: 'apex', playing: 5, capacity: 50, minHold: 150000 },
      { id: 'prime', playing: 5, capacity: 50, minHold: 30000 },
      { id: 'n', playing: 5, capacity: 50, minHold: 0 },
    ];
    expect(orderShardCandidates(s, { mode: 'priority', holding: 31000 })).toEqual(['prime']);
    expect(orderShardCandidates(s, { mode: 'priority', holding: 150000 })).toEqual(['apex', 'prime']);
  });

  it('returns empty when all shards are full', () => {
    const full = [{ id: 'a', playing: 50, capacity: 50, minHold: 0 }];
    expect(orderShardCandidates(full)).toEqual([]);
  });
});
