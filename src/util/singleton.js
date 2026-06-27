import fs from 'node:fs';
import path from 'node:path';

// Single-instance guard so valora-bot can NEVER run doubled (which would cause
// Telegram 409 polling conflicts and double game logins), regardless of whether
// it's started by systemd, a shell, or a supervisor.

export function isAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0); // signal 0 = liveness probe
    return true;
  } catch (e) {
    return e.code === 'EPERM'; // exists but not ours
  }
}

export function acquireLock(lockFile) {
  try {
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  } catch {
    /* ignore */
  }
  for (let i = 0; i < 2; i++) {
    try {
      // Atomic create-exclusive: only one process can win this.
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const holder = Number((fs.readFileSync(lockFile, 'utf8') || '').trim());
      if (holder === process.pid) return true;
      if (holder && isAlive(holder)) return false;
      // stale lock from a dead pid -> remove and retry once
      try {
        fs.rmSync(lockFile, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
  return false;
}

export function releaseLock(lockFile) {
  try {
    if (!fs.existsSync(lockFile)) return;
    const holder = Number(fs.readFileSync(lockFile, 'utf8').trim());
    if (holder === process.pid) fs.rmSync(lockFile, { force: true });
  } catch {
    /* ignore */
  }
}
