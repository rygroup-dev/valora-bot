import { describe, it, expect } from 'vitest';
import { orderShardCandidates } from '../src/util/shards.js';

const shards = [
  { id: 'prime', name: 'Prime', playing: 24, capacity: 50, queue: 0, minHold: 30000 },
  { id: '1', name: 'I', playing: 18, capacity: 50, queue: 0, minHold: 0 },
  { id: '2', name: 'II', playing: 49, capacity: 50, queue: 0, minHold: 0 },
  { id: '3', name: 'III', playing: 50, capacity: 50, queue: 0, minHold: 0 }, // full
];

describe('orderShardCandidates (priority-first, server enforces gate)', () => {
  it('puts gated/priority shards first so the bot tries prime before normal', () => {
    const order = orderShardCandidates(shards);
    expect(order[0]).toBe('prime');
  });

  it('orders normal shards by busiest after priority ones', () => {
    const order = orderShardCandidates(shards);
    const normalPart = order.filter((id) => id !== 'prime');
    // '2' (49 playing) before '1' (18); '3' excluded (full)
    expect(normalPart[0]).toBe('2');
    expect(normalPart).toContain('1');
    expect(normalPart).not.toContain('3');
  });

  it('can skip priority shards when preferPriority=false', () => {
    const order = orderShardCandidates(shards, { preferPriority: false });
    expect(order[0]).not.toBe('prime');
    expect(order).not.toContain('prime');
  });

  it('orders multiple priority shards by minHold descending', () => {
    const s = [
      { id: 'p1', playing: 5, capacity: 50, minHold: 1000 },
      { id: 'p2', playing: 5, capacity: 50, minHold: 50000 },
      { id: 'n', playing: 5, capacity: 50, minHold: 0 },
    ];
    const order = orderShardCandidates(s);
    expect(order.slice(0, 2)).toEqual(['p2', 'p1']);
  });

  it('returns empty when all shards are full', () => {
    const full = [{ id: 'a', playing: 50, capacity: 50, minHold: 0 }];
    expect(orderShardCandidates(full)).toEqual([]);
  });
});
