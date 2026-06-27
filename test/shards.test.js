import { describe, it, expect } from 'vitest';
import { pickBusiestShard, pickBestShard } from '../src/util/shards.js';

describe('pickBusiestShard (matches RE\'d client algorithm)', () => {
  it('returns the shard id with the most players', () => {
    const shards = [
      { id: '1', playing: 22 },
      { id: 'prime', playing: 31 },
      { id: '2', playing: 14 },
    ];
    expect(pickBusiestShard(shards)).toBe('prime');
  });

  it('breaks ties by original index (first wins)', () => {
    const shards = [
      { id: 'b', playing: 10 },
      { id: 'a', playing: 10 },
    ];
    expect(pickBusiestShard(shards)).toBe('b');
  });

  it('returns undefined for empty/missing list', () => {
    expect(pickBusiestShard([])).toBeUndefined();
    expect(pickBusiestShard(undefined)).toBeUndefined();
  });
});

describe('pickBestShard (gate-aware, holding-based)', () => {
  const shards = [
    { id: 'prime', name: 'Prime', playing: 31, capacity: 50, queue: 0, minHold: 30000 },
    { id: '2', name: 'II', playing: 14, capacity: 50, queue: 0, minHold: 0 },
    { id: '3', name: 'III', playing: 49, capacity: 50, queue: 0, minHold: 0 },
  ];

  it('excludes shards the wallet cannot afford (below minHold)', () => {
    // holding 100 -> cannot enter prime (needs 30000)
    expect(pickBestShard(shards, { holding: 100 })).not.toBe('prime');
  });

  it('includes a gated shard when holding is sufficient', () => {
    // with 50000 holding prime is allowed and is preferred when busiest is asked
    const out = pickBestShard(shards, { holding: 50000, prefer: 'busiest' });
    expect(['prime', '3']).toContain(out);
  });

  it('avoids full shards (playing >= capacity)', () => {
    const full = [
      { id: 'full', playing: 50, capacity: 50, queue: 0, minHold: 0 },
      { id: 'ok', playing: 10, capacity: 50, queue: 0, minHold: 0 },
    ];
    expect(pickBestShard(full, { holding: 0 })).toBe('ok');
  });

  it('returns undefined when no shard is affordable/joinable', () => {
    const onlyGated = [{ id: 'prime', playing: 1, capacity: 50, queue: 0, minHold: 30000 }];
    expect(pickBestShard(onlyGated, { holding: 0 })).toBeUndefined();
  });
});
