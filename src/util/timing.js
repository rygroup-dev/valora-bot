// Anti-ban timing helpers: human-like jitter, exponential backoff, delays.

export function jitter(min, max) {
  if (max <= min) return min;
  return Math.floor(min + Math.random() * (max - min + 1)) > max
    ? max
    : Math.floor(min + Math.random() * (max - min));
}

export function backoff(attempt, { base = 1000, cap = 30000, jitterRatio = 0.3 } = {}) {
  const raw = Math.min(cap, base * 2 ** attempt);
  if (jitterRatio <= 0) return raw;
  const delta = raw * jitterRatio;
  const v = raw - delta + Math.random() * (2 * delta);
  return Math.max(0, Math.min(cap * (1 + jitterRatio), v));
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function humanDelay(min, max) {
  return sleep(jitter(min, max));
}
