import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireLock, releaseLock, isAlive } from '../src/util/singleton.js';

let dir, lock;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vlk-'));
  lock = path.join(dir, 'bot.lock');
});
afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
});

describe('isAlive', () => {
  it('returns true for the current process', () => {
    expect(isAlive(process.pid)).toBe(true);
  });
  it('returns false for a definitely-dead pid', () => {
    expect(isAlive(2 ** 22)).toBe(false);
  });
});

describe('singleton lock', () => {
  it('acquires when no lock exists', () => {
    expect(acquireLock(lock)).toBe(true);
    expect(fs.existsSync(lock)).toBe(true);
    expect(Number(fs.readFileSync(lock, 'utf8'))).toBe(process.pid);
  });

  it('refuses when a different alive process holds the lock', () => {
    fs.writeFileSync(lock, '1'); // pid 1 (init) = always alive, not us
    expect(acquireLock(lock)).toBe(false);
  });

  it('steals a stale lock held by a dead pid', () => {
    fs.writeFileSync(lock, String(2 ** 22)); // dead pid
    expect(acquireLock(lock)).toBe(true);
    expect(Number(fs.readFileSync(lock, 'utf8'))).toBe(process.pid);
  });

  it('release removes our lock', () => {
    acquireLock(lock);
    releaseLock(lock);
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('release does not remove a lock owned by someone else', () => {
    fs.writeFileSync(lock, String(2 ** 22));
    releaseLock(lock);
    expect(fs.existsSync(lock)).toBe(true);
  });
});
